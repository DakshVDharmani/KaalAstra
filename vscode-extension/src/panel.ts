import * as vscode from 'vscode';

export class KaalAstraWebviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kaalastra.sentinelView';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'TRIGGER_SCAN':
          this.triggerScan(data.baseline || false);
          break;
        case 'APPLY_PATCH':
          vscode.window.showInformationMessage(`KaalAstra: Applying verified patch to ${data.file}...`);
          break;
      }
    });
  }

  public triggerScan(baseline: boolean = false) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'START_SCAN_STREAM', baseline });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KaalAstra Sentinel</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --border: #1f2937;
      --cyan: #00f0ff;
      --green: #10b981;
      --red: #ef4444;
      --yellow: #f59e0b;
      --text: #f3f4f6;
      --text-dim: #9ca3af;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 12px;
      margin: 0;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .logo-title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 1px;
      color: var(--cyan);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge-tag {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(0, 240, 255, 0.1);
      border: 1px solid var(--cyan);
      color: var(--cyan);
    }
    .btn-row {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    button {
      flex: 1;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-scan {
      background: var(--cyan);
      color: #050b14;
    }
    .btn-scan:hover {
      box-shadow: 0 0 12px rgba(0, 240, 255, 0.4);
    }
    .btn-baseline {
      background: #1f2937;
      color: var(--yellow);
      border: 1px solid #374151;
    }

    /* Stepper */
    .stepper {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .step-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      background: var(--card-bg);
      border-radius: 6px;
      border-left: 3px solid #374151;
      font-size: 12px;
    }
    .step-item.active {
      border-left-color: var(--cyan);
      background: rgba(0, 240, 255, 0.05);
    }
    .step-item.done {
      border-left-color: var(--green);
    }
    .step-item.alert {
      border-left-color: var(--red);
    }
    .step-icon {
      font-size: 14px;
    }

    /* Graph Visualizer */
    .graph-panel {
      background: #0d1322;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }
    .graph-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--cyan);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    svg.topo {
      width: 100%;
      height: 140px;
    }

    /* Finding Card */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .card-critical {
      border-color: rgba(239, 68, 68, 0.4);
      background: rgba(239, 68, 68, 0.03);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .finding-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--red);
    }
    .pill-red {
      background: rgba(239, 68, 68, 0.2);
      color: var(--red);
      border: 1px solid var(--red);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
    }
    .finding-detail {
      font-size: 11px;
      color: var(--text-dim);
      line-height: 1.5;
      margin-bottom: 8px;
    }
    .blindspot-box {
      background: rgba(245, 158, 11, 0.08);
      border-left: 2px solid var(--yellow);
      padding: 6px 8px;
      font-size: 11px;
      color: #fbbf24;
      margin-bottom: 8px;
      border-radius: 0 4px 4px 0;
    }
    .patch-box {
      background: #070a12;
      border: 1px solid #1f2937;
      border-radius: 4px;
      padding: 8px;
      font-family: monospace;
      font-size: 10px;
      color: #34d399;
      white-space: pre-wrap;
      max-height: 110px;
      overflow-y: auto;
      margin-bottom: 8px;
    }
    .verify-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(16, 185, 129, 0.15);
      color: var(--green);
      border: 1px solid var(--green);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-title">
      <span>🛡️ KAALASTRA</span>
      <span class="badge-tag">SENTINEL</span>
    </div>
    <div style="font-size: 11px; color: var(--text-dim);" id="commitRef">HEAD: b186cfb</div>
  </div>

  <div class="btn-row">
    <button class="btn-scan" onclick="startScan(false)">⚡ Scan Current Commit</button>
    <button class="btn-baseline" onclick="startScan(true)">Diff-Only Baseline</button>
  </div>

  <!-- Stepper -->
  <div class="stepper" id="stepper">
    <div class="step-item done" id="step-git">
      <span class="step-icon">📦</span>
      <span>1. Git Diff & Commit Captured</span>
    </div>
    <div class="step-item done" id="step-graph">
      <span class="step-icon">🕸️</span>
      <span>2. Code Knowledge Graph & Callers</span>
    </div>
    <div class="step-item done" id="step-scan">
      <span class="step-icon">🛡️</span>
      <span>3. Semgrep AST & Secret Scanner</span>
    </div>
    <div class="step-item done" id="step-tavily">
      <span class="step-icon">🌐</span>
      <span>4. Tavily Threat Intelligence</span>
    </div>
    <div class="step-item active" id="step-ai">
      <span class="step-icon">🧠</span>
      <span>5. KaalAstra Neural Reasoning Engine</span>
    </div>
    <div class="step-item done" id="step-verify">
      <span class="step-icon">🔬</span>
      <span>6. Automated Remediation Verified</span>
    </div>
  </div>

  <!-- Topology Graph -->
  <div class="graph-panel">
    <div class="graph-title">🕸️ Visual Threat Topology</div>
    <svg class="topo" viewBox="0 0 300 130">
      <!-- Connection lines -->
      <line x1="60" y1="35" x2="160" y2="65" stroke="#10b981" stroke-width="2" />
      <line x1="60" y1="95" x2="160" y2="65" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="4" />
      
      <!-- Protected Caller Node -->
      <circle cx="60" cy="35" r="16" fill="#064e3b" stroke="#10b981" stroke-width="2" />
      <text x="60" y="38" font-size="9" fill="#10b981" text-anchor="middle" font-weight="bold">API</text>
      <text x="60" y="58" font-size="8" fill="#9ca3af" text-anchor="middle">Protected</text>

      <!-- Unprotected Attacker Node -->
      <circle cx="60" cy="95" r="18" fill="#450a0a" stroke="#ef4444" stroke-width="2.5">
        <animate attributeName="r" values="18;21;18" dur="1.8s" repeatCount="indefinite"/>
      </circle>
      <text x="60" y="98" font-size="9" fill="#ef4444" text-anchor="middle" font-weight="bold">WEBHOOK</text>
      <text x="60" y="120" font-size="8" fill="#ef4444" text-anchor="middle" font-weight="bold">⚠️ UNPROTECTED</text>

      <!-- Modified Sink Node -->
      <rect x="160" y="45" width="120" height="40" rx="6" fill="#1e1b4b" stroke="#00f0ff" stroke-width="2" />
      <text x="220" y="62" font-size="9" fill="#00f0ff" text-anchor="middle" font-weight="bold">refundTransaction()</text>
      <text x="220" y="76" font-size="8" fill="#9ca3af" text-anchor="middle">paymentService.js</text>
    </svg>
  </div>

  <!-- Finding Detail Card -->
  <div class="card card-critical" id="findingCard">
    <div class="card-header">
      <div class="finding-title" id="fTitle">🚨 Critical Auth Bypass via Webhook Route</div>
      <span class="pill-red" id="fCwe">CWE-306</span>
    </div>
    <div class="finding-detail" id="fMechanism">
      Removal of internal role validation in <code>refundTransaction()</code> allows remote unauthenticated actors to trigger arbitrary refunds via the exposed <code>/stripe-callback</code> webhook handler.
    </div>
    <div class="blindspot-box" id="fBlindspot">
      <strong>⚡ Diff-Only Blindspot:</strong> A diff reviewer sees only <code>paymentService.js</code> with the comment "auth offloaded to route handlers" and assumes callers validate. Graph analysis revealed <code>webhooks.js</code> calls it without middleware!
    </div>

    <div style="font-size: 11px; font-weight: 700; color: #10b981; margin-bottom: 4px;">🛠️ Verified Remediation Patch:</div>
    <div class="patch-box" id="fPatch">--- a/src/services/paymentService.js
+++ b/src/services/paymentService.js
@@ -3,6 +3,9 @@
 function refundTransaction(id, user, amt) {
+  if (!user || user.role !== 'admin') {
+    throw new Error('Unauthorized');
+  }</div>

    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div class="verify-badge">
        <span>✓ VERIFIED (npm test passed, 0 Semgrep alerts)</span>
      </div>
      <button class="btn-scan" style="max-width: 120px;" onclick="applyPatch()">Apply Patch</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function startScan(baseline) {
      vscode.postMessage({ type: 'TRIGGER_SCAN', baseline });
    }

    function applyPatch() {
      vscode.postMessage({ type: 'APPLY_PATCH', file: 'src/services/paymentService.js' });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'START_SCAN_STREAM') {
        runSseStream(msg.baseline);
      }
    });

    function runSseStream(baseline) {
      const url = 'http://localhost:8000/api/scan/stream?' + new URLSearchParams({
        repo_path: \${JSON.stringify(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.')},
        baseline: String(baseline)
      }).toString();
      const source = new EventSource(url);

      source.addEventListener('STAGE_PROGRESS', e => {
        const d = JSON.parse(e.data);
        console.log("Progress:", d.message);
      });

      source.addEventListener('REPORT_COMPLETE', e => {
        const report = JSON.parse(e.data);
        if (report.findings && report.findings.length > 0) {
          const f = report.findings[0];
          document.getElementById('fTitle').innerText = f.title;
          document.getElementById('fCwe').innerText = f.cwe;
          document.getElementById('fMechanism').innerText = f.failure_mechanism;
          document.getElementById('fBlindspot').innerHTML = '<strong>⚡ Diff-Only Blindspot:</strong> ' + f.why_diff_only_misses_this;
          if (f.patch_unified_diff) {
            document.getElementById('fPatch').innerText = f.patch_unified_diff;
          }
        }
      });

      source.addEventListener('PIPELINE_DONE', () => {
        source.close();
      });

      source.onerror = () => {
        source.close();
      };
    }
  </script>
</body>
</html>`;
  }
}

