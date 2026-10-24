/**
 * AstraCalc Pro • Quantum Precision Suite
 * Architecture: Modular State Machine, Expression Evaluator, 64-bit Programmer Engine,
 * Canvas Graphing Engine, Unit Converter, Web Audio Synthesizer & Session History.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. STATE MANAGEMENT
  // =========================================================================
  const state = {
    mode: 'standard', // 'standard' | 'scientific' | 'programmer' | 'graphing' | 'converter'
    displayValue: '0',
    expression: '',
    waitingForOperand: false,
    lastEvaluated: false,
    
    // Memory
    memory: 0,
    
    // Scientific toggles
    angleMode: 'DEG', // 'DEG' | 'RAD'
    isHyp: false,
    
    // Programmer Mode state
    progBase: 16, // 16, 10, 8, 2
    progWordSize: 64, // 64, 32, 16, 8
    progValue: 0n,
    progOperator: null,
    progPrevValue: null,
    
    // Sound & Theme
    soundEnabled: true,
    theme: 'dark-cyber',
    
    // Session History
    history: []
  };

  // =========================================================================
  // 2. DOM ELEMENT REFERENCES
  // =========================================================================
  const elements = {
    // Top Bar
    modePills: document.querySelectorAll('.mode-pill'),
    btnSound: document.getElementById('btn-sound'),
    soundOnIcon: document.querySelector('.icon-sound-on'),
    soundOffIcon: document.querySelector('.icon-sound-off'),
    btnTheme: document.getElementById('btn-theme'),
    themeDropdown: document.getElementById('theme-dropdown'),
    themeOptions: document.querySelectorAll('.theme-option'),
    btnToggleHistory: document.getElementById('btn-toggle-history'),
    historyBadge: document.getElementById('history-badge'),
    btnShortcuts: document.getElementById('btn-shortcuts'),
    modalShortcuts: document.getElementById('modal-shortcuts'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    
    // Panels
    standardScientificView: document.getElementById('standard-scientific-view'),
    scientificPanel: document.getElementById('scientific-panel'),
    programmerView: document.getElementById('programmer-view'),
    graphingView: document.getElementById('graphing-view'),
    converterView: document.getElementById('converter-view'),
    historySidebar: document.getElementById('history-sidebar'),
    btnCloseHistory: document.getElementById('btn-close-history'),
    btnClearHistory: document.getElementById('btn-clear-history'),
    btnExportHistory: document.getElementById('btn-export-history'),
    historyItemsContainer: document.getElementById('history-items-container'),
    
    // Display
    expressionDisplay: document.getElementById('expression-display'),
    resultDisplay: document.getElementById('result-display'),
    angleTag: document.getElementById('angle-tag'),
    hypTag: document.getElementById('hyp-tag'),
    memTag: document.getElementById('mem-tag'),
    modeTag: document.getElementById('mode-tag'),
    btnCopy: document.getElementById('btn-copy'),
    btnClearEntry: document.getElementById('btn-clear-entry'),
    toastNotify: document.getElementById('toast-notify'),
    toastText: document.getElementById('toast-text'),
    inspectorMemVal: document.getElementById('inspector-mem-val'),

    // Programmer Elements
    radixRows: document.querySelectorAll('.radix-row'),
    valHex: document.getElementById('val-hex'),
    valDec: document.getElementById('val-dec'),
    valOct: document.getElementById('val-oct'),
    valBin: document.getElementById('val-bin'),
    wordButtons: document.querySelectorAll('.btn-word'),
    bitMatrix: document.getElementById('bit-matrix'),
    bitCountLabel: document.getElementById('bit-count-label'),

    // Graphing Elements
    graphInput: document.getElementById('graph-formula-input'),
    btnPlotGraph: document.getElementById('btn-plot-graph'),
    graphCanvas: document.getElementById('function-canvas'),
    graphCoords: document.getElementById('graph-coords'),
    graphZoomIn: document.getElementById('graph-zoom-in'),
    graphZoomOut: document.getElementById('graph-zoom-out'),
    graphReset: document.getElementById('graph-reset'),
    graphPresets: document.querySelectorAll('.preset-chip'),

    // Converter Elements
    convCatTabs: document.querySelectorAll('.cat-pill'),
    convFromVal: document.getElementById('conv-from-val'),
    convToVal: document.getElementById('conv-to-val'),
    convFromUnit: document.getElementById('conv-from-unit'),
    convToUnit: document.getElementById('conv-to-unit'),
    btnConvSwap: document.getElementById('btn-conv-swap'),
    convFormulaText: document.getElementById('conv-formula-text'),

    // Scientific Toggles
    btnDegRad: document.getElementById('btn-deg-rad'),
    btnHyp: document.getElementById('btn-hyp')
  };

  // =========================================================================
  // 3. SYNTHESIZED MECHANICAL AUDIO (WEB AUDIO API)
  // =========================================================================
  let audioCtx = null;

  function playKeyClick(type = 'normal') {
    if (!state.soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
      }
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      filter.type = 'highpass';
      filter.frequency.value = type === 'equals' ? 800 : type === 'fn' ? 1200 : 1600;

      const now = audioCtx.currentTime;
      const freq = type === 'equals' ? 320 : type === 'fn' ? 480 : 640;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.035);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {
      // Audio fallback silent
    }
  }

  // =========================================================================
  // 4. TOAST NOTIFICATIONS & VISUAL FEEDBACK
  // =========================================================================
  let toastTimer = null;
  function showToast(message) {
    if (!elements.toastNotify) return;
    elements.toastText.textContent = message;
    elements.toastNotify.classList.remove('hide');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elements.toastNotify.classList.add('hide');
    }, 2200);
  }

  // =========================================================================
  // 5. MATH PARSER & SAFE EVALUATOR
  // =========================================================================
  /**
   * Evaluates standard and scientific math expressions cleanly.
   * Handles brackets, powers, scientific functions, and constants.
   */
  function evaluateMathExpression(rawExpr) {
    if (!rawExpr || !rawExpr.trim()) return 0;

    let sanitized = rawExpr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/π/g, `(${Math.PI})`)
      .replace(/e(?![a-zA-Z0-9])/g, `(${Math.E})`)
      .replace(/φ/g, `(${(1 + Math.sqrt(5)) / 2})`);

    // Handle factorial: 5! -> fact(5)
    sanitized = sanitized.replace(/(\d+(\.\d+)?)!/g, 'fact($1)');

    // Convert ^ to Math.pow(a, b) via safe operator transformation
    sanitized = replaceExponentiation(sanitized);

    // Prepare scope functions for evaluation
    const isDeg = state.angleMode === 'DEG';
    const toRad = (angle) => (isDeg ? (angle * Math.PI) / 180 : angle);
    const fromRad = (rad) => (isDeg ? (rad * 180) / Math.PI : rad);

    const scope = {
      sin: (x) => Math.sin(toRad(x)),
      cos: (x) => Math.cos(toRad(x)),
      tan: (x) => {
        const rad = toRad(x);
        if (Math.abs(Math.cos(rad)) < 1e-15) throw new Error('Tangent undefined');
        return Math.tan(rad);
      },
      asin: (x) => fromRad(Math.asin(x)),
      acos: (x) => fromRad(Math.acos(x)),
      atan: (x) => fromRad(Math.atan(x)),
      sinh: Math.sinh,
      cosh: Math.cosh,
      tanh: Math.tanh,
      ln: (x) => {
        if (x <= 0) throw new Error('Domain error for ln');
        return Math.log(x);
      },
      log: (x) => {
        if (x <= 0) throw new Error('Domain error for log');
        return Math.log10(x);
      },
      log2: (x) => {
        if (x <= 0) throw new Error('Domain error for log2');
        return Math.log2(x);
      },
      sqrt: (x) => {
        if (x < 0) throw new Error('Square root of negative');
        return Math.sqrt(x);
      },
      cbrt: Math.cbrt,
      abs: Math.abs,
      fact: (n) => {
        n = Math.round(n);
        if (n < 0) throw new Error('Factorial of negative');
        if (n > 170) return Infinity;
        let res = 1;
        for (let i = 2; i <= n; i++) res *= i;
        return res;
      },
      pow: Math.pow
    };

    // Replace function calls with scope keys
    sanitized = sanitized
      .replace(/asin\(/g, 'scope.asin(')
      .replace(/acos\(/g, 'scope.acos(')
      .replace(/atan\(/g, 'scope.atan(')
      .replace(/sinh\(/g, 'scope.sinh(')
      .replace(/cosh\(/g, 'scope.cosh(')
      .replace(/tanh\(/g, 'scope.tanh(')
      .replace(/(?<!a|c|t)sin\(/g, 'scope.sin(')
      .replace(/(?<!a)cos\(/g, 'scope.cos(')
      .replace(/(?<!a)tan\(/g, 'scope.tan(')
      .replace(/log10\(/g, 'scope.log(')
      .replace(/log2\(/g, 'scope.log2(')
      .replace(/(?<!\w)log\(/g, 'scope.log(')
      .replace(/(?<!\w)ln\(/g, 'scope.ln(')
      .replace(/sqrt\(/g, 'scope.sqrt(')
      .replace(/cbrt\(/g, 'scope.cbrt(')
      .replace(/abs\(/g, 'scope.abs(')
      .replace(/fact\(/g, 'scope.fact(');

    // Validate safe characters only (numbers, operators, scope, parens, decimal, comma)
    if (!/^[0-9+\-*/%.() ,Mathscopeasincoertlwby]+$/.test(sanitized)) {
      throw new Error('Invalid characters in formula');
    }

    // Safely evaluate within sandbox
    const evalFn = new Function('scope', `"use strict"; return (${sanitized});`);
    const result = evalFn(scope);

    if (typeof result !== 'number' || isNaN(result)) {
      throw new Error('Calculation error');
    }
    if (!isFinite(result)) {
      throw new Error('Division by zero');
    }

    // Clean floating point rounding noise (e.g. 0.1 + 0.2 -> 0.3)
    return parseFloat(result.toPrecision(14));
  }

  function replaceExponentiation(expr) {
    // Replaces expressions like a ^ b with Math.pow(a, b)
    while (expr.includes('^')) {
      const idx = expr.lastIndexOf('^');
      // find base left of ^
      let left = '';
      let leftPos = idx - 1;
      let pCount = 0;
      if (expr[leftPos] === ')') {
        pCount++;
        leftPos--;
        while (leftPos >= 0 && pCount > 0) {
          if (expr[leftPos] === ')') pCount++;
          if (expr[leftPos] === '(') pCount--;
          leftPos--;
        }
        left = expr.substring(leftPos + 1, idx);
      } else {
        while (leftPos >= 0 && /[0-9a-zA-Z._$]/.test(expr[leftPos])) {
          leftPos--;
        }
        left = expr.substring(leftPos + 1, idx);
      }

      // find power right of ^
      let right = '';
      let rightPos = idx + 1;
      pCount = 0;
      if (expr[rightPos] === '(') {
        pCount++;
        rightPos++;
        while (rightPos < expr.length && pCount > 0) {
          if (expr[rightPos] === '(') pCount++;
          if (expr[rightPos] === ')') pCount--;
          rightPos++;
        }
        right = expr.substring(idx + 1, rightPos);
      } else {
        while (rightPos < expr.length && /[0-9a-zA-Z._$]/.test(expr[rightPos])) {
          rightPos++;
        }
        right = expr.substring(idx + 1, rightPos);
      }

      const repl = `scope.pow(${left},${right})`;
      expr = expr.substring(0, leftPos + 1) + repl + expr.substring(rightPos);
    }
    return expr;
  }

  // =========================================================================
  // 6. STANDARD & SCIENTIFIC CONTROLLER
  // =========================================================================
  function formatNumber(num) {
    if (isNaN(num)) return 'Error';
    const str = num.toString();
    if (str.includes('e') || str.length > 14) {
      return Number(num).toPrecision(8);
    }
    const parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function updateDisplay() {
    elements.resultDisplay.textContent = state.displayValue;
    elements.expressionDisplay.textContent = state.expression;
    elements.angleTag.textContent = state.angleMode;
    elements.modeTag.textContent = state.mode.toUpperCase().slice(0, 3);
    
    if (state.memory !== 0) {
      elements.memTag.classList.remove('hide');
      elements.inspectorMemVal.textContent = state.memory;
    } else {
      elements.memTag.classList.add('hide');
      elements.inspectorMemVal.textContent = '0';
    }

    if (state.isHyp) {
      elements.hypTag.classList.remove('hide');
    } else {
      elements.hypTag.classList.add('hide');
    }

    // Auto-adjust font size for large expressions
    const len = state.displayValue.length;
    if (len > 14) {
      elements.resultDisplay.style.fontSize = '1.6rem';
    } else if (len > 9) {
      elements.resultDisplay.style.fontSize = '2.1rem';
    } else {
      elements.resultDisplay.style.fontSize = '2.75rem';
    }
  }

  function handleDigit(digit) {
    playKeyClick('normal');
    if (state.lastEvaluated) {
      state.displayValue = digit;
      state.expression = '';
      state.lastEvaluated = false;
      state.waitingForOperand = false;
    } else if (state.waitingForOperand || state.displayValue === '0') {
      state.displayValue = digit;
      state.waitingForOperand = false;
    } else {
      state.displayValue += digit;
    }
    updateDisplay();
  }

  function handleDecimal() {
    playKeyClick('normal');
    if (state.lastEvaluated) {
      state.displayValue = '0.';
      state.expression = '';
      state.lastEvaluated = false;
      state.waitingForOperand = false;
    } else if (state.waitingForOperand) {
      state.displayValue = '0.';
      state.waitingForOperand = false;
    } else if (!state.displayValue.includes('.')) {
      state.displayValue += '.';
    }
    updateDisplay();
  }

  function handleOperator(op) {
    playKeyClick('fn');
    if (state.lastEvaluated) {
      state.expression = `${state.displayValue} ${op} `;
      state.lastEvaluated = false;
    } else if (state.waitingForOperand) {
      // Replace last operator
      state.expression = state.expression.replace(/[\+\−\×\÷\^\%]\s*$/, `${op} `);
    } else {
      state.expression += `${state.displayValue} ${op} `;
    }
    state.waitingForOperand = true;
    updateDisplay();
  }

  function handleParenthesis(paren) {
    playKeyClick('fn');
    if (paren === '(') {
      if (state.lastEvaluated) {
        state.expression = '(';
        state.lastEvaluated = false;
      } else {
        state.expression += '(';
      }
      state.waitingForOperand = true;
    } else {
      state.expression += `${state.displayValue})`;
      state.waitingForOperand = false;
    }
    updateDisplay();
  }

  function handleCalculate() {
    playKeyClick('equals');
    const fullExpr = state.expression + (state.waitingForOperand ? '' : state.displayValue);
    if (!fullExpr.trim()) return;

    try {
      const res = evaluateMathExpression(fullExpr);
      const resFormatted = res.toString();

      // Add to session history
      addHistoryItem(fullExpr, resFormatted);

      state.expression = `${fullExpr} =`;
      state.displayValue = resFormatted;
      state.lastEvaluated = true;
      state.waitingForOperand = false;
    } catch (err) {
      state.displayValue = err.message || 'Error';
      state.lastEvaluated = true;
    }
    updateDisplay();
  }

  function handleScientificFunction(fn) {
    playKeyClick('fn');
    let val = parseFloat(state.displayValue);
    if (isNaN(val)) val = 0;

    let res = 0;
    try {
      const isDeg = state.angleMode === 'DEG';
      const toRad = (x) => (isDeg ? (x * Math.PI) / 180 : x);
      const fromRad = (r) => (isDeg ? (r * 180) / Math.PI : r);

      switch (fn) {
        case 'sin':
          res = state.isHyp ? Math.sinh(val) : Math.sin(toRad(val));
          break;
        case 'cos':
          res = state.isHyp ? Math.cosh(val) : Math.cos(toRad(val));
          break;
        case 'tan':
          if (!state.isHyp && Math.abs(Math.cos(toRad(val))) < 1e-15) {
            throw new Error('Undefined');
          }
          res = state.isHyp ? Math.tanh(val) : Math.tan(toRad(val));
          break;
        case 'asin':
          if (val < -1 || val > 1) throw new Error('Domain Error');
          res = fromRad(Math.asin(val));
          break;
        case 'acos':
          if (val < -1 || val > 1) throw new Error('Domain Error');
          res = fromRad(Math.acos(val));
          break;
        case 'atan':
          res = fromRad(Math.atan(val));
          break;
        case 'ln':
          if (val <= 0) throw new Error('Domain Error');
          res = Math.log(val);
          break;
        case 'log':
          if (val <= 0) throw new Error('Domain Error');
          res = Math.log10(val);
          break;
        case 'log2':
          if (val <= 0) throw new Error('Domain Error');
          res = Math.log2(val);
          break;
        case 'sqrt':
          if (val < 0) throw new Error('Domain Error');
          res = Math.sqrt(val);
          break;
        case 'cbrt':
          res = Math.cbrt(val);
          break;
        case 'sqr':
          res = val * val;
          break;
        case 'cube':
          res = val * val * val;
          break;
        case 'recip':
          if (val === 0) throw new Error('Divide by zero');
          res = 1 / val;
          break;
        case 'exp10':
          res = Math.pow(10, val);
          break;
        case 'abs':
          res = Math.abs(val);
          break;
        case 'fact':
          if (val < 0) throw new Error('Domain Error');
          res = 1;
          for (let i = 2; i <= Math.min(val, 170); i++) res *= i;
          break;
        default:
          res = val;
      }

      res = parseFloat(res.toPrecision(14));
      addHistoryItem(`${fn}(${val})`, res.toString());
      state.displayValue = res.toString();
      state.lastEvaluated = true;
    } catch (err) {
      state.displayValue = err.message || 'Error';
      state.lastEvaluated = true;
    }
    updateDisplay();
  }

  function handleConstant(constName) {
    playKeyClick('fn');
    let val = 0;
    if (constName === 'pi') val = Math.PI;
    else if (constName === 'e') val = Math.E;
    else if (constName === 'phi') val = (1 + Math.sqrt(5)) / 2;

    state.displayValue = parseFloat(val.toPrecision(14)).toString();
    state.waitingForOperand = false;
    state.lastEvaluated = false;
    updateDisplay();
  }

  function handleNegate() {
    playKeyClick('normal');
    if (state.displayValue !== '0' && state.displayValue !== 'Error') {
      if (state.displayValue.startsWith('-')) {
        state.displayValue = state.displayValue.substring(1);
      } else {
        state.displayValue = '-' + state.displayValue;
      }
    }
    updateDisplay();
  }

  function handleAllClear() {
    playKeyClick('fn');
    state.displayValue = '0';
    state.expression = '';
    state.waitingForOperand = false;
    state.lastEvaluated = false;
    if (state.mode === 'programmer') {
      state.progValue = 0n;
      state.progOperator = null;
      state.progPrevValue = null;
      updateProgrammerView();
    }
    updateDisplay();
  }

  function handleBackspace() {
    playKeyClick('normal');
    if (state.lastEvaluated) {
      state.expression = '';
      state.lastEvaluated = false;
    }
    if (state.displayValue.length > 1) {
      state.displayValue = state.displayValue.slice(0, -1);
    } else {
      state.displayValue = '0';
    }
    updateDisplay();
  }

  function handleMemory(memAction) {
    playKeyClick('fn');
    const val = parseFloat(state.displayValue) || 0;
    switch (memAction) {
      case 'MC':
        state.memory = 0;
        showToast('Memory Cleared');
        break;
      case 'MR':
        state.displayValue = state.memory.toString();
        state.waitingForOperand = false;
        showToast(`Memory Recalled: ${state.memory}`);
        break;
      case 'M+':
        state.memory += val;
        showToast(`Added to Memory: +${val}`);
        break;
      case 'M-':
        state.memory -= val;
        showToast(`Subtracted from Memory: -${val}`);
        break;
      case 'MS':
        state.memory = val;
        showToast(`Stored in Memory: ${val}`);
        break;
    }
    updateDisplay();
  }

  // =========================================================================
  // 7. PROGRAMMER MODE CONTROLLER (64-bit Engine & Interactive Bit Board)
  // =========================================================================
  function getWordMask() {
    switch (state.progWordSize) {
      case 8: return 0xFFn;
      case 16: return 0xFFFFn;
      case 32: return 0xFFFFFFFFn;
      case 64:
      default: return 0xFFFFFFFFFFFFFFFFn;
    }
  }

  function maskValue(val) {
    const mask = getWordMask();
    let masked = BigInt(val) & mask;
    // ensure within range
    if (masked < 0n) masked = (masked + mask + 1n) & mask;
    return masked;
  }

  function renderBitMatrix() {
    if (!elements.bitMatrix) return;
    elements.bitMatrix.innerHTML = '';

    const wordSize = state.progWordSize;
    let setBits = 0;

    for (let bit = 63; bit >= 0; bit--) {
      const isBitSet = (state.progValue & (1n << BigInt(bit))) !== 0n;
      const isBitActive = bit < wordSize;

      if (isBitSet && isBitActive) setBits++;

      const cell = document.createElement('div');
      cell.className = `bit-cell ${isBitSet && isBitActive ? 'bit-on' : ''} ${!isBitActive ? 'bit-disabled' : ''}`;
      cell.dataset.bit = bit;
      cell.title = `Bit ${bit} (${isBitSet ? '1' : '0'})`;
      cell.textContent = isBitActive ? (isBitSet ? '1' : '0') : '-';

      cell.addEventListener('click', () => {
        if (!isBitActive) return;
        playKeyClick('normal');
        state.progValue ^= (1n << BigInt(bit));
        state.progValue = maskValue(state.progValue);
        updateProgrammerView();
      });

      elements.bitMatrix.appendChild(cell);
    }

    elements.bitCountLabel.textContent = `${setBits} bit${setBits === 1 ? '' : 's'} set`;
  }

  function updateProgrammerView() {
    const val = state.progValue;
    const mask = getWordMask();

    // Format HEX
    elements.valHex.textContent = '0x' + (val & mask).toString(16).toUpperCase();

    // Format DEC
    elements.valDec.textContent = (val & mask).toString(10);

    // Format OCT
    elements.valOct.textContent = '0o' + (val & mask).toString(8);

    // Format BIN with 4-bit nibble spacing
    let binStr = (val & mask).toString(2).padStart(state.progWordSize, '0');
    let chunked = binStr.match(/.{1,4}/g)?.join(' ') || binStr;
    elements.valBin.textContent = chunked;

    // Sync primary display with active programmer base
    let currentRepr = '';
    if (state.progBase === 16) currentRepr = (val & mask).toString(16).toUpperCase();
    else if (state.progBase === 10) currentRepr = (val & mask).toString(10);
    else if (state.progBase === 8) currentRepr = (val & mask).toString(8);
    else if (state.progBase === 2) currentRepr = (val & mask).toString(2);

    state.displayValue = currentRepr || '0';
    elements.resultDisplay.textContent = state.displayValue;

    // Render bit cells
    renderBitMatrix();
    updateProgrammerKeypadState();
  }

  function updateProgrammerKeypadState() {
    // Disable or enable hex buttons A-F and numbers 2-9 depending on selected base
    const base = state.progBase;
    const hexBtns = document.querySelectorAll('.btn-hex');
    const numBtns = elements.programmerView.querySelectorAll('.btn-num');

    hexBtns.forEach(btn => {
      btn.disabled = base < 16;
    });

    numBtns.forEach(btn => {
      const num = parseInt(btn.dataset.num, 10);
      btn.disabled = num >= base;
    });
  }

  function handleProgDigit(char) {
    playKeyClick('normal');
    try {
      let currentStr = state.progValue.toString(state.progBase);
      if (state.waitingForOperand || state.progValue === 0n) {
        currentStr = char;
        state.waitingForOperand = false;
      } else {
        currentStr += char;
      }
      state.progValue = maskValue(BigInt(`0x${parseInt(currentStr, state.progBase).toString(16)}`));
      updateProgrammerView();
    } catch (e) {
      // ignore invalid base digit
    }
  }

  function handleProgBitwiseOp(op) {
    playKeyClick('fn');
    const val = state.progValue;
    const mask = getWordMask();

    switch (op) {
      case 'NOT':
        state.progValue = maskValue(~val);
        addHistoryItem(`NOT (${val})`, state.progValue.toString(state.progBase));
        break;
      case 'LSH':
        state.progValue = maskValue(val << 1n);
        break;
      case 'RSH':
        state.progValue = maskValue(val >> 1n);
        break;
      case 'ROL': {
        const topBit = (val >> BigInt(state.progWordSize - 1)) & 1n;
        state.progValue = maskValue((val << 1n) | topBit);
        break;
      }
      case 'ROR': {
        const lowBit = val & 1n;
        state.progValue = maskValue((val >> 1n) | (lowBit << BigInt(state.progWordSize - 1)));
        break;
      }
      case 'AND':
      case 'OR':
      case 'XOR':
      case 'NAND':
      case 'NOR':
      case 'XNOR':
        state.progPrevValue = val;
        state.progOperator = op;
        state.waitingForOperand = true;
        state.expression = `${val.toString(state.progBase)} ${op} `;
        elements.expressionDisplay.textContent = state.expression;
        return;
    }

    updateProgrammerView();
  }

  function handleProgEquals() {
    playKeyClick('equals');
    if (state.progOperator && state.progPrevValue !== null) {
      const a = state.progPrevValue;
      const b = state.progValue;
      let res = 0n;

      switch (state.progOperator) {
        case 'AND': res = a & b; break;
        case 'OR': res = a | b; break;
        case 'XOR': res = a ^ b; break;
        case 'NAND': res = ~(a & b); break;
        case 'NOR': res = ~(a | b); break;
        case 'XNOR': res = ~(a ^ b); break;
        default: res = b;
      }

      res = maskValue(res);
      addHistoryItem(`${a.toString(state.progBase)} ${state.progOperator} ${b.toString(state.progBase)}`, res.toString(state.progBase));
      state.progValue = res;
      state.progPrevValue = null;
      state.progOperator = null;
      state.waitingForOperand = true;
      state.expression = '';
      elements.expressionDisplay.textContent = '';
      updateProgrammerView();
    }
  }

  // =========================================================================
  // 8. GRAPHING CANVAS ENGINE
  // =========================================================================
  const graphState = {
    xRange: 10,
    yRange: 10,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0
  };

  function initGraphCanvas() {
    const canvas = elements.graphCanvas;
    if (!canvas) return;

    // Retina resolution scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    drawGraph();
  }

  function drawGraph() {
    const canvas = elements.graphCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, width, height);

    const originX = width / 2 + graphState.offsetX * dpr;
    const originY = height / 2 + graphState.offsetY * dpr;
    const scaleX = width / (graphState.xRange * 2);
    const scaleY = height / (graphState.yRange * 2);

    // 1. Draw Grid Lines
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;

    // Vertical grid ticks
    const stepX = calculateGridStep(graphState.xRange);
    for (let x = -Math.ceil(graphState.xRange); x <= Math.ceil(graphState.xRange); x += stepX) {
      if (Math.abs(x) < 0.0001) continue;
      const px = originX + x * scaleX;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
      ctx.fillText(x.toFixed(x % 1 === 0 ? 0 : 1), px + 4 * dpr, originY + 14 * dpr);
    }

    // Horizontal grid ticks
    const stepY = calculateGridStep(graphState.yRange);
    for (let y = -Math.ceil(graphState.yRange); y <= Math.ceil(graphState.yRange); y += stepY) {
      if (Math.abs(y) < 0.0001) continue;
      const py = originY - y * scaleY;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
      ctx.fillText(y.toFixed(y % 1 === 0 ? 0 : 1), originX + 5 * dpr, py - 4 * dpr);
    }

    // 2. Draw Main Axes
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.beginPath();
    // X Axis
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    // Y Axis
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // 3. Compile Formula and Plot Function Curve
    const formulaStr = elements.graphInput.value.trim();
    if (!formulaStr) return;

    try {
      const f = compileFunction(formulaStr);
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = '#00f0ff';
      ctx.shadowColor = 'rgba(0, 240, 255, 0.7)';
      ctx.shadowBlur = 12 * dpr;
      ctx.beginPath();

      let started = false;
      const stepPixel = 2; // draw sample every 2 pixels

      for (let px = 0; px <= width; px += stepPixel) {
        const mathX = (px - originX) / scaleX;
        let mathY;
        try {
          mathY = f(mathX);
        } catch (e) {
          started = false;
          continue;
        }

        if (isNaN(mathY) || !isFinite(mathY) || Math.abs(mathY) > graphState.yRange * 5) {
          started = false;
          continue;
        }

        const py = originY - mathY * scaleY;
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0; // reset glow
    } catch (err) {
      // Invalid syntax in formula
    }
  }

  function calculateGridStep(range) {
    if (range <= 2) return 0.5;
    if (range <= 5) return 1;
    if (range <= 20) return 2;
    if (range <= 50) return 5;
    return 10;
  }

  function compileFunction(expr) {
    let sanitized = expr
      .replace(/\^/g, '**')
      .replace(/sin\(/g, 'Math.sin(')
      .replace(/cos\(/g, 'Math.cos(')
      .replace(/tan\(/g, 'Math.tan(')
      .replace(/abs\(/g, 'Math.abs(')
      .replace(/sqrt\(/g, 'Math.sqrt(')
      .replace(/log\(/g, 'Math.log10(')
      .replace(/ln\(/g, 'Math.log(')
      .replace(/pi/gi, 'Math.PI')
      .replace(/e(?![a-z])/gi, 'Math.E');

    return new Function('x', `"use strict"; return (${sanitized});`);
  }

  // =========================================================================
  // 9. UNIT CONVERTER ENGINE
  // =========================================================================
  const CONVERSION_DATA = {
    length: {
      units: ['Meters (m)', 'Kilometers (km)', 'Centimeters (cm)', 'Millimeters (mm)', 'Miles (mi)', 'Yards (yd)', 'Feet (ft)', 'Inches (in)'],
      toBase: {
        'Meters (m)': 1,
        'Kilometers (km)': 1000,
        'Centimeters (cm)': 0.01,
        'Millimeters (mm)': 0.001,
        'Miles (mi)': 1609.344,
        'Yards (yd)': 0.9144,
        'Feet (ft)': 0.3048,
        'Inches (in)': 0.0254
      }
    },
    mass: {
      units: ['Kilograms (kg)', 'Grams (g)', 'Milligrams (mg)', 'Pounds (lb)', 'Ounces (oz)', 'Metric Tons (t)'],
      toBase: {
        'Kilograms (kg)': 1,
        'Grams (g)': 0.001,
        'Milligrams (mg)': 0.000001,
        'Pounds (lb)': 0.45359237,
        'Ounces (oz)': 0.02834952,
        'Metric Tons (t)': 1000
      }
    },
    temperature: {
      units: ['Celsius (°C)', 'Fahrenheit (°F)', 'Kelvin (K)'],
      convert: (val, from, to) => {
        let celsius = val;
        if (from === 'Fahrenheit (°F)') celsius = (val - 32) * (5 / 9);
        else if (from === 'Kelvin (K)') celsius = val - 273.15;

        if (to === 'Celsius (°C)') return celsius;
        if (to === 'Fahrenheit (°F)') return (celsius * 9) / 5 + 32;
        if (to === 'Kelvin (K)') return celsius + 273.15;
        return celsius;
      }
    },
    speed: {
      units: ['Meters/sec (m/s)', 'Kilometers/hour (km/h)', 'Miles/hour (mph)', 'Knots (kn)', 'Mach (at sea lvl)'],
      toBase: {
        'Meters/sec (m/s)': 1,
        'Kilometers/hour (km/h)': 0.277778,
        'Miles/hour (mph)': 0.44704,
        'Knots (kn)': 0.514444,
        'Mach (at sea lvl)': 340.29
      }
    },
    data: {
      units: ['Bytes (B)', 'Kilobytes (KB)', 'Megabytes (MB)', 'Gigabytes (GB)', 'Terabytes (TB)', 'Petabytes (PB)'],
      toBase: {
        'Bytes (B)': 1,
        'Kilobytes (KB)': 1024,
        'Megabytes (MB)': 1024 * 1024,
        'Gigabytes (GB)': 1024 * 1024 * 1024,
        'Terabytes (TB)': 1024 * 1024 * 1024 * 1024,
        'Petabytes (PB)': 1024 * 1024 * 1024 * 1024 * 1024
      }
    },
    time: {
      units: ['Seconds (s)', 'Minutes (min)', 'Hours (h)', 'Days (d)', 'Weeks (wk)', 'Years (yr)'],
      toBase: {
        'Seconds (s)': 1,
        'Minutes (min)': 60,
        'Hours (h)': 3600,
        'Days (d)': 86400,
        'Weeks (wk)': 604800,
        'Years (yr)': 31536000
      }
    },
    area: {
      units: ['Square Meters (m²)', 'Square Kilometers (km²)', 'Square Feet (ft²)', 'Acres (ac)', 'Hectares (ha)'],
      toBase: {
        'Square Meters (m²)': 1,
        'Square Kilometers (km²)': 1000000,
        'Square Feet (ft²)': 0.092903,
        'Acres (ac)': 4046.86,
        'Hectares (ha)': 10000
      }
    }
  };

  let activeConvCat = 'length';

  function setupConverterCategory(catName) {
    activeConvCat = catName;
    const cat = CONVERSION_DATA[catName];
    if (!cat) return;

    elements.convFromUnit.innerHTML = '';
    elements.convToUnit.innerHTML = '';

    cat.units.forEach((u, i) => {
      const opt1 = document.createElement('option');
      opt1.value = u;
      opt1.textContent = u;
      elements.convFromUnit.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = u;
      opt2.textContent = u;
      elements.convToUnit.appendChild(opt2);
    });

    elements.convFromUnit.selectedIndex = 0;
    elements.convToUnit.selectedIndex = Math.min(1, cat.units.length - 1);

    executeConversion();
  }

  function executeConversion() {
    const fromVal = parseFloat(elements.convFromVal.value);
    if (isNaN(fromVal)) {
      elements.convToVal.value = '';
      return;
    }

    const cat = CONVERSION_DATA[activeConvCat];
    const fromUnit = elements.convFromUnit.value;
    const toUnit = elements.convToUnit.value;
    let converted = 0;

    if (cat.convert) {
      converted = cat.convert(fromVal, fromUnit, toUnit);
    } else {
      const baseVal = fromVal * cat.toBase[fromUnit];
      converted = baseVal / cat.toBase[toUnit];
    }

    elements.convToVal.value = parseFloat(converted.toPrecision(8));
    elements.convFormulaText.textContent = `1 ${fromUnit.split(' ')[0]} = ${parseFloat((cat.convert ? cat.convert(1, fromUnit, toUnit) : cat.toBase[fromUnit] / cat.toBase[toUnit]).toPrecision(6))} ${toUnit.split(' ')[0]}`;
  }

  // =========================================================================
  // 10. HISTORY MANAGEMENT
  // =========================================================================
  function addHistoryItem(expression, result) {
    const item = {
      id: Date.now(),
      expression,
      result,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    state.history.unshift(item);
    if (state.history.length > 50) state.history.pop();
    renderHistory();
  }

  function renderHistory() {
    const container = elements.historyItemsContainer;
    elements.historyBadge.textContent = state.history.length;

    if (state.history.length === 0) {
      container.innerHTML = `
        <div class="empty-history-notice">
          <div class="empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <p class="empty-title">No calculations yet</p>
          <p class="empty-desc">Your results and operations will appear here for quick recall.</p>
        </div>`;
      return;
    }

    container.innerHTML = '';
    state.history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <span class="history-time">${item.timestamp}</span>
        <span class="history-expr">${item.expression}</span>
        <span class="history-res">= ${item.result}</span>
      `;

      div.addEventListener('click', () => {
        playKeyClick('normal');
        state.expression = `${item.expression} =`;
        state.displayValue = item.result;
        state.lastEvaluated = true;
        updateDisplay();
        showToast('Recalled to display');
      });

      container.appendChild(div);
    });
  }

  function exportHistory() {
    if (state.history.length === 0) {
      showToast('No history to export');
      return;
    }
    const lines = state.history.map(h => `[${h.timestamp}] ${h.expression} = ${h.result}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AstraCalc_History_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('History exported to TXT');
  }

  // =========================================================================
  // 11. MODE SWITCHING
  // =========================================================================
  function setMode(newMode) {
    playKeyClick('fn');
    state.mode = newMode;

    elements.modePills.forEach(pill => {
      pill.classList.toggle('active', pill.dataset.mode === newMode);
    });

    // Hide all panels
    elements.standardScientificView.classList.add('hide');
    elements.scientificPanel.classList.remove('show');
    elements.programmerView.classList.add('hide');
    elements.graphingView.classList.add('hide');
    elements.converterView.classList.add('hide');

    if (newMode === 'standard') {
      elements.standardScientificView.classList.remove('hide');
      elements.scientificPanel.classList.remove('show');
    } else if (newMode === 'scientific') {
      elements.standardScientificView.classList.remove('hide');
      elements.scientificPanel.classList.add('show');
    } else if (newMode === 'programmer') {
      elements.programmerView.classList.remove('hide');
      updateProgrammerView();
    } else if (newMode === 'graphing') {
      elements.graphingView.classList.remove('hide');
      setTimeout(initGraphCanvas, 50);
    } else if (newMode === 'converter') {
      elements.converterView.classList.remove('hide');
      setupConverterCategory(activeConvCat);
    }

    updateDisplay();
  }

  // =========================================================================
  // 12. EVENT LISTENERS SETUP
  // =========================================================================
  function setupEventListeners() {
    // Mode Navigation
    elements.modePills.forEach(pill => {
      pill.addEventListener('click', () => setMode(pill.dataset.mode));
    });

    // Sound Toggle
    elements.btnSound.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      elements.soundOnIcon.classList.toggle('hide', !state.soundEnabled);
      elements.soundOffIcon.classList.toggle('hide', state.soundEnabled);
      showToast(state.soundEnabled ? 'Mechanical Clicks ON' : 'Sound Muted');
    });

    // Theme Picker
    elements.btnTheme.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.themeDropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      elements.themeDropdown.classList.remove('show');
    });

    elements.themeOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        const theme = opt.dataset.themeVal;
        document.body.dataset.theme = theme;
        elements.themeOptions.forEach(o => o.classList.toggle('active', o === opt));
        showToast(`Theme changed: ${opt.textContent.trim()}`);
      });
    });

    // History Sidebar toggle
    elements.btnToggleHistory.addEventListener('click', () => {
      elements.historySidebar.classList.toggle('hide');
    });
    if (elements.btnCloseHistory) {
      elements.btnCloseHistory.addEventListener('click', () => {
        elements.historySidebar.classList.add('hide');
      });
    }

    elements.btnClearHistory.addEventListener('click', () => {
      state.history = [];
      renderHistory();
      showToast('History cleared');
    });

    elements.btnExportHistory.addEventListener('click', exportHistory);

    // Shortcuts Modal
    elements.btnShortcuts.addEventListener('click', () => {
      elements.modalShortcuts.classList.remove('hide');
    });
    elements.btnCloseModal.addEventListener('click', () => {
      elements.modalShortcuts.classList.add('hide');
    });
    elements.modalShortcuts.addEventListener('click', (e) => {
      if (e.target === elements.modalShortcuts) {
        elements.modalShortcuts.classList.add('hide');
      }
    });

    // Copy Result Button
    elements.btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(state.displayValue).then(() => {
        showToast('Copied result to clipboard!');
      }).catch(() => {
        showToast('Failed to copy');
      });
    });

    elements.btnClearEntry.addEventListener('click', handleBackspace);

    // Standard & Scientific Keypad Clicks (Event Delegation)
    elements.standardScientificView.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target) return;

      if (target.dataset.num !== undefined) {
        handleDigit(target.dataset.num);
      } else if (target.dataset.op) {
        handleOperator(target.dataset.op);
      } else if (target.dataset.fn) {
        handleScientificFunction(target.dataset.fn);
      } else if (target.dataset.const) {
        handleConstant(target.dataset.const);
      } else if (target.dataset.mem) {
        handleMemory(target.dataset.mem);
      } else if (target.dataset.action === 'calculate') {
        handleCalculate();
      } else if (target.dataset.action === 'all-clear') {
        handleAllClear();
      } else if (target.dataset.action === 'decimal') {
        handleDecimal();
      } else if (target.dataset.action === 'negate') {
        handleNegate();
      } else if (target.dataset.action === 'paren') {
        handleParenthesis(target.dataset.val);
      } else if (target.dataset.action === 'toggle-deg-rad') {
        state.angleMode = state.angleMode === 'DEG' ? 'RAD' : 'DEG';
        elements.btnDegRad.textContent = state.angleMode;
        updateDisplay();
        showToast(`Angle mode: ${state.angleMode}`);
      } else if (target.dataset.action === 'toggle-hyp') {
        state.isHyp = !state.isHyp;
        elements.btnHyp.classList.toggle('active', state.isHyp);
        updateDisplay();
        showToast(`Hyperbolic: ${state.isHyp ? 'ON' : 'OFF'}`);
      }
    });

    // Programmer Mode Listeners
    elements.radixRows.forEach(row => {
      row.addEventListener('click', () => {
        playKeyClick('fn');
        elements.radixRows.forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        state.progBase = parseInt(row.dataset.base, 10);
        updateProgrammerView();
      });
    });

    elements.wordButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        playKeyClick('fn');
        elements.wordButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.progWordSize = parseInt(btn.dataset.word, 10);
        state.progValue = maskValue(state.progValue);
        updateProgrammerView();
      });
    });

    elements.programmerView.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target) return;

      if (target.dataset.hex) {
        handleProgDigit(target.dataset.hex);
      } else if (target.dataset.num !== undefined) {
        handleProgDigit(target.dataset.num);
      } else if (target.dataset.progOp) {
        handleProgBitwiseOp(target.dataset.progOp);
      } else if (target.dataset.action === 'calculate') {
        handleProgEquals();
      } else if (target.dataset.action === 'all-clear') {
        handleAllClear();
      }
    });

    // Graphing Listeners
    elements.btnPlotGraph.addEventListener('click', drawGraph);
    elements.graphInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') drawGraph();
    });

    elements.graphPresets.forEach(preset => {
      preset.addEventListener('click', () => {
        elements.graphInput.value = preset.dataset.preset;
        drawGraph();
        showToast(`Preset: ${preset.dataset.preset}`);
      });
    });

    elements.graphZoomIn.addEventListener('click', () => {
      graphState.xRange = Math.max(2, graphState.xRange * 0.7);
      graphState.yRange = Math.max(2, graphState.yRange * 0.7);
      drawGraph();
    });

    elements.graphZoomOut.addEventListener('click', () => {
      graphState.xRange = Math.min(100, graphState.xRange * 1.4);
      graphState.yRange = Math.min(100, graphState.yRange * 1.4);
      drawGraph();
    });

    elements.graphReset.addEventListener('click', () => {
      graphState.xRange = 10;
      graphState.yRange = 10;
      graphState.offsetX = 0;
      graphState.offsetY = 0;
      drawGraph();
    });

    // Canvas Mouse Move Coordinate Tracker & Pan
    const canvas = elements.graphCanvas;
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      if (graphState.isDragging) {
        graphState.offsetX += clientX - graphState.dragStartX;
        graphState.offsetY += clientY - graphState.dragStartY;
        graphState.dragStartX = clientX;
        graphState.dragStartY = clientY;
        drawGraph();
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const originX = (canvas.width / 2) + graphState.offsetX * dpr;
      const originY = (canvas.height / 2) + graphState.offsetY * dpr;
      const scaleX = canvas.width / (graphState.xRange * 2);
      const scaleY = canvas.height / (graphState.yRange * 2);

      const mathX = ((clientX * dpr) - originX) / scaleX;
      const mathY = (originY - (clientY * dpr)) / scaleY;

      elements.graphCoords.textContent = `x: ${mathX.toFixed(2)}, y: ${mathY.toFixed(2)}`;
    });

    canvas.addEventListener('mousedown', (e) => {
      graphState.isDragging = true;
      const rect = canvas.getBoundingClientRect();
      graphState.dragStartX = e.clientX - rect.left;
      graphState.dragStartY = e.clientY - rect.top;
    });

    window.addEventListener('mouseup', () => {
      graphState.isDragging = false;
    });

    // Converter Listeners
    elements.convCatTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        elements.convCatTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        setupConverterCategory(tab.dataset.cat);
      });
    });

    elements.convFromVal.addEventListener('input', executeConversion);
    elements.convFromUnit.addEventListener('change', executeConversion);
    elements.convToUnit.addEventListener('change', executeConversion);

    elements.btnConvSwap.addEventListener('click', () => {
      playKeyClick('fn');
      const tempIdx = elements.convFromUnit.selectedIndex;
      elements.convFromUnit.selectedIndex = elements.convToUnit.selectedIndex;
      elements.convToUnit.selectedIndex = tempIdx;
      executeConversion();
    });

    // Physical Keyboard Shortcuts
    window.addEventListener('keydown', handleKeyboardInput);
    window.addEventListener('resize', () => {
      if (state.mode === 'graphing') initGraphCanvas();
    });
  }

  // =========================================================================
  // 13. KEYBOARD SHORTCUTS DISPATCHER
  // =========================================================================
  function handleKeyboardInput(e) {
    // If typing inside an input field (like graphing formula), let default happen
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    const key = e.key;

    // Digits 0-9
    if (/^[0-9]$/.test(key)) {
      if (state.mode === 'programmer') handleProgDigit(key);
      else handleDigit(key);
      triggerVisualRipple(key);
      return;
    }

    // Math Operators
    if (key === '+' || key === '-') {
      handleOperator(key === '-' ? '−' : '+');
      triggerVisualRipple(key);
      return;
    }
    if (key === '*') {
      handleOperator('×');
      triggerVisualRipple('*');
      return;
    }
    if (key === '/') {
      e.preventDefault();
      handleOperator('÷');
      triggerVisualRipple('/');
      return;
    }
    if (key === '^') {
      handleOperator('^');
      return;
    }
    if (key === '%') {
      handleOperator('%');
      return;
    }
    if (key === '(' || key === ')') {
      handleParenthesis(key);
      return;
    }
    if (key === '.') {
      handleDecimal();
      return;
    }

    // Calculate (Enter or =)
    if (key === 'Enter' || key === '=') {
      e.preventDefault();
      if (state.mode === 'programmer') handleProgEquals();
      else handleCalculate();
      return;
    }

    // Backspace
    if (key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
      return;
    }

    // Escape or 'c' / 'C' -> All Clear
    if (key === 'Escape' || key.toLowerCase() === 'c') {
      handleAllClear();
      return;
    }

    // Quick Mode shortcuts: m (Scientific), p (Programmer), g (Graphing), h (History)
    if (key.toLowerCase() === 'm') {
      setMode(state.mode === 'scientific' ? 'standard' : 'scientific');
      return;
    }
    if (key.toLowerCase() === 'p') {
      setMode('programmer');
      return;
    }
    if (key.toLowerCase() === 'g') {
      setMode('graphing');
      return;
    }
    if (key.toLowerCase() === 'h') {
      elements.historySidebar.classList.toggle('hide');
      return;
    }

    // Hex digits in programmer mode
    if (state.mode === 'programmer' && /^[a-fA-F]$/.test(key)) {
      handleProgDigit(key.toUpperCase());
    }
  }

  function triggerVisualRipple(key) {
    let selector = `[data-num="${key}"]`;
    if (key === '+') selector = `[data-op="+"]`;
    if (key === '-') selector = `[data-op="-"]`;
    if (key === '*') selector = `[data-op="×"]`;
    if (key === '/') selector = `[data-op="÷"]`;

    const btn = document.querySelector(selector);
    if (btn) {
      btn.classList.add('btn-active-key');
      setTimeout(() => btn.classList.remove('btn-active-key'), 120);
    }
  }

  // =========================================================================
  // 14. INITIALIZATION
  // =========================================================================
  function init() {
    setupEventListeners();
    updateDisplay();
    renderBitMatrix();
    setupConverterCategory('length');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
