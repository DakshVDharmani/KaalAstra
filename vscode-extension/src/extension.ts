import * as vscode from 'vscode';
import { CodeFixViewProvider } from './CodeFixViewProvider';
import { SecurityGraphEditorPanel } from './SecurityGraphEditorPanel';

export function activate(context: vscode.ExtensionContext) {
  try {
    const provider = new CodeFixViewProvider(context.extensionUri, context);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        CodeFixViewProvider.viewType,
        provider,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('kaalastra.scanCurrentCommit', () => {
        provider.scanRepository(false);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('kaalastra.applyAllFixes', () => {
        provider.applyAllFixes();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('kaalastra.askTavilyForSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage('Open a code file to snapshot and ask Tavily.');
          return;
        }
        const selection = editor.selection;
        const text = editor.document.getText(selection.isEmpty ? undefined : selection);
        if (!text || text.trim().length === 0) {
          vscode.window.showWarningMessage('Please select a code snippet in the editor first.');
          return;
        }
        const fileName = vscode.workspace.asRelativePath(editor.document.uri);
        const line = selection.start.line + 1;
        provider.sendSnapshotToTavily(text, fileName, line);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('kaalastra.openGraphWorkspace', () => {
        SecurityGraphEditorPanel.createOrShow(context.extensionUri, provider.getCurrentScan());
      })
    );

    // Status bar shortcut to show security graph in workspace editor
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'kaalastra.openGraphWorkspace';
    statusBarItem.text = '$(graph) KaalAstra Graph';
    statusBarItem.tooltip = 'Show Security Flow & Node Graph in Workspace Editor Tab';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
  } catch (err: any) {
    console.error('KaalAstra Activation Error:', err);
    vscode.window.showErrorMessage(`KaalAstra Activation Failed: ${err.message}`);
  }
}

export function deactivate() {}
