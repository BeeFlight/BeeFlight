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
     * @param {Object} dynamicMap The MSP Box mapping from droneState.dynamicModeMap
     * @returns {Array} Array of parsed mode mapping objects
     */
    static parseModes(cliText, dynamicMap = {}) {
        if (!cliText) return [];

        const modes = [];
        const lines = cliText.split('\n');

        // Create a reverse lookup dictionary from the dynamicMap (value -> key)
        const reverseMap = {};
        for (const [name, id] of Object.entries(dynamicMap)) {
            reverseMap[id] = name;
        }

        // Common Betaflight Mode IDs (Fallback for unsupported FCs / Jumbo Frames)
        const FALLBACK_MODE_NAMES = {
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

        // Regex to match: aux [linkId] [modeId] [channelIndex] [minRange] [maxRange] ...
        const auxRegex = /^aux\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;

        lines.forEach(line => {
            const match = line.trim().match(auxRegex);
            if (match) {
                // Betaflight 4.x typical format: aux 0 0 2 1300 1700 0 0
                // match[1] = linkId, match[2] = modeId, match[3] = channelIndex
                const modeId = parseInt(match[2], 10);
                const channelIndex = parseInt(match[3], 10);
                const minRange = parseInt(match[4], 10);
                const maxRange = parseInt(match[5], 10);

                // Filter out disabled/unused modes (Betaflight sets these to 900 900 or 1000 1000)
                if ((minRange === 900 && maxRange === 900) || (minRange === 1000 && maxRange === 1000) || minRange > 2100 || maxRange < 900) {
                    return; // Skip this line, mode is inactive
                }

                // Prevent duplicate mode cards if the user has multiple links for the same mode
                // For the basic UI, we just render the first active link we find.
                if (modes.some(m => m.modeId === modeId)) {
                    return;
                }

                const modeName = reverseMap[modeId] || FALLBACK_MODE_NAMES[modeId] || `UNSUPPORTED MODE ID (${modeId})`;
                const channelName = `AUX ${channelIndex + 1}`;

                modes.push({
                    modeId,
                    linkId: parseInt(match[1], 10),
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

    /**
     * Parses the raw `diff all` text and extracts PID, rate, and filter dynamics.
     *
     * @param {string} cliText The raw output of `diff all`
     * @returns {Object|null} Object containing dynamics properties
     */
    static parseDynamics(cliText) {
        if (!cliText) return null;

        const dynamics = {
            profile: 0,
            rateProfile: 0,
            pids: {
                roll: { p: null, i: null, d: null, f: null },
                pitch: { p: null, i: null, d: null, f: null },
                yaw: { p: null, i: null, d: null, f: null }
            },
            rates: {
                roll: { rcRate: null, superRate: null, expo: null },
                pitch: { rcRate: null, superRate: null, expo: null },
                yaw: { rcRate: null, superRate: null, expo: null }
            },
            filters: {
                gyroLowpassHz: null,
                dtermLowpassHz: null
            }
        };

        const lines = cliText.split('\n');

        lines.forEach(rawLine => {
            const line = rawLine.trim();
            if (!line.startsWith('set')) return;

            const parts = line.split('=');
            if (parts.length !== 2) return;
            const key = parts[0].replace('set', '').trim();
            const valStr = parts[1].trim();
            const valNum = parseFloat(valStr);
            const val = Number.isNaN(valNum) ? valStr : valNum;

            switch (key) {
                case 'profile':
                    if (!Number.isNaN(valNum)) dynamics.profile = valNum;
                    break;
                case 'rateprofile':
                    if (!Number.isNaN(valNum)) dynamics.rateProfile = valNum;
                    break;
                // PIDs
                case 'p_roll':
                    dynamics.pids.roll.p = val;
                    break;
                case 'i_roll':
                    dynamics.pids.roll.i = val;
                    break;
                case 'd_roll':
                    dynamics.pids.roll.d = val;
                    break;
                case 'f_roll':
                    dynamics.pids.roll.f = val;
                    break;
                case 'p_pitch':
                    dynamics.pids.pitch.p = val;
                    break;
                case 'i_pitch':
                    dynamics.pids.pitch.i = val;
                    break;
                case 'd_pitch':
                    dynamics.pids.pitch.d = val;
                    break;
                case 'f_pitch':
                    dynamics.pids.pitch.f = val;
                    break;
                case 'p_yaw':
                    dynamics.pids.yaw.p = val;
                    break;
                case 'i_yaw':
                    dynamics.pids.yaw.i = val;
                    break;
                case 'd_yaw':
                    dynamics.pids.yaw.d = val;
                    break;
                case 'f_yaw':
                    dynamics.pids.yaw.f = val;
                    break;
                // Rates (RC rate, super rate, expo)
                case 'roll_rc_rate':
                    dynamics.rates.roll.rcRate = val;
                    break;
                case 'roll_srate':
                    dynamics.rates.roll.superRate = val;
                    break;
                case 'roll_expo':
                    dynamics.rates.roll.expo = val;
                    break;
                case 'pitch_rc_rate':
                    dynamics.rates.pitch.rcRate = val;
                    break;
                case 'pitch_srate':
                    dynamics.rates.pitch.superRate = val;
                    break;
                case 'pitch_expo':
                    dynamics.rates.pitch.expo = val;
                    break;
                case 'yaw_rc_rate':
                    dynamics.rates.yaw.rcRate = val;
                    break;
                case 'yaw_srate':
                    dynamics.rates.yaw.superRate = val;
                    break;
                case 'yaw_expo':
                    dynamics.rates.yaw.expo = val;
                    break;
                // Filters
                case 'gyro_lowpass_hz':
                    dynamics.filters.gyroLowpassHz = val;
                    break;
                case 'dterm_lowpass_hz':
                    dynamics.filters.dtermLowpassHz = val;
                    break;
                default:
                    break;
            }
        });

        return dynamics;
    }

    /**
     * Parses the raw `diff all` text and extracts VTX and displayport configuration.
     * Also infers whether the system is running Analog VTX control or HD Digital (MSP DisplayPort).
     *
     * @param {string} cliText The raw output of `diff all`
     * @returns {Object|null} Object containing VTX config and inferred system type
     */
    static parseVtxConfig(cliText) {
        if (!cliText) return null;

        const config = {
            band: null,
            channel: null,
            power: null,
            lowPowerDisarm: null,
            osdDisplayportDevice: null,
            // Detection flags
            isHdDigital: false,
            hasAnalogVtxOnSerial: false,
            // Human-readable summary
            systemType: 'Unknown',
            protocolLabel: 'Unknown / Not Detected'
        };

        const lines = cliText.split('\n');

        lines.forEach(line => {
            const cleanLine = line.trim();

            if (cleanLine.startsWith('set vtx_band')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) {
                    const raw = parts[1].trim();
                    const intVal = parseInt(raw, 10);
                    config.band = Number.isNaN(intVal) ? raw : intVal;
                }
            } else if (cleanLine.startsWith('set vtx_channel')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) {
                    const raw = parts[1].trim();
                    const intVal = parseInt(raw, 10);
                    config.channel = Number.isNaN(intVal) ? raw : intVal;
                }
            } else if (cleanLine.startsWith('set vtx_power')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) {
                    const raw = parts[1].trim();
                    const intVal = parseInt(raw, 10);
                    config.power = Number.isNaN(intVal) ? raw : intVal;
                }
            } else if (cleanLine.startsWith('set vtx_low_power_disarm')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) {
                    config.lowPowerDisarm = parts[1].trim();
                }
            } else if (cleanLine.startsWith('set osd_displayport_device')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) {
                    const raw = parts[1].trim();
                    config.osdDisplayportDevice = raw;
                }
            }
        });

        // Determine HD Digital vs Analog based on osd_displayport_device
        let hdDigital = false;
        if (config.osdDisplayportDevice !== null && config.osdDisplayportDevice !== undefined) {
            const raw = String(config.osdDisplayportDevice).trim();
            const intVal = parseInt(raw, 10);
            if (!Number.isNaN(intVal)) {
                // If osd_displayport_device is active (non-zero), treat as HD Digital
                hdDigital = intVal !== PERIPHERAL_NONE;
            } else {
                const upper = raw.toUpperCase();
                // Common Betaflight values: MSP, MAX7456, AT7456E, NONE
                if (upper !== '0' && upper !== 'NONE' && upper !== 'OFF' && upper !== 'DISABLED') {
                    hdDigital = true;
                }
            }
        }
        config.isHdDigital = hdDigital;

        // If not HD Digital, look for SmartAudio / Tramp on any serial port function mask
        if (!config.isHdDigital) {
            const ports = CliParser.parsePorts(cliText) || [];
            config.hasAnalogVtxOnSerial = ports.some(p =>
                (p.functionMask & FUNCTION_VTX_SMARTAUDIO) || (p.functionMask & FUNCTION_VTX_TRAMP)
            );
        }

        // Human-readable labels
        if (config.isHdDigital) {
            config.systemType = 'HD Digital';
            config.protocolLabel = 'MSP DisplayPort (HD)';
        } else if (config.hasAnalogVtxOnSerial) {
            config.systemType = 'Analog';
            config.protocolLabel = 'SmartAudio / IRC Tramp';
        } else {
            config.systemType = 'Unknown';
            config.protocolLabel = 'Unknown / No VTX Detected';
        }

        return config;
    }

    /**
     * Parses the raw `diff all` text and extracts feature flags (e.g., ACC, MOTOR_STOP).
     * @param {string} cliText The raw output of `diff all`
     * @returns {Object} Object containing feature boolean flags (e.g., { acc: true, gps: false })
     */
    static parseFeatures(cliText) {
        if (!cliText) return {};

        const features = {
            acc: true // Typically enabled by default unless specifically disabled
        };

        const lines = cliText.split('\n');

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('feature ')) {
                const featureName = cleanLine.substring(8).trim();
                if (featureName.startsWith('-')) {
                    features[featureName.substring(1).toLowerCase()] = false;
                } else {
                    features[featureName.toLowerCase()] = true;
                }
            }
        });

        // Firmware Support Check (Did they compile Betaflight with Launch Control?)
        features.launchControlSupported = cliText.includes('launch_control_mode');

        return features;
    }

    /**
     * Parses the raw `diff all` text and extracts Launch Control configuration.
     * @param {string} cliText The raw output of `diff all`
     * @returns {Object} Object containing Launch Control properties
     */
    static parseLaunchControl(cliText) {
        if (!cliText) return null;

        const config = {
            mode: 'NORMAL',
            triggerThrottlePercent: 20,
            angleLimit: 0
        };

        const lines = cliText.split('\n');

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('set launch_control_mode')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.mode = parts[1].trim();
            } else if (cleanLine.startsWith('set launch_trigger_throttle_percent')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.triggerThrottlePercent = parseInt(parts[1].trim(), 10) || 20;
            } else if (cleanLine.startsWith('set launch_angle_limit')) {
                const parts = cleanLine.split('=');
                if (parts.length === 2) config.angleLimit = parseInt(parts[1].trim(), 10) || 0;
            }
        });

        return config;
    }
}

// Export for browser
window.CliParser = CliParser;
