const vscode = require('vscode');
const { spawn } = require('child_process');

function activate(context) {
    // Create a status bar item
    let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(play-circle) Start';
    statusBarItem.command = 'extension.startCargoWatch';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register the command
    let disposable = vscode.commands.registerCommand('extension.startCargoWatch', () => {
        statusBarItem.text = '$(issue-reopened) Compiling...';

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

        // Create a pseudoterminal
        const pty = {
            onDidWrite: writeEmitter.event,
            open: () => {
                const childProcess = spawn('cargo', ['watch', '-x', 'run'], { cwd: rootPath });

                childProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    console.log(output); // Log the output for debugging
                    writeEmitter.fire(output.replace(/\r?\n/g, '\r\n')); // Normalize line endings

                    if (output.includes('Finished dev [unoptimized + debuginfo] target(s)')) {
                        statusBarItem.text = '$(pulse) Running';
                    } else if (output.includes('error: could not compile')) {
                        statusBarItem.text = '$(chrome-minimize) Compilation Failed';
                    }
                });

                childProcess.stderr.on('data', (data) => {
                    const errorOutput = data.toString();
                    console.error(errorOutput); // Log the error output for debugging
                    writeEmitter.fire(errorOutput.replace(/\r?\n/g, '\r\n')); // Normalize line endings
                    statusBarItem.text = '$(chrome-minimize) Compilation Failed';
                });

                childProcess.on('close', (code) => {
                    if (code === 0) {
                        statusBarItem.text = '$(pulse) Running';
                    } else {
                        statusBarItem.text = '$(chrome-minimize) Compilation Failed';
                    }
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
