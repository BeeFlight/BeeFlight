// =========================================================
// cliParser.js — Parses Betaflight CLI `diff all` output
// =========================================================

// Betaflight Serial Port Bitmasks (from betaflight/src/main/io/serial.h)
// Function bitmasks
const FUNCTION_MSP = (1 << 0);       // 1
const FUNCTION_TELEMETRY_FRSKY = (1 << 1); // 2
const FUNCTION_TELEMETRY_HOTT = (1 << 2);  // 4
const FUNCTION_TELEMETRY_SMARTPORT = (1 << 3); // 8
const FUNCTION_RX_SERIAL = (1 << 4); // 16
const FUNCTION_TELEMETRY_MAVLINK = (1 << 5); // 32
const FUNCTION_TELEMETRY_LTM = (1 << 6); // 64
const FUNCTION_TELEMETRY_IBUS = (1 << 7); // 128
const FUNCTION_GPS = (1 << 8); // 256
const FUNCTION_RCDEVICE = (1 << 9); // 512
const FUNCTION_VTX_SMARTAUDIO = (1 << 10); // 1024
const FUNCTION_VTX_TRAMP = (1 << 11); // 2048
const FUNCTION_TELEMETRY_CRSF = (1 << 12); // 4096

// Sensor/Peripheral IDs (varies slightly by version, but these are standard)
const PERIPHERAL_NONE = 0;
const PERIPHERAL_SMARTAUDIO = 2;
const PERIPHERAL_TRAMP = 3;
const PERIPHERAL_FRSKY_OSD = 5;
const PERIPHERAL_MSP_DISPLAYPORT = 39; // Common for DJI / HDZero / Avatar

class CliParser {
    /**
     * Parses the raw `diff all` text and extracts UART configurations.
     * Expected CLI format: serial <identifier> <functionMask> <mspBaud> <gpsBaud> <telemetryBaud> <peripheralBaud>
     * Example: serial 0 1 115200 57600 0 115200 (USB VCP, MSP active)
     * Example: serial 1 64 115200 57600 0 115200 (UART2, Serial RX)
     * 
     * @param {string} cliText The raw output of `diff all`
     * @returns {Array} Array of parsed port objects
     */
    static parsePorts(cliText) {
        if (!cliText) return [];

        const ports = [];
        const lines = cliText.split('\n');

        // Regex to match: serial [id] [functionMask] [mspBaud] [gpsBaud] [telemetryBaud] [peripheralBaud]
        const serialRegex = /^serial\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;

        lines.forEach(line => {
            const match = line.trim().match(serialRegex);
            if (match) {
                const identifier = parseInt(match[1], 10);
                const functionMask = parseInt(match[2], 10);
                // The peripheral ID is sometimes stored differently or in the mask.
                // In modern BF, the functionMask combines features.

                let portName = `UART ${identifier}`;
                let isUsbVcp = false;

                // Typical mappings:
                // 0 = USB VCP
                // 1 = UART1, 2 = UART2...
                // 20 = SoftSerial1, 21 = SoftSerial2
                if (identifier === 0) {
                    portName = "USB VCP";
                    isUsbVcp = true;
                } else if (identifier >= 30) {
                    portName = `SoftSerial ${identifier - 29}`;
                }

                // Determine Active Job
                let activeJob = "Unassigned";
                let jobClass = "job-unassigned";

                if (functionMask & FUNCTION_RX_SERIAL) {
                    activeJob = "Receiver";
                    jobClass = "job-rx";
                } else if (functionMask & FUNCTION_MSP) {
                    activeJob = "MSP / Configurator";
                    jobClass = "job-msp";
                } else if (functionMask & FUNCTION_GPS) {
                    activeJob = "GPS";
                    jobClass = "job-sensor";
                } else if (functionMask & FUNCTION_VTX_SMARTAUDIO || functionMask & FUNCTION_VTX_TRAMP) {
                    activeJob = "VTX (Analog)";
                    jobClass = "job-vtx";
                } else if (functionMask & FUNCTION_TELEMETRY_FRSKY || functionMask & FUNCTION_TELEMETRY_SMARTPORT || functionMask & FUNCTION_TELEMETRY_CRSF) {
                    activeJob = "Telemetry";
                    jobClass = "job-telemetry";
                }

                ports.push({
                    identifier,
                    portName,
                    isUsbVcp,
                    functionMask,
                    activeJob,
                    jobClass
                });
            }
        });

        // Sort: USB VCP first, then UARTs by ID
        ports.sort((a, b) => a.identifier - b.identifier);

        return ports;
    }

    /**
     * Parses the raw `diff all` text and extracts AUX mode configurations.
     * Expected CLI format: aux <modeId> <auxChannelIndex> <minRange> <maxRange> 0 0
     * Example: aux 0 0 1300 1700 0 0 (ARM on Aux 1)
     * 
     * @param {string} cliText The raw output of `diff all`
     * @returns {Array} Array of parsed mode mapping objects
     */
    static parseModes(cliText) {
        if (!cliText) return [];

        const modes = [];
        const lines = cliText.split('\n');

        // Common Betaflight Mode IDs
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
            42: 'GPS RESCUE'
        };

