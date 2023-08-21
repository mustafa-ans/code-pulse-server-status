const fs = require('fs');
const { send } = process;

const triggerString = 'Finished dev [unoptimized + debuginfo] target(s)'; // Adjust this based on your expected trigger

const terminalOutputPath = process.argv[2]; // Get the terminal output file path from command line arguments

let isServerRunning = false; // Track whether the server is running

const watchTerminalOutput = () => {
  fs.watchFile(terminalOutputPath, (curr, prev) => {
    const output = fs.readFileSync(terminalOutputPath, 'utf-8');
    if (output.includes(triggerString)) {
      console.log('Trigger detected: Server is up and running');
      isServerRunning = true; // Server is now running
      send('server_running'); // Notify the extension process using IPC
    }
  });
};

watchTerminalOutput();
