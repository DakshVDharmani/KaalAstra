# Security Run Graph & Interactive Flowchart

This folder produces both a **clean text flow** in a `.graph` file and a **modern, interactive n8n / Eraser AI-style node flowchart**.

```text
BEFORE [last GitHub push]
   │
   ├──→ [FRONTEND] → [BREAK] → [FIX] → [WORKING or VERIFY]
   └──→ [BACKEND]  → [BREAK] → [FIX] → [WORKING or VERIFY]
   ↓
AFTER [current workspace]
```

---

## 🎨 Interactive Visual Graph (n8n & Eraser AI Mode)

Open the interactive visual node flowchart in your browser:

```sh
node frontend/security-graph/graph-cli.js view .
```

Features of the visual graph:
- **n8n Workflow Nodes**: Sleek card nodes with circular input/output port handles, category badges, code chips, and parameter tags.
- **Eraser AI Call Topology**: AST caller-to-sink threat graph contrasting protected vs unauthenticated entrypoints.
- **Bezier Flow Connectors**: SVG cubic curves with animated data pulses and edge status badges.
- **Canvas Navigation**: Pan canvas by dragging, zoom with scroll wheel or HUD controls (`+` / `−` / fit view).
- **Interactive Inspector Drawer**: Click any node to open the inspector with full diff, blindspot explanation, and verification status.

---

## 🛠️ CLI Commands

### 1. Capture Baseline
From the project root, run before the security scan:
```sh
node frontend/security-graph/graph-cli.js start .
```
This queries the current branch on GitHub `origin` and saves its exact pushed SHA to `.kaalastra/run.json`.

### 2. Build Outputs
After the extension or engine has run:
```sh
node frontend/security-graph/graph-cli.js build .
```
This generates:
- `.kaalastra/last-run.graph`: Lightweight plain-text diagram for VS Code text editor.
- `.kaalastra/last-run.html`: Interactive n8n & Eraser AI node flowchart.

### 3. Launch Interactive View
```sh
node frontend/security-graph/graph-cli.js view .
```

---

## Findings Contract

Before `build`, `.kaalastra/findings.json` can be supplied:

```json
{
  "findings": [
    {
      "id": "SEC-1",
      "title": "Missing ownership check",
      "file": "backend/routes/orders.js",
      "severity": "high",
      "before": "A user could request another user's order.",
      "statusAfter": "fixed",
      "fix": "Added an ownership check before returning the order.",
      "verification": "Cross-user integration test passed."
    }
  ]
}
```

`WORKING: verified` appears only when `statusAfter` is `fixed` and `verification` is nonempty.
