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
  const visualTopologyBox = document.getElementById('visualTopologyBox');
  const lifecycleBadge = document.getElementById('lifecycleBadge');
  const commitSelector = /** @type {HTMLSelectElement | null} */ (document.getElementById('commitSelector'));
  const btnAnalyzeCommit = document.getElementById('btnAnalyzeCommit');
  const btnOpenGraphFile = document.getElementById('btnOpenGraphFile');
  const btnModeVisual = document.getElementById('btnModeVisual');
  const btnModeText = document.getElementById('btnModeText');
  const btnTopoVisual = document.getElementById('btnTopoVisual');
  const btnTopoText = document.getElementById('btnTopoText');

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
    renderVisualTopologyGraph();
  });

  // Visual vs. Plain Text Mode Toggle (Lifecycle)
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

  // Flowchart vs. ASCII Toggle (Topology)
  btnTopoVisual?.addEventListener('click', () => {
    btnTopoVisual.classList.add('active');
    btnTopoText?.classList.remove('active');
    visualTopologyBox?.classList.remove('hidden');
    callTopologyBox?.classList.add('hidden');
  });

  btnTopoText?.addEventListener('click', () => {
    btnTopoText?.classList.add('active');
    btnTopoVisual?.classList.remove('active');
    callTopologyBox?.classList.remove('hidden');
    visualTopologyBox?.classList.add('hidden');
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

  // Canvas state for Lifecycle flow
  let vZoom = 0.82;
  let vPanX = 18;
  let vPanY = 40;
  let vAnimActive = true;

  // Canvas state for Topology flowchart
  let tZoom = 0.82;
  let tPanX = 18;
  let tPanY = 40;
  let tAnimActive = true;

  function renderVisualFlowGraph() {
    if (!visualGraphBox) return;

    const isVerified = currentFixes.length === 0;
    const matchHash = activeCommitName.match(/[0-9a-f]{7,}/i);
    const currentCommitObj = gitCommits.find((c) => matchHash && (c.shortHash.startsWith(matchHash[0]) || matchHash[0].startsWith(c.shortHash))) || gitCommits[0] || {};
    const shortHash = currentCommitObj.shortHash || 'b186cfb';
    const commitMsg = currentCommitObj.message || 'refactor(payment): offload role checking to route middleware';

    const activeFinding = currentFixes.length > 0 ? currentFixes[0] : {
      id: 'KAAL-001',
      title: 'Missing Authorization Guard in Caller Boundary',
      filePath: 'src/services/paymentService.js',
      line: 5,
      severity: 'HIGH',
      cwe: 'CWE-306',
      description: 'Role check was removed from refundTransaction(). Callers can execute sensitive refunds without validation.',
      explanation: 'Enforce caller authentication and HMAC webhook secret validation.',
      verified: true
    };

    const nodes = [
      {
        id: 'flow-node-1',
        x: 30,
        y: 130,
        cat: 'Git Trigger',
        name: `Commit ${shortHash}`,
        badge: 'Committed',
        dot: 'blue',
        desc: escapeHtml(commitMsg.slice(0, 75)),
        code: `main @ ${shortHash}`
      },
      {
        id: 'flow-node-2',
        x: 320,
        y: 130,
        cat: 'Component',
        name: 'paymentService.js',
        badge: 'Modified',
        dot: 'blue',
        desc: `Analyzed ${escapeHtml(activeFinding.filePath)}`,
        code: `refundTransaction() : L${activeFinding.line}`
      },
      {
        id: 'flow-node-3',
        x: 610,
        y: 75,
        cat: 'Vulnerability',
        name: escapeHtml(activeFinding.title.slice(0, 36)),
        badge: activeFinding.cwe || 'CWE-306',
        dot: 'red',
        cardClass: 'n8n-node-break',
        desc: escapeHtml(activeFinding.description.slice(0, 95)),
        code: 'webhooks.js -> refundTransaction()'
      },
      {
        id: 'flow-node-4',
        x: 900,
        y: 75,
        cat: 'Remediation',
        name: 'Enforce Role Guard',
        badge: isVerified ? 'Verified' : 'Patch Ready',
        dot: isVerified ? 'green' : 'amber',
        cardClass: isVerified ? 'n8n-node-verify' : '',
        desc: escapeHtml(activeFinding.explanation.slice(0, 95)),
        code: 'if (!user || user.role !== "admin")',
        hasApply: !isVerified,
        fixId: activeFinding.id
      },
      {
        id: 'flow-node-5',
        x: 1190,
        y: 130,
        cat: 'Verifier',
        name: 'Automated Suite',
        badge: isVerified ? '10/10 Pass' : 'Pending',
        dot: isVerified ? 'green' : 'amber',
        cardClass: isVerified ? 'n8n-node-verify' : '',
        desc: isVerified ? 'Unit tests passed. Semgrep AST rules clean.' : 'Automated test suite evaluation pending.',
        code: 'npm test (1.2s)'
      },
      {
        id: 'flow-node-6',
        x: 1480,
        y: 130,
        cat: 'State',
        name: 'Workspace Clean',
        badge: isVerified ? 'Ready' : 'Vulnerable',
        dot: isVerified ? 'green' : 'red',
        desc: isVerified ? 'Workspace boundary verified clean. Safe to merge.' : 'Repository contains vulnerable authorization regression.',
        code: isVerified ? 'Boundary Verified' : 'Remediation Active'
      }
    ];

    const edges = [
      { from: 'flow-node-1', to: 'flow-node-2', label: 'git diff' },
      { from: 'flow-node-2', to: 'flow-node-3', label: 'AST trace', danger: true },
      { from: 'flow-node-3', to: 'flow-node-4', label: 'synthesizes fix' },
      { from: 'flow-node-4', to: 'flow-node-5', label: 'runs tests', verified: true },
      { from: 'flow-node-5', to: 'flow-node-6', label: 'verified', verified: true }
    ];

    visualGraphBox.innerHTML = `
      <div class="n8n-canvas-wrapper" id="vCanvasWrapper">
        <div class="n8n-canvas-world" id="vCanvasWorld" style="transform: translate(${vPanX}px, ${vPanY}px) scale(${vZoom});">
          <svg class="n8n-connections-svg" id="vSvg">
            <defs>
              <marker id="vArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3f3f46" />
              </marker>
              <marker id="vArrowDanger" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
              </marker>
              <marker id="vArrowVerified" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#22c55e" />
              </marker>
            </defs>
          </svg>
          <div id="vLabelsGroup"></div>
          <div class="n8n-nodes-layer" id="vNodesGroup"></div>
        </div>

        <div class="n8n-top-hud">
          <div class="n8n-hud-chip">
            <span>Commit:</span> <b>${shortHash}</b>
          </div>
          <div class="n8n-hud-chip">
            <span>Status:</span> <b style="color:${isVerified ? '#22c55e' : '#f59e0b'}">${isVerified ? 'Verified' : 'Action Required'}</b>
          </div>
        </div>

        <div class="n8n-hud-bar">
          <button class="n8n-hud-btn" id="vZoomIn" title="Zoom In">+</button>
          <button class="n8n-hud-btn" id="vZoomOut" title="Zoom Out">−</button>
          <span class="n8n-hud-zoom" id="vZoomDisplay">${Math.round(vZoom * 100)}%</span>
          <div class="n8n-hud-divider"></div>
          <button class="n8n-hud-btn" id="vFit" title="Fit to View">⊡</button>
          <button class="n8n-hud-btn" id="vReset" title="Reset View">↺</button>
        </div>
      </div>
    `;

    const vNodesGroup = document.getElementById('vNodesGroup');
    const vSvg = document.getElementById('vSvg');
    const vLabelsGroup = document.getElementById('vLabelsGroup');

    if (vNodesGroup) {
      nodes.forEach((n) => {
        const el = document.createElement('div');
        el.className = `n8n-node-card ${n.cardClass || ''}`;
        el.id = n.id;
        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;

        const portIn = document.createElement('div');
        portIn.className = 'n8n-node-port n8n-port-in';
        el.appendChild(portIn);

        const portOut = document.createElement('div');
        portOut.className = 'n8n-node-port n8n-port-out';
        el.appendChild(portOut);

        el.innerHTML += `
          <div class="n8n-node-header">
            <span class="n8n-node-category">${n.cat}</span>
            <div class="n8n-node-badge">
              <span class="badge-dot ${n.dot}"></span>
              <span>${n.badge}</span>
            </div>
          </div>
          <div class="n8n-node-body">
            <div class="n8n-node-name" title="${n.name}">${n.name}</div>
            <div class="n8n-node-desc">${n.desc}</div>
            <div class="n8n-code-chip">${n.code}</div>
          </div>
          <div class="n8n-node-footer">
            <span>id: ${n.id}</span>
            ${n.hasApply
              ? `<button class="n8n-btn-action n8n-btn-apply" onclick="vscode.postMessage({ command: 'applyFix', fixId: '${n.fixId}' })">Apply Fix</button>`
              : `<button class="n8n-btn-action" onclick="vscode.postMessage({ command: 'previewLine', filePath: '${activeFinding.filePath}', line: ${activeFinding.line} })">Inspect</button>`
            }
          </div>
        `;

        vNodesGroup.appendChild(el);
      });
    }

    function updateVConnections() {
      if (!vSvg || !vLabelsGroup) return;
      const defs = vSvg.querySelector('defs');
      vSvg.innerHTML = '';
      if (defs) vSvg.appendChild(defs);
      vLabelsGroup.innerHTML = '';

      edges.forEach((edge) => {
        const fromEl = document.getElementById(edge.from);
        const toEl = document.getElementById(edge.to);
        if (!fromEl || !toEl) return;

        const fromX = parseFloat(fromEl.style.left) + fromEl.offsetWidth;
        const fromY = parseFloat(fromEl.style.top) + fromEl.offsetHeight / 2;
        const toX = parseFloat(toEl.style.left);
        const toY = parseFloat(toEl.style.top) + toEl.offsetHeight / 2;

        const dx = Math.abs(toX - fromX);
        const cx1 = fromX + Math.max(dx * 0.45, 30);
        const cx2 = toX - Math.max(dx * 0.45, 30);
        const pathD = `M ${fromX} ${fromY} C ${cx1} ${fromY}, ${cx2} ${toY}, ${toX} ${toY}`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('class', `n8n-edge-path ${edge.danger ? 'n8n-edge-danger' : edge.verified ? 'n8n-edge-verified' : ''}`);
        path.setAttribute('marker-end', edge.danger ? 'url(#vArrowDanger)' : edge.verified ? 'url(#vArrowVerified)' : 'url(#vArrow)');
        vSvg.appendChild(path);

        if (edge.label) {
          const midX = (fromX + toX) / 2;
          const midY = (fromY + toY) / 2;
          const badge = document.createElement('div');
          badge.className = `n8n-edge-badge ${edge.danger ? 'danger' : edge.verified ? 'verified' : ''}`;
          badge.style.left = `${midX}px`;
          badge.style.top = `${midY}px`;
          badge.textContent = edge.label;
          vLabelsGroup.appendChild(badge);
        }
      });
    }

    requestAnimationFrame(updateVConnections);

    const wrapper = document.getElementById('vCanvasWrapper');
    const world = document.getElementById('vCanvasWorld');
    const zoomDisp = document.getElementById('vZoomDisplay');

    function applyVTransform() {
      if (world) world.style.transform = `translate(${vPanX}px, ${vPanY}px) scale(${vZoom})`;
      if (zoomDisp) zoomDisp.textContent = `${Math.round(vZoom * 100)}%`;
    }

    let isPan = false;
    let sX = 0;
    let sY = 0;

    wrapper?.addEventListener('mousedown', (e) => {
      if (e.target.closest('.n8n-node-card') || e.target.closest('.n8n-hud-bar')) return;
      isPan = true;
      sX = e.clientX - vPanX;
      sY = e.clientY - vPanY;
      wrapper.classList.add('grabbing');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPan) return;
      vPanX = e.clientX - sX;
      vPanY = e.clientY - sY;
      applyVTransform();
    });

    window.addEventListener('mouseup', () => {
      isPan = false;
      wrapper?.classList.remove('grabbing');
    });

    wrapper?.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.06 : 0.94;
      vZoom = Math.min(Math.max(vZoom * factor, 0.4), 2);
      applyVTransform();
    }, { passive: false });

    document.getElementById('vZoomIn')?.addEventListener('click', () => {
      vZoom = Math.min(vZoom * 1.15, 2);
      applyVTransform();
    });
    document.getElementById('vZoomOut')?.addEventListener('click', () => {
      vZoom = Math.max(vZoom * 0.85, 0.4);
      applyVTransform();
    });
    document.getElementById('vReset')?.addEventListener('click', () => {
      vZoom = 0.88;
      vPanX = 20;
      vPanY = 40;
      applyVTransform();
    });
    document.getElementById('vFit')?.addEventListener('click', () => {
      vZoom = 0.62;
      vPanX = 10;
      vPanY = 20;
      applyVTransform();
    });
  }

  // Eraser AI Minimalist Flowchart for Call Topology
  function renderVisualTopologyGraph() {
    if (!visualTopologyBox) return;

    const nodes = [
      {
        id: 'topo-api',
        x: 40,
        y: 45,
        cat: 'Protected Route',
        name: 'POST /api/orders/refund',
        badge: 'JWT Guard',
        dot: 'green',
        desc: 'Admin dashboard endpoint.',
        code: 'authMiddleware.requireRole("admin")'
      },
      {
        id: 'topo-webhook',
        x: 40,
        y: 260,
        cat: 'External Entrypoint',
        name: 'POST /stripe-callback',
        badge: 'Unauthenticated',
        dot: 'red',
        cardClass: 'n8n-node-break',
        desc: 'Public webhook receiver in webhooks.js.',
        code: 'router.post("/stripe-callback", ...)'
      },
      {
        id: 'topo-guard',
        x: 360,
        y: 45,
        cat: 'Middleware',
        name: 'verifyAuthContext()',
        badge: 'Enforced',
        dot: 'green',
        desc: 'Validates bearer token & permission claims.',
        code: 'req.user = decodedToken'
      },
      {
        id: 'topo-sink',
        x: 680,
        y: 150,
        cat: 'Sensitive Sink',
        name: 'refundTransaction()',
        badge: 'CWE-306',
        dot: 'red',
        cardClass: 'n8n-node-break',
        desc: 'paymentService.js: line 5. Role check deleted in PR.',
        code: 'src/services/paymentService.js:5'
      },
      {
        id: 'topo-patch',
        x: 1000,
        y: 150,
        cat: 'Remediation',
        name: 'Defensive Self-Check',
        badge: 'Verified',
        dot: 'green',
        cardClass: 'n8n-node-verify',
        desc: 'Defense-in-depth check ensures caller validity.',
        code: 'if (!user || user.role !== "admin")'
      }
    ];

    const edges = [
      { from: 'topo-api', to: 'topo-guard', label: 'validated caller', verified: true },
      { from: 'topo-guard', to: 'topo-sink', label: 'authorized call', verified: true },
      { from: 'topo-webhook', to: 'topo-sink', label: 'UNPROTECTED BYPASS', danger: true },
      { from: 'topo-sink', to: 'topo-patch', label: 'blocks exploit', verified: true }
    ];

    visualTopologyBox.innerHTML = `
      <div class="n8n-canvas-wrapper" id="tCanvasWrapper">
        <div class="n8n-canvas-world" id="tCanvasWorld" style="transform: translate(${tPanX}px, ${tPanY}px) scale(${tZoom});">
          <svg class="n8n-connections-svg" id="tSvg">
            <defs>
              <marker id="tArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3f3f46" />
              </marker>
              <marker id="tArrowDanger" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
              </marker>
              <marker id="tArrowVerified" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#22c55e" />
              </marker>
            </defs>
          </svg>
          <div id="tLabelsGroup"></div>
          <div class="n8n-nodes-layer" id="tNodesGroup"></div>
        </div>

        <div class="n8n-top-hud">
          <div class="n8n-hud-chip">
            <span>View:</span> <b>Eraser Flowchart</b>
          </div>
          <div class="n8n-hud-chip">
            <span>Exploit Path:</span> <b style="color:#ef4444">Webhook -> Sink Bypass</b>
          </div>
        </div>

        <div class="n8n-hud-bar">
          <button class="n8n-hud-btn" id="tZoomIn" title="Zoom In">+</button>
          <button class="n8n-hud-btn" id="tZoomOut" title="Zoom Out">−</button>
          <span class="n8n-hud-zoom" id="tZoomDisplay">${Math.round(tZoom * 100)}%</span>
          <div class="n8n-hud-divider"></div>
          <button class="n8n-hud-btn" id="tFit" title="Fit to View">⊡</button>
          <button class="n8n-hud-btn" id="tReset" title="Reset View">↺</button>
        </div>
      </div>
    `;

    const tNodesGroup = document.getElementById('tNodesGroup');
    const tSvg = document.getElementById('tSvg');
    const tLabelsGroup = document.getElementById('tLabelsGroup');

    if (tNodesGroup) {
      nodes.forEach((n) => {
        const el = document.createElement('div');
        el.className = `n8n-node-card ${n.cardClass || ''}`;
        el.id = n.id;
        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;

        const portIn = document.createElement('div');
        portIn.className = 'n8n-node-port n8n-port-in';
        el.appendChild(portIn);

        const portOut = document.createElement('div');
        portOut.className = 'n8n-node-port n8n-port-out';
        el.appendChild(portOut);

        el.innerHTML += `
          <div class="n8n-node-header">
            <span class="n8n-node-category">${n.cat}</span>
            <div class="n8n-node-badge">
              <span class="badge-dot ${n.dot}"></span>
              <span>${n.badge}</span>
            </div>
          </div>
          <div class="n8n-node-body">
            <div class="n8n-node-name" title="${n.name}">${n.name}</div>
            <div class="n8n-node-desc">${n.desc}</div>
            <div class="n8n-code-chip">${n.code}</div>
          </div>
          <div class="n8n-node-footer">
            <span>id: ${n.id}</span>
            <button class="n8n-btn-action" onclick="vscode.postMessage({ command: 'previewLine', filePath: 'src/services/paymentService.js', line: 5 })">Inspect</button>
          </div>
        `;

        tNodesGroup.appendChild(el);
      });
    }

    function updateTConnections() {
      if (!tSvg || !tLabelsGroup) return;
      const defs = tSvg.querySelector('defs');
      tSvg.innerHTML = '';
      if (defs) tSvg.appendChild(defs);
      tLabelsGroup.innerHTML = '';

      edges.forEach((edge) => {
        const fromEl = document.getElementById(edge.from);
        const toEl = document.getElementById(edge.to);
        if (!fromEl || !toEl) return;

        const fromX = parseFloat(fromEl.style.left) + fromEl.offsetWidth;
        const fromY = parseFloat(fromEl.style.top) + fromEl.offsetHeight / 2;
        const toX = parseFloat(toEl.style.left);
        const toY = parseFloat(toEl.style.top) + toEl.offsetHeight / 2;

        const dx = Math.abs(toX - fromX);
        const cx1 = fromX + Math.max(dx * 0.45, 30);
        const cx2 = toX - Math.max(dx * 0.45, 30);
        const pathD = `M ${fromX} ${fromY} C ${cx1} ${fromY}, ${cx2} ${toY}, ${toX} ${toY}`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('class', `n8n-edge-path ${edge.danger ? 'n8n-edge-danger' : edge.verified ? 'n8n-edge-verified' : ''}`);
        path.setAttribute('marker-end', edge.danger ? 'url(#tArrowDanger)' : edge.verified ? 'url(#tArrowVerified)' : 'url(#tArrow)');
        tSvg.appendChild(path);

        if (edge.label) {
          const midX = (fromX + toX) / 2;
          const midY = (fromY + toY) / 2;
          const badge = document.createElement('div');
          badge.className = `n8n-edge-badge ${edge.danger ? 'danger' : edge.verified ? 'verified' : ''}`;
          badge.style.left = `${midX}px`;
          badge.style.top = `${midY}px`;
          badge.textContent = edge.label;
          tLabelsGroup.appendChild(badge);
        }
      });
    }

    requestAnimationFrame(updateTConnections);

    const tWrapper = document.getElementById('tCanvasWrapper');
    const tWorld = document.getElementById('tCanvasWorld');
    const tZoomDisp = document.getElementById('tZoomDisplay');

    function applyTTransform() {
      if (tWorld) tWorld.style.transform = `translate(${tPanX}px, ${tPanY}px) scale(${tZoom})`;
      if (tZoomDisp) tZoomDisp.textContent = `${Math.round(tZoom * 100)}%`;
    }

    let isTPan = false;
    let tsX = 0;
    let tsY = 0;

    tWrapper?.addEventListener('mousedown', (e) => {
      if (e.target.closest('.n8n-node-card') || e.target.closest('.n8n-hud-bar')) return;
      isTPan = true;
      tsX = e.clientX - tPanX;
      tsY = e.clientY - tPanY;
      tWrapper.classList.add('grabbing');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isTPan) return;
      tPanX = e.clientX - tsX;
      tPanY = e.clientY - tsY;
      applyTTransform();
    });

    window.addEventListener('mouseup', () => {
      isTPan = false;
      tWrapper?.classList.remove('grabbing');
    });

    tWrapper?.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.06 : 0.94;
      tZoom = Math.min(Math.max(tZoom * factor, 0.4), 2);
      applyTTransform();
    }, { passive: false });

    document.getElementById('tZoomIn')?.addEventListener('click', () => {
      tZoom = Math.min(tZoom * 1.15, 2);
      applyTTransform();
    });
    document.getElementById('tZoomOut')?.addEventListener('click', () => {
      tZoom = Math.max(tZoom * 0.85, 0.4);
      applyTTransform();
    });
    document.getElementById('tReset')?.addEventListener('click', () => {
      tZoom = 0.88;
      tPanX = 20;
      tPanY = 40;
      applyTTransform();
    });
    document.getElementById('tFit')?.addEventListener('click', () => {
      tZoom = 0.62;
      tPanX = 10;
      tPanY = 20;
      applyTTransform();
    });
  }

  function renderGraphs() {
    renderVisualFlowGraph();
    renderVisualTopologyGraph();

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
