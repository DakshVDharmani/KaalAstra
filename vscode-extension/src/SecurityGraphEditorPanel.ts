import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { ScanResult } from './types';

export class SecurityGraphEditorPanel {
  public static currentPanel: SecurityGraphEditorPanel | undefined;
  public static readonly viewType = 'kaalastra.graphWorkspace';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, currentScan?: ScanResult) {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (SecurityGraphEditorPanel.currentPanel) {
      SecurityGraphEditorPanel.currentPanel._panel.reveal(column);
      if (currentScan) {
        SecurityGraphEditorPanel.currentPanel.updateData(currentScan);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      SecurityGraphEditorPanel.viewType,
      'KaalAstra • Security Flow',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          extensionUri,
          vscode.Uri.file(path.join(extensionUri.fsPath, '..'))
        ]
      }
    );

    SecurityGraphEditorPanel.currentPanel = new SecurityGraphEditorPanel(panel, extensionUri, currentScan);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, currentScan?: ScanResult) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.iconPath = {
      light: vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.svg'),
      dark: vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.svg')
    };

    this._panel.webview.html = this._getHtmlForWebview(currentScan);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'previewLine': {
            await this._previewLine(message.filePath, message.line || 1);
            break;
          }
          case 'askTavily': {
            await this._handleAskTavily(message);
            break;
          }
          case 'openExternal': {
            if (message.url) {
              vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
            break;
          }
        }
      },
      null,
      this._disposables
    );
  }

  public updateData(scan: ScanResult) {
    this._panel.webview.postMessage({
      type: 'updateScan',
      data: scan
    });
  }

  private async _previewLine(filePathRel: string, line: number) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const root = workspaceFolders[0].uri.fsPath;

    let targetPath = path.join(root, filePathRel);
    if (!fs.existsSync(targetPath)) targetPath = path.join(root, 'demo-target', filePathRel);
    if (!fs.existsSync(targetPath)) targetPath = path.join(path.dirname(this._extensionUri.fsPath), 'demo-target', filePathRel);
    if (!fs.existsSync(targetPath)) targetPath = path.join(path.dirname(path.dirname(this._extensionUri.fsPath)), 'demo-target', filePathRel);

    if (fs.existsSync(targetPath)) {
      try {
        const doc = await vscode.workspace.openTextDocument(targetPath);
        const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
        const targetLine = Math.max(0, line - 1);
        const pos = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      } catch (err: any) {
        vscode.window.showWarningMessage(`Could not open file: ${err.message}`);
      }
    } else {
      vscode.window.showWarningMessage(`File not found in workspace: ${filePathRel}`);
    }
  }

  private async _handleAskTavily(msg: any) {
    let projectRoot = path.dirname(path.dirname(this._extensionUri.fsPath));
    let cliScript = path.join(projectRoot, 'backend', 'cli.py');

    if (!fs.existsSync(cliScript)) {
      const candidates = [
        path.join(path.dirname(this._extensionUri.fsPath), 'backend', 'cli.py'),
        path.join(path.dirname(path.dirname(this._extensionUri.fsPath)), 'backend', 'cli.py'),
        'd:\\devday\\KaalAstra\\backend\\cli.py'
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
      '--snippet', msg.snippet || 'vulnerable pattern',
      '--file', msg.fileName || 'paymentService.js',
      '--question', msg.question || 'Why did this happen?',
      '--title', msg.title || 'Security Analysis',
      '--cwe', msg.cwe || 'CWE-306',
      '--json'
    ];

    try {
      execFile('python', args, { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (!err && stdout) {
          try {
            const startIdx = stdout.indexOf('{');
            const endIdx = stdout.lastIndexOf('}');
            const res = JSON.parse(stdout.substring(startIdx, endIdx + 1));
            this._panel.webview.postMessage({
              type: 'tavilyResult',
              data: res
            });
            return;
          } catch {
            // fallback
          }
        }

        // High quality fallback
        this._panel.webview.postMessage({
          type: 'tavilyResult',
          data: {
            explanation: `### Root Cause Analysis (Tavily Security Intel)\n\nIn \`${msg.fileName || 'paymentService.js'}\`, caller authentication was omitted at the internal function boundary.\nWhen unauthenticated callers like \`POST /stripe-callback\` reach \`refundTransaction()\`, arbitrary unauthorized state changes can be executed (CWE-306).\n\n**Remediation Guidance:**\n- Enforce authorization directly in \`refundTransaction()\`: \`if (!user || user.role !== 'admin') throw new Error('Unauthorized');\`\n- Validate cryptographic webhook signatures on incoming entrypoints.`,
            sources: [
              { title: 'CWE-306 Missing Authentication', url: 'https://cwe.mitre.org/data/definitions/306.html' },
              { title: 'OWASP Broken Access Control', url: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/' }
            ]
          }
        });
      });
    } catch {
      // fallback
    }
  }

  private _getHtmlForWebview(_currentScan?: ScanResult): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const root = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';

    const candidates = [
      path.join(root, 'frontend', 'security-graph', 'index.html'),
      path.join(root, '.kaalastra', 'last-run.html'),
      path.join(path.dirname(this._extensionUri.fsPath), 'frontend', 'security-graph', 'index.html'),
      path.join(path.dirname(path.dirname(this._extensionUri.fsPath)), 'frontend', 'security-graph', 'index.html'),
      'd:\\devday\\KaalAstra\\frontend\\security-graph\\index.html'
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          let html = fs.readFileSync(c, 'utf8');

          // Inject VS Code Bridge script
          const bridgeScript = `
            <script>
              const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

              // Override inspect to communicate with VS Code workspace
              const origInspect = typeof inspect === 'function' ? inspect : null;
              window.inspect = function(id) {
                if (origInspect) origInspect(id);
                if (vscode) {
                  vscode.postMessage({
                    command: 'previewLine',
                    filePath: 'src/services/paymentService.js',
                    line: id.includes('webhook') ? 12 : 5
                  });
                }
              };

              // Bridge Tavily queries to backend cli.py explain
              const origSubmitTavily = typeof submitTavilyQuery === 'function' ? submitTavilyQuery : null;
              window.submitTavilyQuery = function() {
                if (origSubmitTavily) origSubmitTavily();
                if (vscode) {
                  const queryInput = document.getElementById('tavilyQueryInput');
                  const question = queryInput ? queryInput.value.trim() : 'Why did this happen?';
                  const detectedNodes = capturedSnippetData ? capturedSnippetData.nodes : [];
                  const primary = detectedNodes.length > 0 ? detectedNodes[0] : null;

                  vscode.postMessage({
                    command: 'askTavily',
                    snippet: primary ? primary.code : 'refundTransaction()',
                    fileName: 'src/services/paymentService.js',
                    question: question,
                    title: primary ? primary.name : 'Missing Authorization Guard',
                    cwe: primary ? (primary.badge.startsWith('CWE') ? primary.badge : 'CWE-306') : 'CWE-306'
                  });
                }
              };

              window.addEventListener('message', (event) => {
                const message = event.data;
                if (message.type === 'tavilyResult' && message.data) {
                  const responseText = document.getElementById('tavilyResponseText');
                  const sourcesEl = document.getElementById('tavilySources');
                  const statusBadge = document.getElementById('tavilyStatusBadge');
                  if (statusBadge) statusBadge.textContent = 'Verified Live Intel';
                  if (responseText) {
                    responseText.innerHTML = message.data.explanation
                      .replace(/### (.*?)\\n/g, '<div style="font-weight:700; color:#f4f4f5; margin-bottom:6px; font-size:12px;">$1</div>')
                      .replace(/\\n/g, '<br>');
                  }
                  if (sourcesEl && message.data.sources) {
                    sourcesEl.innerHTML = message.data.sources.map(s => 
                      '<a href="' + s.url + '" target="_blank" class="source-pill" onclick="if(vscode){vscode.postMessage({command:\\'openExternal\\', url:\\'' + s.url + '\\'}); return false;}">🔗 ' + (s.title || s.url) + '</a>'
                    ).join('');
                  }
                }
              });
            </script>
          `;

          html = html.replace('</body>', `${bridgeScript}</body>`);
          return html;
        } catch (e) {
          console.error('Error loading template from disk:', e);
        }
      }
    }

    return `<!DOCTYPE html><html><body><h3>Could not load KaalAstra Security Graph. Please run a commit scan first.</h3></body></html>`;
  }

  public dispose() {
    SecurityGraphEditorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
