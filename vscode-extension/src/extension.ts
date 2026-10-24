import * as vscode from 'vscode';
import { CodeFixViewProvider } from './CodeFixViewProvider';

export function activate(context: vscode.ExtensionContext) {
  try {
    const provider = new CodeFixViewProvider(context.extensionUri);

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
  } catch (err: any) {
    console.error('KaalAstra Activation Error:', err);
    vscode.window.showErrorMessage(`KaalAstra Activation Failed: ${err.message}`);
  }
}

export function deactivate() {}
