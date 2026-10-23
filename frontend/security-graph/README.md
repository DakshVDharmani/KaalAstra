# Security run `.graph` file

This folder produces a **small text flow** in a `.graph` file. There is no dashboard, theme, background, renderer, or web UI. Open the file directly in VS Code and read it as a diagram:

```text
BEFORE [last GitHub push]
   │
   ├──→ [FRONTEND] → [BREAK] → [FIX] → [WORKING or VERIFY]
   └──→ [BACKEND]  → [BREAK] → [FIX] → [WORKING or VERIFY]
   ↓
AFTER [current workspace]
```

The flow is already readable in VS Code's text editor. No VS Code extension or preview tool is required.

## Create the comparison

From the project root, run **start before the security scan**:

```sh
node FRONTEND/security-graph/graph-cli.js start .
```

This queries the current branch on GitHub `origin` and saves its exact pushed SHA to `.kaalastra/run.json`. After the extension has applied fixes, run:

```sh
node FRONTEND/security-graph/graph-cli.js build .
```

Open `.kaalastra/last-run.graph` in VS Code. The after state is the current workspace, including uncommitted and untracked files. If local changes existed when `start` ran, the graph includes a warning node because it cannot tell those earlier changes apart from fixes.

## Findings contract for later model integration

Before `build`, the extension can write `.kaalastra/findings.json`:

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

`WORKING: verified` appears only when `statusAfter` is `fixed` and `verification` is nonempty. Supply verification from a real test or human review, not model prose alone. Otherwise the node says `FIX REPORTED / Verification pending` or `UNRESOLVED`. A changed file with no finding appears as `CHANGED / Security outcome pending review`.

`.kaalastra/` is Git ignored because findings may contain sensitive project details. The `.graph` output is generated data; `example.graph` shows its format.
