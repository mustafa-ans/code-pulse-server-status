const vscode = require('vscode');
const { spawn } = require('child_process');

function activate(context) {
    // Create a status bar item
    let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1);
    statusBarItem.text = '$(play-circle)';
    statusBarItem.command = 'extension.startCargoWatch';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register the command
    let disposable = vscode.commands.registerCommand('extension.startCargoWatch', () => {
        statusBarItem.text = '$(issue-reopened)';

        // Get the root path of the workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder is open.');
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        console.log(`Running command in directory: ${rootPath}`);

        // Create an EventEmitter for the pseudoterminal
        const writeEmitter = new vscode.EventEmitter();

        // Flag to track compilation success
        let is_compilation_success = false;

        // Create a pseudoterminal
        const pty = {
            onDidWrite: writeEmitter.event,
            open: () => {
                const childProcess = spawn('cargo', ['watch', '-x', 'run'], { cwd: rootPath });

                const handleOutput = (data) => {
                    const output = data.toString();
                    console.log(output); // Log the output for debugging
                    writeEmitter.fire(output.replace(/\r?\n/g, '\r\n')); // Normalize line endings

                    // Check for successful compilation patterns
                    const finishedPattern = /\s*Finished dev \[unoptimized \+ debuginfo\] target\(s\)/;
                    const runningPattern = /\s*Running `target\\debug\\[^`]+`/;

                    if (runningPattern.test(output)) {
                        is_compilation_success = true;
                    } else if (output.includes('error: could not compile')) {
                        is_compilation_success = false;
                    }

                    // Update status bar based on the flag
                    if (is_compilation_success) {
                        statusBarItem.text = '$(pulse)';
                    } else {
                        statusBarItem.text = '$(chrome-minimize)';
                    }
                };

                childProcess.stdout.on('data', handleOutput);
                childProcess.stderr.on('data', handleOutput);

                childProcess.on('close', (code) => {
                    if (code === 0 && is_compilation_success) {
                        statusBarItem.text = '$(pulse) Running';
                    } else {
                        statusBarItem.text = '$(chrome-minimize) close';
                    }
                });

                childProcess.on('error', (err) => {
                    console.error('Child process error:', err); // Log any errors related to the child process
                });
            },
            close: () => {}
        };

        // Create and show the terminal
        const terminal = vscode.window.createTerminal({ name: 'Cargo Watch', pty });
        terminal.show();
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
