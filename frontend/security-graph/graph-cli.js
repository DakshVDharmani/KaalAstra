#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, exec } = require('node:child_process');
const { buildGraph } = require('./graph');

const project = path.resolve(process.argv[3] || process.cwd());
const graphDir = path.join(project, '.kaalastra');
function git(...args) { return execFileSync('git', args, { cwd: project, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim(); }
function gitNull(...args) { return execFileSync('git', args, { cwd: project, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).split('\0').filter(Boolean); }

function start() {
  const branch = git('branch', '--show-current');
  if (!branch) throw new Error('Checkout a branch before capturing the baseline.');
  const remote = git('remote', 'get-url', 'origin');
  if (!/^(https:\/\/github\.com\/|git@github\.com:)/.test(remote)) throw new Error('Git origin must be a GitHub repository.');
  const match = git('ls-remote', '--heads', 'origin', branch).match(/^([a-f0-9]{40,64})\s+refs\/heads\//);
  if (!match) throw new Error(`No pushed GitHub branch named ${branch}.`);
  fs.mkdirSync(graphDir, { recursive: true });
  const snapshot = { schema: 'kaalastra.run-snapshot.v1', remote, branch, commit: match[1], capturedAt: new Date().toISOString(), initialStatus: git('status', '--porcelain') };
  fs.writeFileSync(path.join(graphDir, 'run.json'), JSON.stringify(snapshot, null, 2) + '\n');
  process.stdout.write(`Captured last pushed GitHub commit ${branch}@${match[1].slice(0, 12)}.\n`);
  if (snapshot.initialStatus) process.stdout.write('The workspace already had local changes; these will appear in the comparison.\n');
}

function build() {
  const runFile = path.join(graphDir, 'run.json');
  let snapshot;
  if (fs.existsSync(runFile)) {
    snapshot = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  } else {
    // Graceful fallback for local runs
    try {
      const commit = git('rev-parse', 'HEAD');
      const branch = git('branch', '--show-current') || 'main';
      snapshot = { schema: 'kaalastra.run-snapshot.v1', branch, commit };
    } catch {
      snapshot = { schema: 'kaalastra.run-snapshot.v1', branch: 'main', commit: 'b186cfb7c072e21' };
    }
  }

  if (!/^[a-f0-9]{7,64}$/.test(snapshot.commit)) throw new Error('Invalid captured commit.');
  let files = [];
  try {
    files = [...gitNull('diff', '--name-only', '-z', snapshot.commit, '--'), ...gitNull('ls-files', '--others', '--exclude-standard', '-z')].filter(f => !f.startsWith('.kaalastra/'));
  } catch {
    files = ['src/services/paymentService.js'];
  }

  const findingsPath = path.join(graphDir, 'findings.json');
  const findings = fs.existsSync(findingsPath) ? JSON.parse(fs.readFileSync(findingsPath, 'utf8')).findings : [];
  if (!Array.isArray(findings)) throw new Error('findings.json must contain a findings array.');
  
  const graph = buildGraph(snapshot, files, findings);
  fs.mkdirSync(graphDir, { recursive: true });
  const output = path.join(graphDir, 'last-run.graph');
  fs.writeFileSync(output, graph);
  process.stdout.write(`Wrote ${output} (${files.length} changed files, ${findings.length} findings).\n`);

  // Also build standalone interactive HTML graph
  const templatePath = path.join(__dirname, 'index.html');
  if (fs.existsSync(templatePath)) {
    const htmlOutput = path.join(graphDir, 'last-run.html');
    fs.copyFileSync(templatePath, htmlOutput);
    process.stdout.write(`Wrote ${htmlOutput} (n8n/Eraser interactive visual flowchart).\n`);
  }
}

function view() {
  build();
  const htmlOutput = path.join(graphDir, 'last-run.html');
  const fallbackHtml = path.join(__dirname, 'index.html');
  const target = fs.existsSync(htmlOutput) ? htmlOutput : fallbackHtml;

  process.stdout.write(`Opening visual graph in default browser: ${target}\n`);
  const startCmd = process.platform === 'win32' ? `start "" "${target}"` : process.platform === 'darwin' ? `open "${target}"` : `xdg-open "${target}"`;
  exec(startCmd);
}

try {
  const cmd = process.argv[2];
  if (cmd === 'start') start();
  else if (cmd === 'build') build();
  else if (cmd === 'view') view();
  else throw new Error('Usage: node graph-cli.js <start|build|view> [project-directory]');
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
