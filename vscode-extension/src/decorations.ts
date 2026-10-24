import * as vscode from 'vscode';
import { KaalAstraFixItem } from './types';

export class WorkspaceDecorationManager {
  private _diagnosticCollection: vscode.DiagnosticCollection;
  private _vulnerabilityDecorationType: vscode.TextEditorDecorationType;

  constructor() {
    this._diagnosticCollection = vscode.languages.createDiagnosticCollection('kaalastra');

    this._vulnerabilityDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(239, 68, 68, 0.16)',
      isWholeLine: true,
      borderWidth: '0 0 0 4px',
      borderStyle: 'solid',
      borderColor: '#ef4444',
      overviewRulerColor: '#ef4444',
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });
  }

  public clearAll() {
    this._diagnosticCollection.clear();
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this._vulnerabilityDecorationType, []);
    }
  }

  public applyVulnerabilityMarkings(editor: vscode.TextEditor, fixes: KaalAstraFixItem[]) {
    const document = editor.document;
    const docPath = document.uri.fsPath.replace(/\\/g, '/');

    const matchingFixes = fixes.filter(f => docPath.endsWith(f.filePath.replace(/\\/g, '/')));
    if (matchingFixes.length === 0) {
      editor.setDecorations(this._vulnerabilityDecorationType, []);
      return;
    }

    const decorationOptions: vscode.DecorationOptions[] = [];
    const diagnostics: vscode.Diagnostic[] = [];

    for (const fix of matchingFixes) {
      const lineIdx = Math.max(0, fix.line - 1);
      const lineCount = document.lineCount;
      const endLineIdx = Math.min(lineCount - 1, lineIdx + 10); // cover the block

      const range = new vscode.Range(
        new vscode.Position(lineIdx, 0),
        new vscode.Position(endLineIdx, document.lineAt(endLineIdx).text.length)
      );

      const hoverMessage = new vscode.MarkdownString();
      hoverMessage.isTrusted = true;
      hoverMessage.appendMarkdown(`### 🚨 KaalAstra Alert: ${fix.title}\n\n`);
      hoverMessage.appendMarkdown(`**Severity:** \`${fix.severity}\` | **CWE:** \`${fix.cwe}\`\n\n`);
      hoverMessage.appendMarkdown(`**Failure Mechanism:** ${fix.description}\n\n`);
      if (fix.blindspot) {
        hoverMessage.appendMarkdown(`> ⚡ **Diff-Only Blindspot:** ${fix.blindspot}\n\n`);
      }
      hoverMessage.appendMarkdown(`*(Click "Snapshot & Ask Tavily" in sidebar for deep research)*`);

      decorationOptions.push({
        range,
        hoverMessage
      });

      // Add to VS Code Problems panel
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(new vscode.Position(lineIdx, 0), new vscode.Position(lineIdx, 100)),
        `[KaalAstra ${fix.cwe}] ${fix.title}: ${fix.description}`,
        vscode.DiagnosticSeverity.Error
      );
      diagnostic.source = 'KaalAstra Sentinel';
      diagnostics.push(diagnostic);
    }

    editor.setDecorations(this._vulnerabilityDecorationType, decorationOptions);
    this._diagnosticCollection.set(document.uri, diagnostics);

    // Reveal the first marked line in the viewport
    if (matchingFixes.length > 0) {
      const firstLine = Math.max(0, matchingFixes[0].line - 1);
      const pos = new vscode.Position(firstLine, 0);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }
  }
}

