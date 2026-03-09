const fs = require('fs');

const cliText = `
aux 0 0 0 1300 1700 0
aux 1 68 1 1300 1700 0
`;

const MODE_NAMES = {
    0: 'ARM',
    1: 'ANGLE',
    2: 'HORIZON',
    3: 'MAG',
    4: 'HEADFREE',
    5: 'PASSTHRU',
    6: 'FAILSAFE',
    13: 'BEEPER',
    26: 'OSD DISABLE',
    27: 'TELEMETRY',
    28: 'BLACKBOX',
    35: 'FLIP OVER AFTER CRASH', // Turtle Mode
    39: 'VTX PIT MODE',
    40: 'PARALYZE',
    41: 'PREARM',
    42: 'GPS RESCUE',
    68: 'LAUNCH CONTROL'
};

const modes = [];
const lines = cliText.split('\n');
const auxRegex = /^aux\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;

lines.forEach(line => {
    const match = line.trim().match(auxRegex);
    if (match) {
        const modeId = parseInt(match[2], 10);
        const channelIndex = parseInt(match[3], 10);
        const minRange = parseInt(match[4], 10);
        const maxRange = parseInt(match[5], 10);

        if ((minRange === 900 && maxRange === 900) || (minRange === 1000 && maxRange === 1000) || minRange > 2100 || maxRange < 900) {
            return;
        }

        if (modes.some(m => m.modeId === modeId)) {
            return;
        }

        const modeName = MODE_NAMES[modeId] || `MODE ${modeId}`;
        const channelName = `AUX ${channelIndex + 1}`;

        modes.push({
            modeId,
            linkId: parseInt(match[1], 10),
            modeName,
            channelIndex,
            channelName,
            minRange,
            maxRange
        });
    }
});

console.log(JSON.stringify(modes, null, 2));
