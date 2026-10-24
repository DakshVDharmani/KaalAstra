import subprocess
import re
from pathlib import Path
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

class DiffHunk(BaseModel):
    old_start: int
    old_length: int
    new_start: int
    new_length: int
    header: str
    lines: List[str]

class FileDiff(BaseModel):
    file_path: str
    status: str  # modified, added, deleted
    old_path: Optional[str] = None
    additions: int = 0
    deletions: int = 0
    hunks: List[DiffHunk] = Field(default_factory=list)
    raw_diff: str = ""
    modified_line_ranges: List[tuple] = Field(default_factory=list)  # [(start_line, end_line), ...]

class CommitMetadata(BaseModel):
    repo_path: str
    commit_hash: str
    short_hash: str
    parent_hash: Optional[str]
    author: str
    date: str
    message: str
    branch: str
    is_initial_commit: bool
    changed_files: List[FileDiff]
    raw_diff: str

def run_git(repo_path: str, args: List[str]) -> str:
    cmd = ["git", "-C", repo_path] + args
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"Git error ({' '.join(args)}): {res.stderr.strip()}")
    return res.stdout.strip()

def parse_unified_diff(raw_diff: str) -> List[FileDiff]:
    file_diffs: List[FileDiff] = []
    current_file: Optional[FileDiff] = None
    current_hunk: Optional[DiffHunk] = None
    
    file_header_re = re.compile(r"^diff --git a/(.*) b/(.*)$")
    hunk_header_re = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")

    for line in raw_diff.splitlines():
        file_match = file_header_re.match(line)
        if file_match:
            if current_file:
                if current_hunk:
                    current_file.hunks.append(current_hunk)
                    current_hunk = None
                file_diffs.append(current_file)
            
            old_p, new_p = file_match.groups()
            current_file = FileDiff(
                file_path=new_p,
                old_path=old_p,
                status="modified"
            )
            continue
            
        if not current_file:
            continue
            
        hunk_match = hunk_header_re.match(line)
        if hunk_match:
            if current_hunk:
                current_file.hunks.append(current_hunk)
            
            old_start = int(hunk_match.group(1))
            old_len = int(hunk_match.group(2) or 1)
            new_start = int(hunk_match.group(3))
            new_len = int(hunk_match.group(4) or 1)
            
            current_hunk = DiffHunk(
                old_start=old_start,
                old_length=old_len,
                new_start=new_start,
                new_length=new_len,
                header=line,
                lines=[]
            )
            # Record modified line range in new version
            current_file.modified_line_ranges.append((new_start, new_start + max(1, new_len) - 1))
            continue
            
        if current_hunk:
            current_hunk.lines.append(line)
            if line.startswith("+") and not line.startswith("+++"):
                current_file.additions += 1
            elif line.startswith("-") and not line.startswith("---"):
                current_file.deletions += 1
                
        if current_file:
            current_file.raw_diff += line + "\n"
            
    if current_file:
        if current_hunk:
            current_file.hunks.append(current_hunk)
        file_diffs.append(current_file)
        
    return file_diffs

def capture_commit(repo_path: str, commit_ref: str = "HEAD") -> CommitMetadata:
    repo_path = str(Path(repo_path).resolve())
    commit_hash = run_git(repo_path, ["rev-parse", commit_ref])
    short_hash = commit_hash[:7]
    branch = run_git(repo_path, ["rev-parse", "--abbrev-ref", "HEAD"])
    
    # Metadata: author, date, message
    format_str = "%an <%ae>%n%ad%n%P%n%B"
    meta_output = run_git(repo_path, ["show", "-s", f"--format={format_str}", commit_hash])
    parts = meta_output.split("\n", 3)
    author = parts[0] if len(parts) > 0 else "Unknown"
    date = parts[1] if len(parts) > 1 else ""
    parents_raw = parts[2] if len(parts) > 2 else ""
    message = parts[3].strip() if len(parts) > 3 else ""
    
    parents = parents_raw.split()
    parent_hash = parents[0] if parents else None
    is_initial = len(parents) == 0
    
    # Diff vs parent
    if is_initial:
        raw_diff = run_git(repo_path, ["show", "--format=", commit_hash])
    else:
        raw_diff = run_git(repo_path, ["diff", parent_hash, commit_hash])
        
    file_diffs = parse_unified_diff(raw_diff)
    
    return CommitMetadata(
        repo_path=repo_path,
        commit_hash=commit_hash,
        short_hash=short_hash,
        parent_hash=parent_hash,
        author=author,
        date=date,
        message=message,
        branch=branch,
        is_initial_commit=is_initial,
        changed_files=file_diffs,
        raw_diff=raw_diff
    )

