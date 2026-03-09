const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const portPath = 'COM5';

console.log(`Connecting to Betaflight on ${portPath}...`);
const port = new SerialPort({ path: portPath, baudRate: 115200 });

// Betaflight CLI doesn't always send clean newlines, it sends '\r\n' and bare '#' prompts.
// A custom data event listener is safer than ReadLineParser for prompts without newlines
let buffer = '';

let commandQueue = [
    '#',
    'set launch_control_mode = PITCHONLY',
    'aux 0 68 0 1300 1700 0',
    'get launch_control_mode',
    'get aux',
    'save'
];
let stage = 0;

port.on('open', () => {
    console.log('Port opened successfully. Entering CLI sequence...');
    sendNextCommand();
});

port.on('data', (data) => {
    buffer += data.toString();

    // Print lines as they come in
    let lines = buffer.split('\n');
    buffer = lines.pop(); // Keep the last incomplete piece (like "# ") in the buffer

    lines.forEach(line => {
        const text = line.trim();
        if (text) {
            console.log(`[FC] ${text}`);
            if (text.includes('Rebooting')) {
                console.log('--- REBOOT DETECTED ---');
                process.exit(0);
            }
        }
    });

    // Check if the buffer is just a prompt waiting for input
    if (buffer.trim() === '#') {
        buffer = ''; // clear
        setTimeout(sendNextCommand, 200);
    }
});

port.on('error', (err) => {
    console.error('Error: ', err.message);
});

function sendNextCommand() {
    if (stage < commandQueue.length) {
        const cmd = commandQueue[stage++];
        console.log(`\n>> Sending: ${cmd}`);
        port.write(cmd + '\r\n');
    } else {
        console.log('All commands sent. Waiting for final output...');
    }
}
