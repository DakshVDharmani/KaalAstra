'use strict';

const path = require('node:path');

function componentFor(file) {
  const p = file.replaceAll('\\', '/').toLowerCase();
  if (/(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|requirements[^/]*\.txt|poetry\.lock|cargo\.lock)$/.test(p)) return 'DEPENDENCIES';
  if (/(^|\/)(backend|server|api|routes|controllers|services)\//.test(p) || /\.(py|php|go|rs|java|rb)$/.test(p)) return 'BACKEND';
  if (/(^|\/)(frontend|client|web|ui|components|pages|app)\//.test(p) || /\.(jsx?|tsx?|vue|svelte|css|scss|html)$/.test(p)) return 'FRONTEND';
  return 'SHARED';
}

function safeFile(value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.includes('\0')) return null;
  const p = value.replaceAll('\\', '/');
  return p.startsWith('/') || p.split('/').includes('..') ? null : p;
}

function clean(value, max = 120) {
  const text = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildGraph(snapshot, changedFiles, findings = []) {
  if (!snapshot || !/^[a-f0-9]{40,64}$/.test(snapshot.commit || '')) throw new Error('A captured Git commit is required.');
  const files = [...new Set(changedFiles.map(safeFile).filter(Boolean))].sort();
  const lines = [
    'KAALASTRA  /  SECURITY RUN GRAPH',
    '────────────────────────────────────────────────────────────────────────',
    `BEFORE  [GitHub push: ${clean(snapshot.branch, 32)} @ ${snapshot.commit.slice(0, 12)}]`,
    '   │'
  ];
  const groups = ['FRONTEND', 'BACKEND', 'DEPENDENCIES', 'SHARED'].map(name => ({
    name,
    files: files.filter(f => componentFor(f) === name),
    findings: findings.filter(f => f && safeFile(f.file) && componentFor(safeFile(f.file)) === name)
  })).filter(g => g.files.length || g.findings.length);

  groups.forEach((group, index) => {
    const last = index === groups.length - 1;
    const branch = last ? '└' : '├';
    const stem = last ? ' ' : '│';
    lines.push(`   ${branch}──→ [${group.name}]  ${group.files.length} changed file${group.files.length === 1 ? '' : 's'}`);
    if (group.findings.length) {
      group.findings.forEach((finding, findingIndex) => {
        const prefix = `   ${stem}     `;
        const verified = finding.statusAfter === 'fixed' && typeof finding.verification === 'string' && finding.verification.trim();
        lines.push(`${prefix}[BREAK ${findingIndex + 1}] ${clean(finding.before || finding.title || 'Reported issue')}`);
        lines.push(`${prefix}    file: ${clean(safeFile(finding.file), 100)}`);
        lines.push(`${prefix}       ↓`);
        lines.push(`${prefix}[FIX] ${clean(finding.fix || 'Fix details pending')}`);
        lines.push(`${prefix}       ↓`);
        lines.push(`${prefix}[${verified ? 'WORKING · VERIFIED' : finding.statusAfter === 'fixed' ? 'FIX REPORTED · VERIFY' : 'UNRESOLVED'}]${verified ? ` ${clean(finding.verification)}` : ''}`);
        if (findingIndex < group.findings.length - 1) lines.push(`${prefix}`);
      });
    } else {
      const prefix = `   ${stem}     `;
      lines.push(`${prefix}[CHANGED] ${group.files.slice(0, 3).map(f => clean(f, 70)).join(', ')}${group.files.length > 3 ? `, +${group.files.length - 3} more` : ''}`);
      lines.push(`${prefix}       ↓`);
      lines.push(`${prefix}[PENDING] Security outcome not assessed`);
    }
    lines.push(`   ${stem}`);
  });
  if (!groups.length) lines.push('   └──→ [NO CHANGES OR FINDINGS]');
  lines.push('   ↓', 'AFTER   [Current workspace after fixes]');
  if (snapshot.initialStatus) lines.push('NOTE    Workspace already had local changes when the baseline was captured.');
  lines.push('────────────────────────────────────────────────────────────────────────');
  lines.push('WORKING means a fix and external verification were supplied; model claims alone do not verify a fix.');
  return lines.join('\n') + '\n';
}

module.exports = { buildGraph, componentFor, safeFile };
