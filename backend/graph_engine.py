import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Any, Set
import networkx as nx
from pydantic import BaseModel, Field

class AstNode(BaseModel):
    node_id: str
    node_type: str  # function, route, middleware, file
    name: str
    file_path: str
    start_line: int
    end_line: int
    is_exported: bool = False
    middlewares: List[str] = Field(default_factory=list)
    route_method: Optional[str] = None
    route_path: Optional[str] = None
    code_snippet: str = ""

class CallEdge(BaseModel):
    caller_id: str
    callee_id: str
    file_path: str
    line_number: int
    call_snippet: str = ""

class FocusedSubgraph(BaseModel):
    changed_nodes: List[AstNode]
    callers: List[AstNode]
    edges: List[CallEdge]
    unprotected_entrypoints: List[AstNode]
    graph_summary: str
    ascii_tree: str

class CodeGraph:
    def __init__(self, repo_path: str):
        self.repo_path = Path(repo_path).resolve()
        self.graph = nx.DiGraph()
        self.nodes_by_id: Dict[str, AstNode] = {}
        self.files: Set[str] = set()

    def build(self):
        """Parse supported source files and build repository knowledge graph."""
        for root, dirs, files in os.walk(self.repo_path):
            # Skip node_modules, .git, venv
            dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "venv", ".venv", "__pycache__", "dist", "build"}]
            for file in files:
                if file.endswith((".js", ".jsx", ".ts", ".tsx", ".py")):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, self.repo_path).replace("\\", "/")
                    self._parse_file(rel_path, full_path)
                    
        self._resolve_calls()

    def _parse_file(self, rel_path: str, full_path: str):
        self.files.add(rel_path)
        file_node_id = f"file:{rel_path}"
        self.graph.add_node(file_node_id, type="file", path=rel_path)

        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
                lines = content.splitlines()
        except Exception:
            return

        # 1. Parse Functions
        func_re = re.compile(r"^(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)", re.MULTILINE)
        const_func_re = re.compile(r"^(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>", re.MULTILINE)

        for match in list(func_re.finditer(content)) + list(const_func_re.finditer(content)):
            name = match.group(1)
            char_idx = match.start()
            start_line = content[:char_idx].count("\n") + 1
            
            # Simple line heuristic for function boundary
            end_line = start_line
            bracket_depth = 0
            started = False
            for i in range(start_line - 1, min(len(lines), start_line + 60)):
                line = lines[i]
                bracket_depth += line.count("{") - line.count("}")
                if "{" in line:
                    started = True
                if started and bracket_depth <= 0:
                    end_line = i + 1
                    break
            if end_line == start_line:
                end_line = min(len(lines), start_line + 15)

            snippet = "\n".join(lines[start_line - 1 : end_line])
            node_id = f"func:{rel_path}:{name}"
            
            node = AstNode(
                node_id=node_id,
                node_type="function",
                name=name,
                file_path=rel_path,
                start_line=start_line,
                end_line=end_line,
                code_snippet=snippet
            )
            self.nodes_by_id[node_id] = node
            self.graph.add_node(node_id, **node.dict())
            self.graph.add_edge(file_node_id, node_id, relationship="CONTAINS")

        # 2. Parse Express / HTTP Route definitions
        route_re = re.compile(r"(?:app|router)\.(get|post|put|delete|patch)\(\s*['\"]([^'\"]+)['\"]\s*,\s*(.*?)(?=\s*=>|\s*function|\s*\(req)", re.DOTALL)
        for match in route_re.finditer(content):
            method = match.group(1).upper()
            route_path = match.group(2)
            middleware_str = match.group(3).strip()
            
            # Extract middlewares (e.g., authenticateUser)
            middlewares = [m.strip() for m in middleware_str.split(",") if m.strip() and not m.strip().startswith("//")]
            
            char_idx = match.start()
            start_line = content[:char_idx].count("\n") + 1
            
            end_line = min(len(lines), start_line + 25)
            bracket_depth = 0
            started = False
            for i in range(start_line - 1, min(len(lines), start_line + 80)):
                line = lines[i]
                bracket_depth += line.count("{") - line.count("}")
                if "{" in line:
                    started = True
                if started and bracket_depth <= 0:
                    end_line = i + 1
                    break

            snippet = "\n".join(lines[start_line - 1 : end_line])
            route_name = f"{method} {route_path}"
            node_id = f"route:{rel_path}:{method}:{route_path}"

            node = AstNode(
                node_id=node_id,
                node_type="route",
                name=route_name,
                file_path=rel_path,
                start_line=start_line,
                end_line=end_line,
                route_method=method,
                route_path=route_path,
                middlewares=middlewares,
                code_snippet=snippet
            )
            self.nodes_by_id[node_id] = node
            self.graph.add_node(node_id, **node.dict())
            self.graph.add_edge(file_node_id, node_id, relationship="CONTAINS")

    def _resolve_calls(self):
        """Cross-reference function calls from routes and functions to target functions."""
        for caller_id, caller_node in list(self.nodes_by_id.items()):
            caller_snippet = caller_node.code_snippet
            for target_id, target_node in self.nodes_by_id.items():
                if caller_id == target_id:
                    continue
                # If target function name is invoked in caller snippet
                pattern = rf"\b{re.escape(target_node.name)}\s*\("
                if re.search(pattern, caller_snippet):
                    self.graph.add_edge(
                        caller_id,
                        target_id,
                        relationship="CALLS",
                        file_path=caller_node.file_path,
                        line=caller_node.start_line
                    )

    def get_focused_subgraph(self, changed_files: List[Any]) -> FocusedSubgraph:
        """Given a list of changed files and line ranges, extract callers, callees, and unprotected routes."""
        changed_nodes: List[AstNode] = []
        changed_node_ids: Set[str] = set()

        for f_diff in changed_files:
            file_path = f_diff.file_path
            line_ranges = getattr(f_diff, "modified_line_ranges", [])
            for node_id, node in self.nodes_by_id.items():
                if node.file_path == file_path:
                    # Check overlap with any modified range
                    for start_l, end_l in line_ranges:
                        if not (node.end_line < start_l or node.start_line > end_l):
                            if node_id not in changed_node_ids:
                                changed_nodes.append(node)
                                changed_node_ids.add(node_id)
                                break

        # If line ranges didn't hit a function, include all functions in changed files
        if not changed_nodes:
            for f_diff in changed_files:
                for node_id, node in self.nodes_by_id.items():
                    if node.file_path == f_diff.file_path and node_id not in changed_node_ids:
                        changed_nodes.append(node)
                        changed_node_ids.add(node_id)

        # Trace upstream callers (who calls these changed nodes?)
        callers: List[AstNode] = []
        edges: List[CallEdge] = []
        unprotected: List[AstNode] = []
        seen_callers: Set[str] = set()

        for c_node in changed_nodes:
            # Query predecessors in DiGraph
            if self.graph.has_node(c_node.node_id):
                for pred_id in self.graph.predecessors(c_node.node_id):
                    edge_data = self.graph.get_edge_data(pred_id, c_node.node_id)
                    if edge_data and edge_data.get("relationship") == "CALLS":
                        caller_node = self.nodes_by_id.get(pred_id)
                        if caller_node and caller_node.node_id not in seen_callers:
                            seen_callers.add(caller_node.node_id)
                            callers.append(caller_node)
                            
                            edges.append(CallEdge(
                                caller_id=caller_node.node_id,
                                callee_id=c_node.node_id,
                                file_path=caller_node.file_path,
                                line_number=caller_node.start_line,
                                call_snippet=caller_node.code_snippet
                            ))
                            
                            # Check if caller is an unprotected HTTP route
                            if caller_node.node_type == "route":
                                has_auth = any("auth" in m.lower() or "token" in m.lower() or "jwt" in m.lower() for m in caller_node.middlewares)
                                if not has_auth:
                                    unprotected.append(caller_node)

        # Build readable graph summary and ASCII tree
        summary_lines = [
            f"Graph Analysis: Identified {len(changed_nodes)} changed component(s), {len(callers)} upstream caller(s)."
        ]
        
        tree_lines = ["Repository Topology & Call Impact:"]
        for c_node in changed_nodes:
            tree_lines.append(f"  [MODIFIED SINK] {c_node.file_path} -> {c_node.name}() [Lines {c_node.start_line}-{c_node.end_line}]")
            c_callers = [caller for caller in callers if any(e.caller_id == caller.node_id and e.callee_id == c_node.node_id for e in edges)]
            if not c_callers:
                tree_lines.append("    └── (No external callers found in repository)")
            else:
                for idx, caller in enumerate(c_callers):
                    is_last = idx == len(c_callers) - 1
                    prefix = "    └── " if is_last else "    ├── "
                    if caller.node_type == "route":
                        auth_status = "PROTECTED [Middleware: " + ", ".join(caller.middlewares) + "]" if caller not in unprotected else "UNPROTECTED ENTRYPOINT [No Auth Middleware!]"
                        flag = "[!] " if caller in unprotected else "[+] "
                        tree_lines.append(f"{prefix}{flag}[CALLER ROUTE] {caller.file_path}: {caller.name} -> {auth_status}")
                    else:
                        tree_lines.append(f"{prefix}[CALLER FUNC] {caller.file_path}: {caller.name}()")

        if unprotected:
            summary_lines.append(f"CRITICAL TOPOLOGY ALERT: Found {len(unprotected)} unauthenticated entrypoint(s) invoking modified functions directly without validation!")

        return FocusedSubgraph(
            changed_nodes=changed_nodes,
            callers=callers,
            edges=edges,
            unprotected_entrypoints=unprotected,
            graph_summary="\n".join(summary_lines),
            ascii_tree="\n".join(tree_lines)
        )
