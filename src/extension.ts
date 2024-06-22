import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Create a status bar item
    let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(play-circle) Start';
    statusBarItem.command = 'extension.startCargoWatch';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register the command
    let disposable = vscode.commands.registerCommand('extension.startCargoWatch', () => {
        statusBarItem.text = '$(issue-reopened) Compiling...';

        // Create an EventEmitter for the pseudoterminal
        const writeEmitter = new vscode.EventEmitter<string>();

        // Create a pseudoterminal
        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            open: () => {
                const childProcess = require('child_process').spawn('cargo', ['watch', '-x', 'run']);
                
                childProcess.stdout.on('data', (data: Buffer) => {
                    const output = data.toString();
                    console.log(output); // Log the output for debugging
                    writeEmitter.fire(output);

                    if (output.includes('Finished')) {
                        statusBarItem.text = '$(pulse) Running';
                    } else if (output.includes('error')) {
                        statusBarItem.text = '$(chrome-minimize) Compilation Failed';
                    }
                });

                childProcess.stderr.on('data', (data: Buffer) => {
                    const errorOutput = data.toString();
                    console.error(errorOutput); // Log the error output for debugging
                    writeEmitter.fire(errorOutput);
                    statusBarItem.text = '$(chrome-minimize) Compilation Failed';
                });

                childProcess.on('close', (code: number) => {
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

export function deactivate() {}
