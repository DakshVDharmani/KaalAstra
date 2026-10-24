import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { KaalAstraFixItem, ScanResult, GitCommitItem } from './types';
import { WorkspaceDecorationManager } from './decorations';
import { SecurityGraphEditorPanel } from './SecurityGraphEditorPanel';
import { CodingAgent, defaultModels } from './CodingAgent';

export class CodeFixViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kaalastra.sidebarView';
  private _view?: vscode.WebviewView;
  private _currentScan?: ScanResult;
  private _isScanning = false;
  private _decorations = new WorkspaceDecorationManager();
  private readonly _codingAgent: CodingAgent;

  constructor(private readonly _extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this._codingAgent = new CodingAgent(context);
  }

  public getCurrentScan(): ScanResult | undefined {
    return this._currentScan;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'webviewReady': {
          await this.postAgentStatus();
          await this.scanRepository(message.baseline || false, message.commitRef || 'HEAD', message.engine || 'hybrid');
          break;
        }
        case 'scanActiveCommit': {
          await this.scanRepository(
            message.baseline || false,
            message.commitRef || 'HEAD',
            message.engine || 'hybrid'
          );
          break;
        }

        case 'openGraphWorkspace': {
          SecurityGraphEditorPanel.createOrShow(this._extensionUri, this._currentScan);
          break;
        }

        case 'openGraphFile': {
          await this.openGraphFile();
          break;
        }

        case 'applyFix': {
          await this.proposeSingleFix(message.fixId);
          break;
        }

        case 'applyAllFixes': {
          await this.applyAllFixes();
          break;
        }
        case 'selectCodingAgent': {
          try {
            await this._codingAgent.selectProvider(message.provider);
            await this.postAgentStatus();
          } catch (error: any) {
            vscode.window.showErrorMessage(error.message);
          }
          break;
        }
        case 'setCodingKey': {
          const provider = this._codingAgent.provider;
          const key = await vscode.window.showInputBox({ prompt: `Enter ${provider} API key`, password: true, ignoreFocusOut: true });
          if (key) await this._codingAgent.setKey(provider, key);
          await this.postAgentStatus();
          break;
        }
        case 'clearCodingKey': {
          await this._codingAgent.clearKey(this._codingAgent.provider);
          await this.postAgentStatus();
          break;
        }

        case 'previewLine': {
          await this.previewLine(message.filePath, message.line);
          break;
        }

        case 'askTavily': {
          await this.handleAskTavily(
            message.snippet,
            message.fileName,
            message.question,
            message.title,
            message.cwe
          );
          break;
        }

        case 'openUrl': {
          if (message.url) {
            vscode.env.openExternal(vscode.Uri.parse(message.url));
          }
          break;
        }
      }
    });

    // Re-apply workspace red markings whenever the active editor tab changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && this._currentScan && this._currentScan.fixes.length > 0) {
        this._decorations.applyVulnerabilityMarkings(editor, this._currentScan.fixes);
      }
    });

    // Run initial scan on startup if workspace is open
    setTimeout(() => {
      this.scanRepository(false);
    }, 1200);
  }

  public async scanRepository(baseline: boolean = false, commitRef: string = 'HEAD', engine: string = 'hybrid') {
    if (this._isScanning) return;
    this._isScanning = true;

    this._view?.webview.postMessage({
      type: 'scanningStatus',
      status: 'analyzing',
      message: `Analyzing commit ${commitRef} [Mode: ${engine.toUpperCase()}]...`
    });

    const workspaceFolders = vscode.workspace.workspaceFolders;
    let targetDir = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';

    // 1. Locate backend/cli.py robustly
    let projectRoot = path.dirname(path.dirname(this._extensionUri.fsPath));
    let cliScript = path.join(projectRoot, 'backend', 'cli.py');

    const fs = require('fs');
    if (!fs.existsSync(cliScript)) {
      const candidates = [
        path.join(path.dirname(this._extensionUri.fsPath), 'backend', 'cli.py'),
        path.join(path.dirname(path.dirname(this._extensionUri.fsPath)), 'backend', 'cli.py'),
        path.join(targetDir, '..', 'backend', 'cli.py'),
        path.join(targetDir, 'backend', 'cli.py')
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          cliScript = c;
          projectRoot = path.dirname(path.dirname(c));
          break;
        }
      }
    }

    // 2. Ensure targetDir points to the target application repository
    if (path.basename(targetDir) !== 'demo-target') {
      const candidates = [
        path.join(targetDir, 'demo-target'),
        path.join(projectRoot, 'demo-target'),
        path.join(path.dirname(this._extensionUri.fsPath), 'demo-target'),
        path.join(path.dirname(path.dirname(this._extensionUri.fsPath)), 'demo-target'),
        'd:\\Avdhut\\programing\\Metro Hackathon\\demo-target'
      ];
      for (const d of candidates) {
        if (fs.existsSync(path.join(d, '.git'))) {
          targetDir = d;
          break;
        }
      }
    }

    const args = [cliScript, 'scan', targetDir];
    if (commitRef && commitRef !== 'HEAD') {
      args.push('--commit', commitRef);
    }
    if (baseline || engine === 'baseline') {
      args.push('--baseline');
    }
    args.push('--engine', engine);
    args.push('--json', '--no-verify');

    try {
      execFile('python', args, { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        this._isScanning = false;

        if (error && !stdout) {
          vscode.window.showErrorMessage(`KaalAstra Scan Error: ${stderr || error.message}`);
          this._view?.webview.postMessage({
            type: 'scanningStatus',
            status: 'error',
            message: 'Scan failed. Check terminal output.'
          });
          return;
        }

        try {
          // Locate JSON in stdout
          const startIdx = stdout.indexOf('{');
          const endIdx = stdout.lastIndexOf('}');
          if (startIdx === -1 || endIdx === -1) {
            throw new Error('No valid JSON returned from backend');
          }

          const rawJson = stdout.substring(startIdx, endIdx + 1);
          const data = JSON.parse(rawJson);

          const fixes: KaalAstraFixItem[] = [];
          for (const f of data.report?.findings || []) {
            // Extract original and fixed snippets from diff if present
            let originalCode = '';
            let fixedCode = '';
            const diff = f.patch_unified_diff || '';
            const lines = diff.split('\n');
            for (const l of lines) {
              if (l.startsWith('-') && !l.startsWith('---')) {
                originalCode += l.substring(1) + '\n';
              } else if (l.startsWith('+') && !l.startsWith('+++')) {
                fixedCode += l.substring(1) + '\n';
              }
            }

            let lineNum = 1;
            if (f.line_range) {
              const m = f.line_range.match(/\d+/);
              if (m) lineNum = parseInt(m[0], 10);
            }

            fixes.push({
              id: f.finding_id || 'KAAL-001',
              title: f.title || 'Security Regression',
              description: f.failure_mechanism || '',
              severity: (f.severity || 'HIGH').toUpperCase() as any,
              category: (f.cwe || 'Auth Bypass') as any,
              filePath: f.affected_file || f.patch_file || '',
              fileName: path.basename(f.affected_file || f.patch_file || ''),
              line: lineNum,
              originalCode,
              fixedCode,
              explanation: f.proposed_remediation || '',
              blindspot: f.why_diff_only_misses_this || '',
              cwe: f.cwe || 'CWE-306',
              verified: false,
              patchDiff: ''
            });
          }

          const changedFiles = (data.commit?.changed_files || []).map((f: any) => f.file_path);
          const gitCommits = this._getGitCommits(targetDir);
          const lifecycleGraph = this._buildLifecycleGraph(
            targetDir,
            data.commit?.commit_hash || data.commit?.short_hash || commitRef || 'b186cfb7c072',
            data.commit?.branch || 'main',
            changedFiles.length > 0 ? changedFiles : ['src/services/paymentService.js'],
            fixes,
            false
          );

          const scanResult: ScanResult = {
            commitHash: data.commit?.commit_hash || '',
            shortHash: data.commit?.short_hash || 'HEAD',
            author: data.commit?.author || 'Unknown',
            message: data.commit?.message || '',
            totalIssues: fixes.length,
            graphSummary: data.subgraph?.graph_summary || '',
            asciiTree: data.subgraph?.ascii_tree || '',
            subgraph: data.subgraph,
            lifecycleGraph: lifecycleGraph,
            gitCommits: gitCommits,
            fixes: fixes,
            verificationStatus: 'NOT_VERIFIED'
          };

          this._currentScan = scanResult;

          this._view?.webview.postMessage({
            type: 'updateFixes',
            data: scanResult
          });

          // Automatically open affected file and mark the vulnerable lines in red in workspace
          if (fixes.length > 0) {
            this.applyWorkspaceMarkings(fixes[0].filePath, fixes);
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to parse KaalAstra output: ${err.message}`);
        }
      });
    } catch (spawnErr: any) {
      this._isScanning = false;
      vscode.window.showErrorMessage(`Failed to spawn backend process: ${spawnErr.message}`);
    }
  }

  public async applyWorkspaceMarkings(filePathRel: string, fixes: KaalAstraFixItem[]) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const root = workspaceFolders[0].uri.fsPath;
    const fs = require('fs');

    let fullPath = path.join(root, filePathRel);
    if (!fs.existsSync(fullPath)) fullPath = path.join(root, 'demo-target', filePathRel);
    if (!fs.existsSync(fullPath)) fullPath = path.join(path.dirname(this._extensionUri.fsPath), 'demo-target', filePathRel);
    if (!fs.existsSync(fullPath)) fullPath = path.join(path.dirname(path.dirname(this._extensionUri.fsPath)), 'demo-target', filePathRel);

    if (fs.existsSync(fullPath)) {
      try {
        const doc = await vscode.workspace.openTextDocument(fullPath);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        this._decorations.applyVulnerabilityMarkings(editor, fixes);
      } catch (e) {
        // ignore
      }
    }
  }

  public async handleAskTavily(snippet: string, fileName: string, question: string, title: string, cwe: string) {
    this._view?.webview.postMessage({
      type: 'tavilyStatus',
      status: 'searching',
      message: 'Searching live security advisories with Tavily...'
    });

    let projectRoot = path.dirname(path.dirname(this._extensionUri.fsPath));
    let cliScript = path.join(projectRoot, 'backend', 'cli.py');
    const fs = require('fs');
    if (!fs.existsSync(cliScript)) {
      const candidates = [
        path.join(path.dirname(this._extensionUri.fsPath), 'backend', 'cli.py'),
        path.join(path.dirname(path.dirname(this._extensionUri.fsPath)), 'backend', 'cli.py'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          cliScript = c;
          projectRoot = path.dirname(path.dirname(c));
          break;
        }
      }
    }

    const args = [
      cliScript,
      'explain',
      '--snippet', snippet || 'vulnerable code pattern',
      '--file', fileName || 'code.js',
      '--question', question || 'Why did this happen?',
      '--title', title || '',
      '--cwe', cwe || '',
      '--json'
    ];

    try {
      execFile('python', args, { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && !stdout) {
          this._view?.webview.postMessage({
            type: 'tavilyStatus',
            status: 'error',
            message: `Tavily Research Error: ${stderr || err.message}`
          });
          return;
        }

        try {
          const startIdx = stdout.indexOf('{');
          const endIdx = stdout.lastIndexOf('}');
          const rawJson = stdout.substring(startIdx, endIdx + 1);
          const result = JSON.parse(rawJson);

          this._view?.webview.postMessage({
            type: 'tavilyResult',
            data: result
          });
        } catch (e: any) {
          this._view?.webview.postMessage({
            type: 'tavilyStatus',
            status: 'error',
            message: `Failed to parse Tavily explanation: ${e.message}`
          });
        }
      });
    } catch (spawnErr: any) {
      this._view?.webview.postMessage({
        type: 'tavilyStatus',
        status: 'error',
        message: `Tavily process error: ${spawnErr.message}`
      });
    }
  }

  public sendSnapshotToTavily(snippet: string, fileName: string, line: number) {
    this._view?.show?.(true);
    this._view?.webview.postMessage({
      type: 'setSnapshot',
      data: {
        snippet,
        fileName,
        line,
        title: `Selection from ${fileName}:${line}`,
        cwe: 'Code Analysis',
        autoAsk: true,
        question: 'Why did this happen or how to make this code secure?'
      }
    });
  }

  public async previewLine(filePathRel: string, line: number) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const root = workspaceFolders[0].uri.fsPath;

    // Check in root or in demo-target
    let targetPath = path.join(root, filePathRel);
    if (!vscode.workspace.fs) return;

    try {
      const doc = await vscode.workspace.openTextDocument(targetPath);
      const editor = await vscode.window.showTextDocument(doc);
      const targetLine = Math.max(0, line - 1);
      const pos = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch {
      // Try demo-target subfolder
      targetPath = path.join(root, 'demo-target', filePathRel);
      try {
        const doc = await vscode.workspace.openTextDocument(targetPath);
        const editor = await vscode.window.showTextDocument(doc);
        const targetLine = Math.max(0, line - 1);
        const pos = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      } catch (e: any) {
        vscode.window.showWarningMessage(`Could not locate file: ${filePathRel}`);
      }
    }
  }

  private _getGitCommits(targetDir: string): GitCommitItem[] {
    try {
      const { execFileSync } = require('child_process');
      const stdout = execFileSync('git', ['log', '-n', '8', '--pretty=format:%h|%H|%s|%an|%ad', '--date=short'], {
        cwd: targetDir,
        encoding: 'utf8'
      });
      return stdout.trim().split('\n').filter(Boolean).map((line: string) => {
        const parts = line.split('|');
        return {
          shortHash: parts[0] || '',
          hash: parts[1] || '',
          message: parts[2] || '',
          author: parts[3] || '',
          date: parts[4] || ''
        };
      });
    } catch {
      return [];
    }
  }

  private _buildLifecycleGraph(
    targetDir: string,
    commitHash: string,
    branch: string,
    changedFiles: string[],
    fixes: KaalAstraFixItem[],
    allFixed: boolean = false
  ): string {
    const fs = require('fs');
    try {
      const candidatePaths = [
        path.join(this._extensionUri.fsPath, '..', 'frontend', 'security-graph', 'graph.js'),
        path.join(path.dirname(this._extensionUri.fsPath), 'frontend', 'security-graph', 'graph.js'),
        path.join(path.dirname(this._extensionUri.fsPath), 'KaalAstra', 'frontend', 'security-graph', 'graph.js'),
      ];

      let graphModulePath = '';
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          graphModulePath = p;
          break;
        }
      }

      if (graphModulePath) {
        delete require.cache[require.resolve(graphModulePath)];
        const { buildGraph } = require(graphModulePath);

        const findingsPayload = fixes.map((f, idx) => ({
          id: f.id || `KAAL-${idx + 1}`,
          title: f.title || 'Security Regression',
          file: f.filePath,
          severity: (f.severity || 'high').toLowerCase(),
          before: f.description || f.title || 'Vulnerability introduced',
          fix: f.explanation || 'Remediation proposed',
          statusAfter: allFixed ? 'changed' : 'pending',
          verification: ''
        }));

        const snapshot = {
          commit: commitHash || 'b186cfb7c072',
          branch: branch || 'main'
        };

        const graphText = buildGraph(snapshot, changedFiles, findingsPayload);

        // Save into .kaalastra directory
        const kaalastraDir = path.join(targetDir, '.kaalastra');
        if (!fs.existsSync(kaalastraDir)) {
          fs.mkdirSync(kaalastraDir, { recursive: true });
        }
        fs.writeFileSync(path.join(kaalastraDir, 'last-run.graph'), graphText, 'utf8');
        fs.writeFileSync(path.join(kaalastraDir, 'findings.json'), JSON.stringify({ findings: findingsPayload }, null, 2), 'utf8');

        return graphText;
      }
    } catch (e: any) {
      console.error('Lifecycle graph generation error:', e);
    }
    return '';
  }

  public async openGraphFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const root = workspaceFolders[0].uri.fsPath;
    const fs = require('fs');

    let graphPath = path.join(root, '.kaalastra', 'last-run.graph');
    if (!fs.existsSync(graphPath)) graphPath = path.join(root, 'demo-target', '.kaalastra', 'last-run.graph');
    if (!fs.existsSync(graphPath)) graphPath = path.join(path.dirname(this._extensionUri.fsPath), 'demo-target', '.kaalastra', 'last-run.graph');
    if (!fs.existsSync(graphPath)) graphPath = path.join(path.dirname(path.dirname(this._extensionUri.fsPath)), 'demo-target', '.kaalastra', 'last-run.graph');

    if (fs.existsSync(graphPath)) {
      const doc = await vscode.workspace.openTextDocument(graphPath);
      await vscode.window.showTextDocument(doc);
    } else {
      vscode.window.showWarningMessage('No .graph file generated yet. Run a commit scan first.');
    }
  }

  public async applyAllFixes() {
    if (!this._currentScan || this._currentScan.fixes.length === 0) {
      vscode.window.showInformationMessage('No fixes to apply.');
      return;
    }

    for (const fix of [...this._currentScan.fixes]) {
      await this.proposeSingleFix(fix.id);
    }
  }

  private async postAgentStatus() {
    const provider = this._codingAgent.provider;
    this._view?.webview.postMessage({
      type: 'codingAgentStatus', provider,
      hasKey: await this._codingAgent.hasKey(provider),
      model: vscode.workspace.getConfiguration('kaalastra').get<string>(`codingModels.${provider}`) || defaultModels[provider]
    });
  }

  private async proposeSingleFix(fixId: string): Promise<void> {
    const fix = this._currentScan?.fixes.find(item => item.id === fixId);
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!fix || !folder) return;
    const file = path.resolve(folder.uri.fsPath, fix.filePath);
    const relative = path.relative(folder.uri.fsPath, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      vscode.window.showErrorMessage('Finding points outside the workspace.');
      return;
    }
    try {
      const document = await vscode.workspace.openTextDocument(file);
      const original = document.getText();
      if (original.length > 100_000) throw new Error('File is too large to send to the coding provider.');
      const provider = this._codingAgent.provider;
      const approved = await vscode.window.showInformationMessage(
        `Send ${relative} and the security finding to ${provider} for a proposed fix?`,
        { modal: true }, 'Send'
      );
      if (approved !== 'Send') return;
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `${provider}: preparing security fix` }, async () => {
        const proposal = await this._codingAgent.proposeEdit(relative, original, fix);
        const proposedDoc = await vscode.workspace.openTextDocument({ content: proposal, language: document.languageId });
        await vscode.commands.executeCommand('vscode.diff', document.uri, proposedDoc.uri, `KaalAstra: ${relative} (proposed ${provider} fix)`);
        const decision = await vscode.window.showInformationMessage(
          `Review the diff for ${relative}. Apply this proposed edit?`, { modal: true }, 'Apply Edit'
        );
        if (decision !== 'Apply Edit') return;
        if (document.getText() !== original) throw new Error('File changed during review. Request a new proposal.');
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(original.length)), proposal);
        if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code could not apply the edit.');
        await document.save();
        vscode.window.showInformationMessage(`Applied ${provider} proposal to ${relative}. Run tests and rescan before treating it as verified.`);
        this._currentScan!.fixes = this._currentScan!.fixes.filter(item => item.id !== fixId);
        this._currentScan!.totalIssues = this._currentScan!.fixes.length;
        this._view?.webview.postMessage({ type: 'updateFixes', data: this._currentScan });
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Coding agent: ${error.message}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>KaalAstra Sentinel</title>
</head>
<body>
  <div id="app" class="container">
    <!-- Header Controls -->
    <header class="header">
      <div class="header-top">
        <div class="title-wrap">
          <span class="icon-pulse">&#x1F6E1;&#xFE0F;</span>
          <span class="title">KaalAstra Hub</span>
        </div>
        <div class="actions">
          <button id="btnScan" class="btn btn-secondary icon-btn" title="Scan Current Commit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
          <button id="btnOpenWorkspaceGraph" class="btn btn-secondary" title="Show Security Graph in Workspace Editor Tab" style="font-size: 10px; display: inline-flex; align-items: center; gap: 3px;">
            <span>⤢ Graph</span>
          </button>
          <button id="btnBaseline" class="btn btn-secondary" title="Run Diff-Only Baseline Review" style="font-size: 10px;">
            Baseline
          </button>
          <button id="btnFixAll" class="btn btn-primary" title="Request and review a coding proposal for each finding">
            Propose All
          </button>
        </div>
      </div>

      <div class="agent-controls">
        <label for="codingAgent">Coding agent</label>
        <select id="codingAgent" class="commit-select">
          <option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option>
        </select>
        <button id="btnSetCodingKey" class="btn btn-secondary">Set API key</button>
        <button id="btnClearCodingKey" class="btn btn-secondary">Clear</button>
        <span id="codingAgentStatus">No key saved</span>
      </div>

      <!-- Commit Status Banner -->
      <div id="fileBanner" class="file-banner">
        <span class="file-icon">&#x26A1;</span>
        <span id="activeFileName" class="file-name">Target: HEAD (b186cfb)</span>
        <span id="issueCountBadge" class="badge badge-count">1 alert</span>
      </div>

      <!-- 3 Detection Engine Options Bar -->
      <div class="engine-selector-container">
        <div class="engine-selector-bar">
          <button id="btnOptHybrid" class="engine-btn active" data-engine="hybrid" title="Option 1: Hybrid Mode (AST + Graph + FinSec AI)">
            <span class="engine-icon">&#x1F310;</span> Hybrid (All)
          </button>
          <button id="btnOptFinSec" class="engine-btn" data-engine="finsec" title="Option 2: Pure FinSec-AI (elsiddik/finsec_detector only)">
            <span class="engine-icon">&#x1F916;</span> FinSec AI
          </button>
          <button id="btnOptBaseline" class="engine-btn" data-engine="baseline" title="Option 3: Diff-Only Baseline Review">
            <span class="engine-icon">&#x26A1;</span> Baseline
          </button>
        </div>
        <div id="engineStatusBanner" class="engine-status-text">Active: <b>Hybrid Sentinel</b> (AST + Graph + FinSec AI)</div>
      </div>

      <!-- Filter Tabs -->
      <div class="tabs">
        <button class="tab-btn active" data-filter="all">All <span id="countAll">(0)</span></button>
        <button class="tab-btn" data-filter="CRITICAL">Critical <span id="countCritical">(0)</span></button>
        <button class="tab-btn" data-filter="HIGH">High <span id="countHigh">(0)</span></button>
        <button class="tab-btn" data-filter="topology">Topology <span id="countTopology"></span></button>
        <button class="tab-btn" data-filter="tavily">Ask Tavily <span id="countTavily">&#x1F50D;</span></button>
      </div>
    </header>

    <!-- Empty States -->
    <div id="emptyStateNoEditor" class="empty-state hidden">
      <div class="empty-icon">&#x1F4C1;</div>
      <h3>No Commit Scanned</h3>
      <p>Click "Scan Commit" to trigger Graph-Aware Security Analysis.</p>
      <button id="btnSampleNoEditor" class="btn btn-primary btn-center">&#x26A1; Scan Commit Now</button>
    </div>

    <div id="emptyStateClean" class="empty-state hidden">
      <div class="empty-icon text-success">&#x2728;</div>
      <h3>No findings reported</h3>
      <p>The current assessment reported no issues. This does not establish that the repository is secure.</p>
    </div>

    <!-- Tavily Research Panel -->
    <div id="tavilyPanel" class="tavily-panel hidden">
      <div class="snapshot-header">
        <span>&#x1F4F8; Code Snapshot (Vulnerability Marked)</span>
        <span id="snapLocation" style="color: var(--vscode-foreground); opacity: 0.7; font-size: 10px;">Select an issue to inspect</span>
      </div>
      <div id="snapCode" class="snapshot-box">// Capture a code snippet or click "Ask Tavily" on any finding card</div>

      <div class="chips-row">
        <button class="chip" data-q="Why did this happen? Explain the root cause.">Why did this happen?</button>
        <button class="chip" data-q="What CVEs or real-world exploits match this pattern?">Related CVEs & Exploits</button>
        <button class="chip" data-q="How should this be mitigated according to official standards?">Best Practice Mitigations</button>
      </div>

      <div class="ask-form">
        <input type="text" id="tavilyQuery" class="ask-input" placeholder="Ask Tavily about this vulnerability..." value="Why did this happen?">
        <button id="btnAskTavily" class="btn btn-primary">Ask Tavily</button>
      </div>

      <div id="tavilyResultBox" class="tavily-result-box hidden">
        <div id="tavilyText" style="white-space: pre-wrap; font-size: 12px; line-height: 1.6;"></div>
        <div id="tavilySourcesList" class="source-pills"></div>
      </div>
    </div>

    <!-- Topology & Lifecycle Graphs Panel -->
    <div id="topologyPanel" class="topology-panel hidden">
      <div class="subtabs-bar">
        <button id="subtabLifecycle" class="subtab-btn active" data-sub="lifecycle">&#x1F504; Before &amp; After Flow</button>
        <button id="subtabTopology" class="subtab-btn" data-sub="topology">&#x1F578;&#xFE0F; Call Topology</button>
      </div>

      <div class="commit-toolbar">
        <div style="display: flex; align-items: center; gap: 6px; width: 100%;">
          <label style="font-size: 10px; opacity: 0.8; white-space: nowrap;">Target Commit:</label>
          <select id="commitSelector" class="commit-select">
            <option value="HEAD">HEAD (b186cfb - refactor payment)</option>
          </select>
          <button id="btnAnalyzeCommit" class="btn btn-secondary icon-btn" title="Analyze Selected Git Commit">&#x26A1;</button>
          <button id="btnOpenGraphFile" class="btn btn-secondary" title="Open .graph file in VS Code Editor" style="font-size: 10px; white-space: nowrap;">&#x1F4C4; .graph</button>
          <button id="btnOpenGraphWorkspace" class="btn btn-secondary" title="Open interactive flowchart in full editor workspace" style="font-size: 10px; white-space: nowrap; color: #38bdf8;">&#x2922; Workspace Tab</button>
        </div>
      </div>

      <!-- Subview 1: Before & After Flow (.graph) -->
      <div id="lifecycleView" class="graph-content-view">
        <div class="vgraph-mode-bar">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:11px; font-weight:600; color:var(--vscode-foreground);">Security Flow</span>
            <span id="lifecycleBadge" class="badge" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8; font-size: 9px;">COMPONENT FLOW</span>
          </div>
          <div class="vgraph-mode-toggle">
            <button id="btnModeVisual" class="mode-btn active" data-mode="visual">&#x1F3A8; Visual Graph</button>
            <button id="btnModeText" class="mode-btn" data-mode="text">&#x1F4C4; .graph Text</button>
          </div>
        </div>

        <!-- Magnificent Visual Flow Graph -->
        <div id="visualGraphBox" class="vgraph-flow"></div>

        <!-- Plain Text .graph Container (Hidden by default) -->
        <div id="lifecycleGraphBox" class="code-graph-pre hidden">Loading security lifecycle graph...</div>
      </div>

      <!-- Subview 2: Call-Graph Topology (NetworkX / AST) -->
      <div id="callTopologyView" class="graph-content-view hidden">
        <div class="vgraph-mode-bar">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:11px; font-weight:600; color:var(--vscode-foreground);">Call Topology & Attack Paths</span>
            <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-size: 9px;">ERASER FLOWCHART</span>
          </div>
          <div class="vgraph-mode-toggle">
            <button id="btnTopoVisual" class="mode-btn active" data-topomode="visual">&#x1F3A8; Flowchart</button>
            <button id="btnTopoText" class="mode-btn" data-topomode="text">&#x1F4C4; ASCII</button>
          </div>
        </div>
        <div id="visualTopologyBox" class="vgraph-flow"></div>
        <div id="callTopologyBox" class="code-graph-pre hidden">Loading call graph topology...</div>
      </div>
    </div>

    <!-- Fix Cards List -->
    <main id="fixList" class="fix-list">
      <!-- Dynamic Fix Cards will be injected here -->
    </main>

    <!-- Bottom Helper / Sample Button -->
    <footer class="footer">
      <button id="btnCreateSample" class="btn btn-ghost">
        <span>&#x1F578;&#xFE0F; View Call-Graph Topology</span>
      </button>
    </footer>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