        // Regex to match: aux [modeId] [channelIndex] [minRange] [maxRange] ...
        const auxRegex = /^aux\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;

        lines.forEach(line => {
            const match = line.trim().match(auxRegex);
            if (match) {
                const modeId = parseInt(match[1], 10);
                const channelIndex = parseInt(match[2], 10);
                const minRange = parseInt(match[3], 10);
                const maxRange = parseInt(match[4], 10);

                const modeName = MODE_NAMES[modeId] || `MODE ${modeId}`;
                const channelName = `AUX ${channelIndex + 1}`;

                modes.push({
                    modeId,
                    modeName,
                    channelIndex, // 0-based for array mapping
                    channelName,
                    minRange,
                    maxRange
                });
            }
        });

        return modes;
    }

    /**
     * Parses the raw `diff all` text and extracts battery and power configuration limits.
     * Extracts cell voltages (and converts to true float) and sensor calibration scales.
     * 
     * @param {string} cliText The raw output of `diff all`
     * @returns {Object} Object containing battery config properties
     */
    static parsePowerConfig(cliText) {
        if (!cliText) return null;

        const config = {
            vbatMax: 4.30,
            vbatWarn: 3.50,
            vbatMin: 3.30,
            vbatScale: 110,
            vbatDivider: 10,
            vbatMultiplier: 1,
            ibataScale: 400,
            ibataOffset: 0
        };

        const lines = cliText.split('\n');

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('set vbat_max_cell_voltage')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.vbatMax = parseInt(parts[1].trim(), 10) / 100;
            } else if (cleanLine.startsWith('set vbat_warning_cell_voltage')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.vbatWarn = parseInt(parts[1].trim(), 10) / 100;
            } else if (cleanLine.startsWith('set vbat_min_cell_voltage')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.vbatMin = parseInt(parts[1].trim(), 10) / 100;
            } else if (cleanLine.startsWith('set vbat_scale')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.vbatScale = parseInt(parts[1].trim(), 10);
            } else if (cleanLine.startsWith('set vbat_divider')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.vbatDivider = parseInt(parts[1].trim(), 10);
            } else if (cleanLine.startsWith('set vbat_multiplier')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.vbatMultiplier = parseInt(parts[1].trim(), 10);
            } else if (cleanLine.startsWith('set ibata_scale')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.ibataScale = parseInt(parts[1].trim(), 10);
            } else if (cleanLine.startsWith('set ibata_offset')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.ibataOffset = parseInt(parts[1].trim(), 10);
            }
        });

        return config;
    }

    /**
     * Parses the raw `diff all` text and extracts Blackbox configuration.
     * Maps blackbox_device integers to readable names.
     * 
     * @param {string} cliText The raw output of `diff all`
     * @returns {Object} Object containing blackbox config properties
     */
    static parseBlackboxConfig(cliText) {
        if (!cliText) return null;

        const DEVICE_MAP = {
            0: 'Serial / UART',
            1: 'SPI / Onboard Flash',
            2: 'SD Card'
        };

        const config = {
            device: 'Unknown',
            deviceRaw: -1,
            sampleRate: '1/1',
            debugMode: 'NONE'
        };

        const lines = cliText.split('\n');

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('set blackbox_device')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) {
                    const val = parts[1].trim();
                    const intVal = parseInt(val, 10);
                    if (!isNaN(intVal)) {
                        config.deviceRaw = intVal;
                        config.device = DEVICE_MAP[intVal] || `Unknown (${intVal})`;
                    } else {
                        // Some BF versions use string names like SPIFLASH
                        config.device = val;
                    }
                }
            } else if (cleanLine.startsWith('set blackbox_sample_rate')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.sampleRate = parts[1].trim();
            } else if (cleanLine.startsWith('set debug_mode')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.debugMode = parts[1].trim();
            }
        });

        return config;
    }

    /**
     * Parses the raw `diff all` text and extracts motor and mixer configuration.
     * 
     * @param {string} cliText The raw output of `diff all`
     * @returns {Object} Object containing motor config properties
     */
    static parseMotorConfig(cliText) {
        if (!cliText) return null;

        const config = {
            mixer: 'QUADX',
            protocol: 'DSHOT300',
            bidir: 'OFF',
            motorPoles: 14,
            yawReversed: 'OFF'
        };

        const lines = cliText.split('\n');

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('set motor_pwm_protocol')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.protocol = parts[1].trim();
            } else if (cleanLine.startsWith('set dshot_bidir')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.bidir = parts[1].trim();
            } else if (cleanLine.startsWith('set motor_poles')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.motorPoles = parseInt(parts[1].trim(), 10) || 14;
            } else if (cleanLine.startsWith('set yaw_motors_reversed')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.yawReversed = parts[1].trim();
            } else if (cleanLine.startsWith('mixer')) {
                const parts = cleanLine.split(/\s+/);
                if (parts.length >= 2) config.mixer = parts[1].trim();
            }
        });

        return config;
    }
}

// Export for browser
window.CliParser = CliParser;
