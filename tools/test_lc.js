const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const portPath = 'COM5'; // Based on previous output

console.log(`Connecting to Betaflight on ${portPath}...`);
const port = new SerialPort({ path: portPath, baudRate: 115200 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

let commandQueue = [
    '#', // enter CLI
    'set launch_control_mode = PITCHONLY',
    'aux 0 68 0 1300 1700 0',
    'save' // reboot
];

let stage = 0;

port.on('open', () => {
    console.log('Port opened successfully.');
    sendNextCommand();
});

parser.on('data', (data) => {
    const text = data.trim();
    if (text) {
        console.log(`[FC] ${text}`);
    }

    if (text.includes('Rebooting')) {
        console.log('Rebooting... waiting 5 seconds before checking results.');
        setTimeout(checkResults, 5000);
    } else if (text.endsWith('# ')) {
        // CLI ready prompt
        sendNextCommand();
    }
});

port.on('error', (err) => {
    console.error('Error: ', err.message);
});

function sendNextCommand() {
    if (stage < commandQueue.length) {
        const cmd = commandQueue[stage++];
        console.log(`>> Sending: ${cmd}`);
        port.write(cmd + '\n');
    }
}

function checkResults() {
    console.log('\n--- Checking Results ---');
    // We need to reconnect since it rebooted
    port.close(() => {
        setTimeout(() => {
            const checkPort = new SerialPort({ path: portPath, baudRate: 115200 });
            const checkParser = checkPort.pipe(new ReadlineParser({ delimiter: '\n' }));

            let checkStage = 0;
            const checkCommands = [
                '#', // enter cli
                'get launch_control_mode',
                'get aux',
                'exit'
            ];

            checkPort.on('open', () => {
                console.log('Reconnected. Reading values...');
                function sendCheckCmd() {
                    if (checkStage < checkCommands.length) {
                        const cmd = checkCommands[checkStage++];
                        checkPort.write(cmd + '\n');
                        setTimeout(sendCheckCmd, 500); // just space them out blindly
                    }
                }
                sendCheckCmd();
            });

            checkParser.on('data', (data) => {
                const text = data.trim();
                if (text) {
                    console.log(`[FC Result] ${text}`);
                }
            });

            setTimeout(() => {
                console.log('Done.');
                checkPort.close();
                process.exit(0);
            }, 5000);

        }, 1000);
    });
}
