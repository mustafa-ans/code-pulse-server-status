import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(play) Run Cargo Watch";
    statusBarItem.command = 'extension.runCargoWatch';
    statusBarItem.show();

    const disposable = vscode.commands.registerCommand('extension.runCargoWatch', () => {
        const terminal = vscode.window.createTerminal('Cargo Watch');
        terminal.sendText('cargo watch -x run');
        terminal.show();
    });

    context.subscriptions.push(statusBarItem, disposable);
}

export function deactivate() {}
