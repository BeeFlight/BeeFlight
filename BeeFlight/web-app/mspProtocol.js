// =========================================================
// mspProtocol.js — MSP V1 Encode/Decode Module
// Referencing Betaflight Configurator's msp.js structure
// =========================================================

const MSP = {
    // ---- Command IDs ----
    MSP_API_VERSION: 1,
    MSP_FC_VARIANT: 2,
    MSP_FC_VERSION: 3,
    MSP_RC: 105,
    MSP_ATTITUDE: 108,
    MSP_ANALOG: 110,
    MSP_STATUS: 101,
    MSP_PID: 112,
    MSP_MOTOR_TELEMETRY: 139,

    // ---- Preamble bytes ----
    PREAMBLE_REQ: [36, 77, 60],  // $M<
    PREAMBLE_RESP: [36, 77, 62],  // $M>

    // ---- Checksum ----
    checksum(size, cmd, data) {
        let crc = size ^ cmd;
        for (let i = 0; i < data.length; i++) crc ^= data[i];
        return crc;
    },

    // ---- Encode a request frame ----
    encode(commandId, payload = []) {
        const size = payload.length;
        const buf = new Uint8Array(6 + size);
        buf[0] = 36;  // $
        buf[1] = 77;  // M
        buf[2] = 60;  // <
        buf[3] = size;
        buf[4] = commandId;
        for (let i = 0; i < size; i++) buf[5 + i] = payload[i];
        buf[5 + size] = this.checksum(size, commandId, payload);
        return buf;
    },

    // ---- Helpers ----
    readU16(payload, offset) {
        return payload[offset] | (payload[offset + 1] << 8);
    },
    readU32(payload, offset) {
        return payload[offset] | (payload[offset + 1] << 8) |
            (payload[offset + 2] << 16) | (payload[offset + 3] << 24);
    },
    readI16(payload, offset) {
        const val = payload[offset] | (payload[offset + 1] << 8);
        return val > 32767 ? val - 65536 : val;
    },

    // ---- Parse individual MSP responses ----
    parseApiVersion(payload) {
        return {
            protocolVersion: payload[0],
            apiMajor: payload[1],
            apiMinor: payload[2],
            display: `${payload[1]}.${payload[2]} (Protocol ${payload[0]})`
        };
    },

    parseFcVariant(payload) {
        return Array.from(payload).map(b => String.fromCharCode(b)).join('');
    },

    parseFcVersion(payload) {
        return `${payload[0]}.${payload[1]}.${payload[2]}`;
    },

    parseStatus(payload) {
        // MSP_STATUS (101) layout:
        // u16 cycleTime, u16 i2cErrors, u16 sensorFlags, u32 flightModeFlags, u8 pidProfile
        const cycleTime = this.readU16(payload, 0);
        const i2cErrors = this.readU16(payload, 2);
        const sensorFlags = this.readU16(payload, 4);
        const flightModeFlags = this.readU32(payload, 6);
        const armed = !!(flightModeFlags & 1);
        let cpuLoad = 0;
        if (payload.length >= 13) {
            cpuLoad = this.readU16(payload, 11);
        }
        return { cycleTime, i2cErrors, sensorFlags, flightModeFlags, armed, cpuLoad };
    },

    parsePid(payload) {
        // 3 bytes per axis (P, I, D), order: Roll, Pitch, Yaw
        if (payload.length < 9) return null;
        return {
            roll: { P: payload[0], I: payload[1], D: payload[2] },
            pitch: { P: payload[3], I: payload[4], D: payload[5] },
            yaw: { P: payload[6], I: payload[7], D: payload[8] }
        };
    },

    parseAttitude(payload) {
        // MSP_ATTITUDE (108): i16 roll (*10), i16 pitch (*10), i16 yaw
        return {
            roll: this.readI16(payload, 0) / 10,
            pitch: this.readI16(payload, 2) / 10,
            yaw: this.readI16(payload, 4)
        };
    },

    parseRc(payload) {
        // MSP_RC (105): array of u16 channel values
        const channels = [];
        for (let i = 0; i < payload.length; i += 2) {
            channels.push(this.readU16(payload, i));
        }
        // Standard mapping: [Roll, Pitch, Yaw, Throttle, Aux1, Aux2, ...]
        return {
            roll: channels[0] || 1500,
            pitch: channels[1] || 1500,
            yaw: channels[2] || 1500,
            throttle: channels[3] || 1000,
            aux: channels.slice(4)
        };
    },

    parseAnalog(payload) {
        // MSP_ANALOG (110): u8 vbat, u16 mAhDrawn, u16 rssi, i16 amperage
        if (payload.length < 7) return null;
        return {
            voltage: payload[0] / 10,
            mAhDrawn: this.readU16(payload, 1),
            rssi: this.readU16(payload, 3),
            amperage: this.readI16(payload, 5) / 100
        };
    },

    parseMotorTelemetry(payload) {
        // MSP_MOTOR_TELEMETRY (139): motor count (u8), then per motor:
        // u32 rpm, u16 invalidPct, u8 temperature, u16 voltage, u16 current, u16 consumption
        const motorCount = payload[0] || 0;
        const rpms = [];
        const bytesPerMotor = 13; // 4+2+1+2+2+2 = 13 bytes per motor
        for (let i = 0; i < motorCount && i < 8; i++) {
            const offset = 1 + (i * bytesPerMotor);
            if (offset + 3 < payload.length) {
                rpms.push(this.readU32(payload, offset));
            } else {
                rpms.push(0);
            }
        }
        // Pad to 4 motors minimum
        while (rpms.length < 4) rpms.push(0);
        return { rpms };
    }
};
