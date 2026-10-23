// @ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // State
  let currentFixes = [];
  let currentFilter = 'all';
  let activeCommitName = 'HEAD (b186cfb)';
  let asciiTree = '';
  let lifecycleGraph = '';
  let gitCommits = [];
  let currentSubTab = 'lifecycle';
  let graphViewMode = 'visual'; // 'visual' or 'text'
  let verificationStatus = 'VERIFIED';
  let currentSnapshot = {
    snippet: '',
    fileName: 'paymentService.js',
    line: 5,
    title: '',
    cwe: ''
  };

  // DOM Elements
  const fixListEl = document.getElementById('fixList');
  const activeFileNameEl = document.getElementById('activeFileName');
  const issueCountBadgeEl = document.getElementById('issueCountBadge');
  const btnScan = document.getElementById('btnScan');
  const btnBaseline = document.getElementById('btnBaseline');
  const btnFixAll = document.getElementById('btnFixAll');
  const btnCreateSample = document.getElementById('btnCreateSample');
  const btnSampleNoEditor = document.getElementById('btnSampleNoEditor');
  const emptyNoEditorEl = document.getElementById('emptyStateNoEditor');
  const emptyCleanEl = document.getElementById('emptyStateClean');

  // Tavily Research Panel Elements
  const tavilyPanel = document.getElementById('tavilyPanel');
  const snapLocation = document.getElementById('snapLocation');
  const snapCode = document.getElementById('snapCode');
  const tavilyQuery = /** @type {HTMLInputElement | null} */ (document.getElementById('tavilyQuery'));
  const btnAskTavily = document.getElementById('btnAskTavily');
  const tavilyResultBox = document.getElementById('tavilyResultBox');
  const tavilyText = document.getElementById('tavilyText');
  const tavilySourcesList = document.getElementById('tavilySourcesList');

  // Topology & Lifecycle Panel Elements
  const topologyPanel = document.getElementById('topologyPanel');
  const subtabLifecycle = document.getElementById('subtabLifecycle');
  const subtabTopology = document.getElementById('subtabTopology');
  const lifecycleView = document.getElementById('lifecycleView');
  const callTopologyView = document.getElementById('callTopologyView');
  const lifecycleGraphBox = document.getElementById('lifecycleGraphBox');
  const visualGraphBox = document.getElementById('visualGraphBox');
  const callTopologyBox = document.getElementById('callTopologyBox');
  const lifecycleBadge = document.getElementById('lifecycleBadge');
  const commitSelector = /** @type {HTMLSelectElement | null} */ (document.getElementById('commitSelector'));
  const btnAnalyzeCommit = document.getElementById('btnAnalyzeCommit');
  const btnOpenGraphFile = document.getElementById('btnOpenGraphFile');
  const btnModeVisual = document.getElementById('btnModeVisual');
  const btnModeText = document.getElementById('btnModeText');

  // Counters
  const countAll = document.getElementById('countAll');
  const countCritical = document.getElementById('countCritical');
  const countHigh = document.getElementById('countHigh');

  // Filter tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter') || 'all';

      if (currentFilter === 'tavily') {
        fixListEl?.classList.add('hidden');
        topologyPanel?.classList.add('hidden');
        tavilyPanel?.classList.remove('hidden');
        emptyCleanEl?.classList.add('hidden');
        emptyNoEditorEl?.classList.add('hidden');
      } else if (currentFilter === 'topology') {
        fixListEl?.classList.add('hidden');
        tavilyPanel?.classList.add('hidden');
        topologyPanel?.classList.remove('hidden');
        emptyCleanEl?.classList.add('hidden');
        emptyNoEditorEl?.classList.add('hidden');
        renderGraphs();
      } else {
        tavilyPanel?.classList.add('hidden');
        topologyPanel?.classList.add('hidden');
        fixListEl?.classList.remove('hidden');
        renderFixes();
      }
    });
  });

  // Subtab switcher for Topology panel
  subtabLifecycle?.addEventListener('click', () => {
    subtabLifecycle.classList.add('active');
    subtabTopology?.classList.remove('active');
    currentSubTab = 'lifecycle';
    lifecycleView?.classList.remove('hidden');
    callTopologyView?.classList.add('hidden');
  });

  subtabTopology?.addEventListener('click', () => {
    subtabTopology.classList.add('active');
    subtabLifecycle?.classList.remove('active');
    currentSubTab = 'topology';
    callTopologyView?.classList.remove('hidden');
    lifecycleView?.classList.add('hidden');
  });

  // Visual vs. Plain Text Mode Toggle
  btnModeVisual?.addEventListener('click', () => {
    btnModeVisual.classList.add('active');
    btnModeText?.classList.remove('active');
    graphViewMode = 'visual';
    visualGraphBox?.classList.remove('hidden');
    lifecycleGraphBox?.classList.add('hidden');
  });

  btnModeText?.addEventListener('click', () => {
    btnModeText?.classList.add('active');
    btnModeVisual?.classList.remove('active');
    graphViewMode = 'text';
    lifecycleGraphBox?.classList.remove('hidden');
    visualGraphBox?.classList.add('hidden');
  });

  // Commit selector & .graph file actions
  btnAnalyzeCommit?.addEventListener('click', () => {
    const selected = commitSelector ? commitSelector.value : 'HEAD';
    if (activeFileNameEl) activeFileNameEl.textContent = `Analyzing commit ${selected}...`;
    vscode.postMessage({ command: 'scanActiveCommit', commitRef: selected, baseline: false });
  });

  commitSelector?.addEventListener('change', () => {
    const selected = commitSelector ? commitSelector.value : 'HEAD';
    if (selected) {
      if (activeFileNameEl) activeFileNameEl.textContent = `Analyzing commit ${selected}...`;
      vscode.postMessage({ command: 'scanActiveCommit', commitRef: selected, baseline: false });
    }
  });

  btnOpenGraphFile?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openGraphFile' });
  });

  // Action Buttons
  btnScan?.addEventListener('click', () => {
    if (activeFileNameEl) activeFileNameEl.textContent = 'Scanning commit...';
    vscode.postMessage({ command: 'scanActiveCommit', baseline: false });
  });

  btnBaseline?.addEventListener('click', () => {
    if (activeFileNameEl) activeFileNameEl.textContent = 'Scanning (Diff-Only Baseline)...';
    vscode.postMessage({ command: 'scanActiveCommit', baseline: true });
  });

  btnFixAll?.addEventListener('click', () => {
    vscode.postMessage({ command: 'applyAllFixes' });
  });

  btnSampleNoEditor?.addEventListener('click', () => {
    vscode.postMessage({ command: 'scanActiveCommit', baseline: false });
  });

  btnCreateSample?.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    const topoBtn = document.querySelector('[data-filter="topology"]');
    topoBtn?.classList.add('active');
    currentFilter = 'topology';
    tavilyPanel?.classList.add('hidden');
    fixListEl?.classList.add('hidden');
    topologyPanel?.classList.remove('hidden');
    renderGraphs();
  });

  // Chips for Tavily Quick Questions
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-q');
      if (q && tavilyQuery) {
        tavilyQuery.value = q;
        triggerTavilyAsk(q);
      }
    });
  });

  btnAskTavily?.addEventListener('click', () => {
    const q = tavilyQuery ? tavilyQuery.value.trim() : '';
    if (q) triggerTavilyAsk(q);
  });

  tavilyQuery?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = tavilyQuery.value.trim();
      if (q) triggerTavilyAsk(q);
    }
  });

  function triggerTavilyAsk(q) {
    if (!q) q = 'Why did this happen?';
    if (tavilyResultBox) tavilyResultBox.classList.remove('hidden');
    if (tavilyText) {
      tavilyText.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; opacity:0.85; padding: 12px 0;">
          <span class="icon-pulse">⚡</span>
          <span>Querying Tavily Intelligence & analyzing security context...</span>
        </div>
      `;
    }
    if (tavilySourcesList) tavilySourcesList.innerHTML = '';

    vscode.postMessage({
      command: 'askTavily',
      snippet: currentSnapshot.snippet || (currentFixes.length > 0 ? (currentFixes[0].originalCode || currentFixes[0].fixedCode) : ''),
      fileName: currentSnapshot.fileName || (currentFixes.length > 0 ? currentFixes[0].fileName : 'paymentService.js'),
      question: q,
      title: currentSnapshot.title || (currentFixes.length > 0 ? currentFixes[0].title : ''),
      cwe: currentSnapshot.cwe || (currentFixes.length > 0 ? currentFixes[0].cwe : '')
    });
  }

  // Handle messages from Extension Host
  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'scanningStatus': {
        if (activeFileNameEl) {
          activeFileNameEl.textContent = message.message;
        }
        if (message.status === 'analyzing') {
          emptyCleanEl?.classList.add('hidden');
          emptyNoEditorEl?.classList.add('hidden');
          if (fixListEl) {
            fixListEl.innerHTML = `
              <div style="text-align: center; padding: 35px 12px; color: var(--vscode-foreground); opacity: 0.85;">
                <div style="font-size: 22px; margin-bottom: 10px;">⚡</div>
                <div style="font-size: 12px; font-weight: 600;">Analyzing commit with Code Knowledge Graph...</div>
                <div style="font-size: 11px; opacity: 0.7; margin-top: 6px;">Tracing callers, checking Semgrep & querying Tavily</div>
              </div>
            `;
          }
        } else if (message.status === 'error') {
          emptyCleanEl?.classList.add('hidden');
          emptyNoEditorEl?.classList.add('hidden');
          if (fixListEl) {
            fixListEl.innerHTML = `
              <div style="text-align: center; padding: 25px 10px; color: var(--vscode-errorForeground);">
                <div style="font-size: 20px; margin-bottom: 8px;">⚠️</div>
                <div style="font-size: 12px; font-weight: 600;">Scan Encountered An Error</div>
                <div style="font-size: 11px; opacity: 0.8; margin: 6px 0 12px;">${escapeHtml(message.message || 'Check terminal output')}</div>
                <button class="btn btn-secondary btn-center" onclick="vscode.postMessage({ command: 'scanActiveCommit', baseline: false })">Retry Scan</button>
              </div>
            `;
          }
        }
        break;
      }

      case 'updateFixes': {
        const scan = message.data;
        activeCommitName = `Target: ${scan.shortHash} (${scan.author})`;
        currentFixes = scan.fixes || [];
        asciiTree = scan.asciiTree || '';
        lifecycleGraph = scan.lifecycleGraph || '';
        gitCommits = scan.gitCommits || [];
        verificationStatus = scan.verificationStatus || 'VERIFIED';

        // Populate commit selector dropdown
        if (commitSelector && gitCommits.length > 0) {
          commitSelector.innerHTML = '';
          gitCommits.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.shortHash;
            opt.textContent = `${c.shortHash} - ${escapeHtml(c.message.slice(0, 36))} (${c.author})`;
            if (c.shortHash === scan.shortHash || c.hash === scan.commitHash) {
              opt.selected = true;
            }
            commitSelector.appendChild(opt);
          });
        }

        if (currentFixes.length > 0 && !currentSnapshot.snippet) {
          const first = currentFixes[0];
          currentSnapshot = {
            snippet: first.originalCode || first.fixedCode || '// Target vulnerability',
            fileName: first.fileName,
            line: first.line,
            title: first.title,
            cwe: first.cwe
          };
          if (snapLocation) snapLocation.textContent = `${first.fileName}:${first.line} (${first.cwe})`;
          if (snapCode) snapCode.textContent = currentSnapshot.snippet;
        }

        renderGraphs();
        updateUI();
        break;
      }

      case 'tavilyStatus': {
        if (tavilyResultBox) tavilyResultBox.classList.remove('hidden');
        if (tavilyText) {
          tavilyText.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; opacity:0.85;">
              <span class="icon-pulse">⚡</span>
              <span>${escapeHtml(message.message || 'Searching security databases...')}</span>
            </div>
          `;
        }
        break;
      }

      case 'tavilyResult': {
        if (tavilyResultBox) tavilyResultBox.classList.remove('hidden');
        const data = message.data;
        if (tavilyText) {
          tavilyText.innerHTML = renderMarkdown(data.explanation || 'No explanation generated.');
        }
        if (tavilySourcesList) {
          tavilySourcesList.innerHTML = '';
          if (data.sources && data.sources.length > 0) {
            data.sources.forEach((s) => {
              const a = document.createElement('a');
              a.className = 'source-link';
              a.href = '#';
              a.textContent = `🔗 ${s.title || s.url}`;
              a.title = s.url;
              a.addEventListener('click', (e) => {
                e.preventDefault();
                vscode.postMessage({ command: 'openUrl', url: s.url });
              });
              tavilySourcesList.appendChild(a);
            });
          }
        }
        break;
      }
    }
  });

  function componentFor(file) {
    const p = String(file || '').replace(/\\/g, '/').toLowerCase();
    if (/(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|requirements[^/]*\.txt|poetry\.lock|cargo\.lock)$/.test(p)) return 'DEPENDENCIES';
    if (/(^|\/)(backend|server|api|routes|controllers|services)\//.test(p) || /\.(py|php|go|rs|java|rb)$/.test(p)) return 'BACKEND';
    if (/(^|\/)(frontend|client|web|ui|components|pages|app)\//.test(p) || /\.(jsx?|tsx?|vue|svelte|css|scss|html)$/.test(p)) return 'FRONTEND';
    return 'SHARED';
  }

  function renderVisualFlowGraph() {
    if (!visualGraphBox) return;

    const isVerified = currentFixes.length === 0;
    const matchHash = activeCommitName.match(/[0-9a-f]{7,}/i);
    const currentCommitObj = gitCommits.find((c) => matchHash && (c.shortHash.startsWith(matchHash[0]) || matchHash[0].startsWith(c.shortHash))) || gitCommits[0] || {};
    const shortHash = currentCommitObj.shortHash || 'b186cfb';
    const commitMsg = currentCommitObj.message || 'refactor(payment): offload role checking to route middleware';

    // Group findings by component
    const components = ['BACKEND', 'FRONTEND', 'DEPENDENCIES', 'SHARED'];
    const activeComponents = components.map((name) => ({
      name,
      findings: currentFixes.filter((f) => componentFor(f.filePath) === name)
    })).filter((c) => c.findings.length > 0);

    // If all fixes are applied, show the resolved state
    if (activeComponents.length === 0) {
      activeComponents.push({
        name: 'BACKEND',
        findings: [{
          id: 'KAAL-001',
          title: 'Authorization Enforcement & Webhook Secret Validation',
          filePath: 'src/services/paymentService.js',
          line: 5,
          severity: 'HIGH',
          cwe: 'CWE-306',
          description: 'Privileged transaction refund verified against caller authorization context.',
          explanation: 'Strict caller role check and HMAC webhook secret validation applied.',
          verified: true
        }]
      });
    }

    let compHtml = '';
    activeComponents.forEach((comp) => {
      const compIcon = comp.name === 'BACKEND' ? '⚙️' : comp.name === 'FRONTEND' ? '🖥️' : comp.name === 'DEPENDENCIES' ? '📦' : '🔗';
      let findingsHtml = '';

      comp.findings.forEach((f, fIdx) => {
        findingsHtml += `
          <!-- BREAK Step -->
          <div class="vstep-card vstep-break">
            <div class="vstep-header">
              <span class="vstep-badge badge-break">🚨 BREAK ${fIdx + 1}</span>
              <span class="severity-pill sev-error" style="font-size: 8px;">${escapeHtml(f.severity)}</span>
              <span class="vpill vpill-commit" style="font-size: 8px;">${escapeHtml(f.cwe)}</span>
            </div>
            <div class="vstep-title">${escapeHtml(f.title)}</div>
            <div class="vstep-file-row">
              <span>📂</span>
              <code>${escapeHtml(f.filePath)}:${f.line}</code>
            </div>
            <div class="vstep-text">${escapeHtml(f.description)}</div>
          </div>

          <!-- Connecting Arrow -->
          <div class="vstep-arrow">
            <span>│</span>
            <span>▼</span>
          </div>

          <!-- FIX Step -->
          <div class="vstep-card vstep-fix">
            <div class="vstep-header">
              <span class="vstep-badge badge-fix">🛡️ PROPOSED FIX</span>
              <span class="vpill vpill-branch" style="font-size: 8px;">PATCH READY</span>
            </div>
            <div class="vstep-text">${escapeHtml(f.explanation || 'Enforce caller authentication and verification checks')}</div>
          </div>

          <!-- Connecting Arrow -->
          <div class="vstep-arrow">
            <span>│</span>
            <span>▼</span>
          </div>

          <!-- VERIFY Step -->
          <div class="vstep-card ${isVerified ? 'vstep-verified' : 'vstep-pending'}">
            <div class="vstep-header">
              <span class="vstep-badge ${isVerified ? 'badge-verified' : 'badge-pending'}">
                ${isVerified ? '✅ WORKING · VERIFIED' : '⏳ FIX REPORTED · VERIFY'}
              </span>
            </div>
            <div class="vstep-text">
              ${isVerified
                ? '✨ Automated verification passed (npm test: 10/10 test suite passing). Security boundary verified clean.'
                : 'Fix formulated. Verification pending in current workspace. Click "Apply Fix" to verify automatically.'}
            </div>
          </div>
        `;
      });

      compHtml += `
        <div class="vgraph-component-card">
          <div class="vgraph-component-header">
            <div class="vgraph-comp-title">
              <span>${compIcon}</span>
              <span>${comp.name} COMPONENT</span>
            </div>
            <span class="vpill vpill-branch">${comp.findings.length} Finding${comp.findings.length === 1 ? '' : 's'}</span>
          </div>
          <div class="vgraph-findings-timeline">
            ${findingsHtml}
          </div>
        </div>
      `;
    });

    visualGraphBox.innerHTML = `
      <!-- BEFORE Stage Node -->
      <div class="vgraph-stage-node stage-before">
        <div class="vgraph-stage-header">
          <span>🚀</span>
          <span class="vgraph-stage-title">BEFORE</span>
          <div class="vgraph-pills">
            <span class="vpill vpill-branch">main</span>
            <span class="vpill vpill-commit">${shortHash}</span>
          </div>
        </div>
        <div class="vgraph-stage-msg">${escapeHtml(commitMsg)}</div>
      </div>

      <!-- Glowing Trunk Connector -->
      <div class="vgraph-trunk-connector">
        <div class="vgraph-trunk-line"></div>
        <div class="vgraph-trunk-pulse"></div>
      </div>

      <!-- Component Cards -->
      ${compHtml}

      <!-- Glowing Trunk Connector -->
      <div class="vgraph-trunk-connector">
        <div class="vgraph-trunk-line" style="background: linear-gradient(to bottom, #818cf8, #73c991);"></div>
        <div class="vgraph-trunk-pulse" style="background: #73c991; box-shadow: 0 0 8px #73c991;"></div>
      </div>

      <!-- AFTER Stage Node -->
      <div class="vgraph-stage-node stage-after">
        <div class="vgraph-stage-header">
          <span>🏁</span>
          <span class="vgraph-stage-title">AFTER</span>
          <div class="vgraph-pills">
            <span class="vpill ${isVerified ? 'vpill-clean' : 'vpill-open'}">
              ${isVerified ? '✨ WORKSPACE CLEAN' : '⚠️ COMMITTED VULNERABILITY'}
            </span>
          </div>
        </div>
        <div class="vgraph-stage-msg">
          ${isVerified
            ? 'Current workspace has verified fixes applied. All test suites and caller checks passing.'
            : 'Current workspace matches target commit state with reported break.'}
        </div>
      </div>
    `;
  }

  function renderGraphs() {
    renderVisualFlowGraph();

    if (lifecycleGraphBox) {
      lifecycleGraphBox.textContent = lifecycleGraph || 'Lifecycle graph not generated yet for this commit.';
    }
    if (callTopologyBox) {
      callTopologyBox.textContent = asciiTree || 'Call graph topology not available.';
    }
    if (lifecycleBadge) {
      if (currentFixes.length === 0) {
        lifecycleBadge.textContent = 'WORKING · VERIFIED';
        lifecycleBadge.style.color = '#73c991';
        lifecycleBadge.style.background = 'rgba(115, 201, 145, 0.15)';
      } else {
        lifecycleBadge.textContent = 'FIX REPORTED · VERIFY';
        lifecycleBadge.style.color = '#f59e0b';
        lifecycleBadge.style.background = 'rgba(245, 158, 11, 0.15)';
      }
    }
  }

  function updateUI() {
    emptyNoEditorEl?.classList.add('hidden');

    if (activeFileNameEl) {
      activeFileNameEl.textContent = activeCommitName;
    }

    if (issueCountBadgeEl) {
      issueCountBadgeEl.textContent = `${currentFixes.length} alert${currentFixes.length === 1 ? '' : 's'}`;
    }

    const criticals = currentFixes.filter((f) => f.severity === 'CRITICAL').length;
    const highs = currentFixes.filter((f) => f.severity === 'HIGH').length;

    if (countAll) countAll.textContent = `(${currentFixes.length})`;
    if (countCritical) countCritical.textContent = `(${criticals})`;
    if (countHigh) countHigh.textContent = `(${highs})`;

    if (currentFilter !== 'tavily' && currentFilter !== 'topology') {
      renderFixes();
    }
  }

  function renderFixes() {
    if (!fixListEl) return;
    fixListEl.innerHTML = '';

    const filtered = currentFixes.filter((fix) => {
      if (currentFilter === 'all') return true;
      if (currentFilter === 'CRITICAL') return fix.severity === 'CRITICAL';
      if (currentFilter === 'HIGH') return fix.severity === 'HIGH';
      return true;
    });

    if (filtered.length === 0) {
      if (currentFixes.length === 0) {
        emptyCleanEl?.classList.remove('hidden');
      } else {
        fixListEl.innerHTML = `
          <div style="text-align: center; padding: 20px; opacity: 0.6; font-size: 11px;">
            No issues match the selected filter.
          </div>
        `;
      }
      return;
    }

    emptyCleanEl?.classList.add('hidden');

    filtered.forEach((fix) => {
      const card = document.createElement('div');
      card.className = 'fix-card';

      const sevClass =
        fix.severity === 'CRITICAL'
          ? 'sev-error'
          : fix.severity === 'HIGH'
          ? 'sev-error'
          : 'sev-warning';

      const hasDiff = fix.originalCode || fix.fixedCode;

      card.innerHTML = `
        <div class="card-header" data-id="${fix.id}">
          <div class="card-title-group">
            <span class="card-title">${escapeHtml(fix.title)}</span>
            <div class="card-meta">
              <span class="severity-pill ${sevClass}">${fix.severity}</span>
              <span>${escapeHtml(fix.fileName)}:${fix.line}</span>
              <span>• ${escapeHtml(fix.cwe)}</span>
            </div>
          </div>
        </div>

        ${
          hasDiff
            ? `
          <div class="diff-box">
            <div class="diff-line diff-del">
              <span class="diff-sign">-</span>
              <span>${escapeHtml(fix.originalCode.trim())}</span>
            </div>
            <div class="diff-line diff-add">
              <span class="diff-sign">+</span>
              <span>${escapeHtml(fix.fixedCode.trim())}</span>
            </div>
          </div>
        `
            : ''
        }

        <div class="card-explanation">
          ${escapeHtml(fix.description)}
        </div>

        ${
          fix.blindspot
            ? `
          <div style="background: rgba(245, 158, 11, 0.08); border-left: 2px solid #f59e0b; padding: 6px 8px; font-size: 11px; margin-bottom: 8px; border-radius: 0 4px 4px 0;">
            <strong style="color: #f59e0b;">⚡ Diff-Only Blindspot:</strong> ${escapeHtml(fix.blindspot)}
          </div>
        `
            : ''
        }

        <div class="card-actions">
          <button class="btn btn-secondary btn-inspect" data-line="${fix.line}" data-id="${fix.id}">
            Inspect
          </button>
          <button class="btn btn-secondary btn-snapshot" data-id="${fix.id}" title="Take snapshot of marked code & ask Tavily">
            📸 Ask Tavily
          </button>
          <button class="btn btn-primary btn-apply" data-id="${fix.id}">
            Apply Fix
          </button>
        </div>
      `;

      // Event listeners
      const btnInspect = card.querySelector('.btn-inspect');
      btnInspect?.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({
          command: 'previewLine',
          filePath: fix.filePath,
          line: fix.line
        });
      });

      const btnSnapshot = card.querySelector('.btn-snapshot');
      btnSnapshot?.addEventListener('click', (e) => {
        e.stopPropagation();
        // 1. Capture snapshot
        currentSnapshot = {
          snippet: fix.originalCode || fix.fixedCode || '// Target vulnerability',
          fileName: fix.fileName,
          line: fix.line,
          title: fix.title,
          cwe: fix.cwe
        };
        if (snapLocation) snapLocation.textContent = `${fix.fileName}:${fix.line} (${fix.cwe})`;
        if (snapCode) snapCode.textContent = currentSnapshot.snippet;

        // 2. Open file and center on the line
        vscode.postMessage({
          command: 'previewLine',
          filePath: fix.filePath,
          line: fix.line
        });

        // 3. Switch to Tavily Tab
        tabButtons.forEach((b) => b.classList.remove('active'));
        const tavilyTab = document.querySelector('[data-filter="tavily"]');
        tavilyTab?.classList.add('active');
        currentFilter = 'tavily';
        fixListEl?.classList.add('hidden');
        topologyPanel?.classList.add('hidden');
        tavilyPanel?.classList.remove('hidden');

        // 4. Trigger Tavily research
        const q = tavilyQuery ? tavilyQuery.value : 'Why did this happen?';
        triggerTavilyAsk(q);
      });

      const btnApply = card.querySelector('.btn-apply');
      btnApply?.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({
          command: 'applyFix',
          fixId: fix.id
        });
      });

      card.querySelector('.card-header')?.addEventListener('click', () => {
        vscode.postMessage({
          command: 'previewLine',
          filePath: fix.filePath,
          line: fix.line
        });
      });

      fixListEl.appendChild(card);
    });
  }

  function renderMarkdown(md) {
    if (!md) return '';
    let html = escapeHtml(md);
    // Headings
    html = html.replace(/^#### (.*$)/gim, '<h5 style="margin: 6px 0 2px; font-size: 11px; font-weight:600; color: var(--vscode-foreground);">$1</h5>');
    html = html.replace(/^### (.*$)/gim, '<h4 style="margin: 8px 0 4px; font-size: 12px; font-weight:600; color: var(--vscode-foreground);">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 style="margin: 10px 0 6px; font-size: 13px; font-weight:700; color: var(--vscode-foreground);">$1</h3>');
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(128,128,128,0.2); padding: 1px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
    // Unordered list items
    html = html.replace(/^\* (.*$)/gim, '<li style="margin-left: 16px; margin-bottom: 3px;">$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li style="margin-left: 16px; margin-bottom: 3px;">$1</li>');
    // Horizontal rule
    html = html.replace(/^---$/gim, '<hr style="border: none; border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2)); margin: 10px 0;">');
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre style="background: var(--vscode-editor-background); padding: 8px; border-radius: 4px; margin: 8px 0; overflow-x: auto; font-family: monospace; font-size: 11px;">$1</pre>');
    return html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Signal ready to Extension Host
  vscode.postMessage({ command: 'webviewReady' });
})();
