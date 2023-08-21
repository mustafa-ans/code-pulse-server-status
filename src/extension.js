"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const path = require("path"); // Import path module
const child_process_1 = require("child_process"); // Import fork for IPC
let watcherProcess;
let statusBarItem;
let isExtensionRunning = false; // Track whether the extension is running
let isServerRunning = false; // Track whether the server is running
function activate(context) {
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
        // Start the terminal output watcher
        const terminalOutputFilePath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'terminal-output.txt');
        // Use fork to spawn the terminalWatcher.js process for IPC
        watcherProcess = (0, child_process_1.fork)('terminalWatcher.js', [terminalOutputFilePath]);
        watcherProcess.on('message', (message) => {
            if (message === 'server_running') {
                isServerRunning = true;
                updateStatusBarIcon();
            }
        });
    });
    // Add the disposable to the context's subscriptions
    context.subscriptions.push(statusBarItem, disposable);
}
exports.activate = activate;
function deactivate() {
    // Dispose the status bar item when the extension is deactivated
    statusBarItem.dispose();
    if (watcherProcess) {
        watcherProcess.kill();
    }
    isServerRunning = false; // Reset server status
    updateStatusBarIcon(); // Update the status bar icon immediately
}
exports.deactivate = deactivate;
// Function to update the status bar icon based on the extension state
function updateStatusBarIcon() {
    if (isExtensionRunning) {
        if (isServerRunning) {
            statusBarItem.text = "$(radio-tower)"; // Change icon to "radio-tower"
        }
        else {
            statusBarItem.text = "$(pulse)"; // Change icon to "pulse"
        }
    }
    else {
        statusBarItem.text = "$(play-circle)"; // Change icon to "play-circle"
    }
    statusBarItem.show(); // Make sure to call show() after changing the text property
}
// Register an interval to update the icon periodically (for example, every second)
setInterval(updateStatusBarIcon, 1000); // You can adjust the interval as needed
//# sourceMappingURL=extension.js.map