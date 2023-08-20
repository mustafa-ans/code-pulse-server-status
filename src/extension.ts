import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
let isExtensionRunning: boolean = false; // Track whether the extension is running

export function activate(context: vscode.ExtensionContext) {
    // Create a status bar item with the "play-circle" icon initially
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.text = "$(play-circle)";
    statusBarItem.tooltip = "Click to run cargo watch -x run";
    statusBarItem.command = 'extension.runCargoWatch';
    statusBarItem.show();

    // Register the command to run Cargo Watch
    const disposable = vscode.commands.registerCommand('extension.runCargoWatch', () => {
        isExtensionRunning = true; // Extension is now in use
        updateStatusBarIcon(); // Update the status bar icon
        // Run the cargo watch command
        const terminal = vscode.window.createTerminal('Cargo Watch');
        terminal.sendText('cargo watch -x run');
        terminal.show();
    });

    // Add the disposable to the context's subscriptions
    context.subscriptions.push(statusBarItem, disposable);
}

export function deactivate() {
    // Dispose the status bar item when the extension is deactivated
    statusBarItem.dispose();
}

// Function to update the status bar icon based on the extension state
function updateStatusBarIcon() {
    if (isExtensionRunning) {
        statusBarItem.text = "$(pulse)"; // Change icon to "pulse"
    } else {
        statusBarItem.text = "$(play-circle)"; // Change icon to "play-circle"
    }
}

// Register an interval to update the icon periodically (for example, every second)
setInterval(updateStatusBarIcon, 1000); // You can adjust the interval as needed
