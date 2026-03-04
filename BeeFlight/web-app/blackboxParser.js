// =========================================================
// blackboxParser.js — Parse .bfl / .csv blackbox logs and extract summary metrics
// =========================================================

(function (global) {
    'use strict';

    const FFT_SIZE = 2048;

    function simpleFFT(samples) {
        const n = samples.length;
        if (n < 2) return [];
        const out = new Array(Math.floor(n / 2));
        for (let k = 0; k < n / 2; k++) {
            let re = 0, im = 0;
            for (let t = 0; t < n; t++) {
                const angle = (-2 * Math.PI * k * t) / n;
                re += samples[t] * Math.cos(angle);
                im += samples[t] * Math.sin(angle);
            }
            out[k] = Math.sqrt(re * re + im * im) / n;
        }
        return out;
    }

    function findPeakFrequencies(magnitudes, sampleRateHz) {
        const peaks = [];
        const binWidth = sampleRateHz / magnitudes.length;
        for (let i = 2; i < magnitudes.length - 2; i++) {
            const m = magnitudes[i];
            if (m > magnitudes[i - 1] && m > magnitudes[i - 2] &&
                m > magnitudes[i + 1] && m > magnitudes[i + 2]) {
                peaks.push({ freq: i * binWidth, magnitude: m });
            }
        }
        peaks.sort((a, b) => b.magnitude - a.magnitude);
        return peaks.slice(0, 3).map(p => Math.round(p.freq));
    }

    function parseCSV(text) {
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) return null;
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(',').map(v => parseFloat(v.trim().replace(/^"|"$/g, '')));
            if (vals.some(isNaN)) continue;
            const row = {};
            headers.forEach((h, j) => { row[h] = vals[j]; });
            rows.push(row);
        }
        return { headers, rows };
    }

    function findColumn(data, patterns) {
        for (const p of patterns) {
            const col = data.headers.find(h => p.test(String(h)));
            if (col) return col;
        }
        return null;
    }

    function extractSummaryFromCSV(csvData, sampleRateHz = 1000) {
        const { headers, rows } = csvData;
        if (!rows.length) return null;

        const gyroX = findColumn(csvData, [/gyro\[0\]/, /gyroX/, /gyro\.x/, /^gyro_roll$/i]);
        const gyroY = findColumn(csvData, [/gyro\[1\]/, /gyroY/, /gyro\.y/, /^gyro_pitch$/i]);
        const gyroZ = findColumn(csvData, [/gyro\[2\]/, /gyroZ/, /gyro\.z/, /^gyro_yaw$/i]);
        const setpointX = findColumn(csvData, [/setpoint\[0\]/, /setpointRoll/, /setpoint\.x/, /^setpoint_roll$/i]);
        const setpointY = findColumn(csvData, [/setpoint\[1\]/, /setpointPitch/, /setpoint\.y/, /^setpoint_pitch$/i]);
        const setpointZ = findColumn(csvData, [/setpoint\[2\]/, /setpointYaw/, /setpoint\.z/, /^setpoint_yaw$/i]);
        const throttleCol = findColumn(csvData, [/rcCommand\[3\]/, /throttle/, /^rcThrottle$/i]);

        const motorCols = [];
        for (let i = 0; i < 8; i++) {
            const c = findColumn(csvData, [new RegExp(`motor\\[${i}\\]`), new RegExp(`motor${i}`), new RegExp(`motor_${i}`)]);
            if (c) motorCols.push(c);
        }

        const gyroCols = [gyroX, gyroY, gyroZ].filter(Boolean);
        const setpointCols = [setpointX, setpointY, setpointZ].filter(Boolean);

        // --- Flight Duration ---
        const flightDuration = parseFloat((rows.length / sampleRateHz).toFixed(1));

        // --- Max Throttle ---
        let maxThrottle = 0;
        if (throttleCol) {
            const throttleVals = rows.map(r => r[throttleCol] || 0);
            const rawMax = Math.max(...throttleVals);
            maxThrottle = rawMax > 1000 ? Math.round(((rawMax - 1000) / 1000) * 100) : Math.round(rawMax);
        }

        // --- Per-Axis Dominant Noise Hz ---
        const dominantNoiseHz = { roll: 0, pitch: 0, yaw: 0 };
        const axisLabels = ['roll', 'pitch', 'yaw'];
        gyroCols.forEach((col, idx) => {
            if (!col) return;
            const samples = rows.map(r => r[col] || 0).slice(0, Math.min(FFT_SIZE, rows.length));
            const mags = simpleFFT(samples);
            const peaks = findPeakFrequencies(mags, sampleRateHz);
            dominantNoiseHz[axisLabels[idx]] = peaks.length > 0 ? peaks[0] : 0;
        });

        // --- Legacy combined peakResonances (kept for backwards compat) ---
        let peakResonances = [];
        if (gyroCols.length > 0) {
            const combined = rows.map(r => {
                let sum = 0;
                gyroCols.forEach(c => { sum += (r[c] || 0); });
                return sum / gyroCols.length;
            });
            const slice = combined.slice(0, Math.min(FFT_SIZE, combined.length));
            const mags = simpleFFT(slice);
            peakResonances = findPeakFrequencies(mags, sampleRateHz);
        }

        // --- Motor Averages ---
        let motorAverages = [0, 0, 0, 0];
        if (motorCols.length >= 4) {
            let raw = motorCols.slice(0, 4).map(col => {
                const vals = rows.map(r => r[col] || 0).filter(v => !isNaN(v));
                return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            });
            const maxVal = Math.max(...raw, 1);
            motorAverages = maxVal > 100 ? raw.map(v => (v / 2047) * 100) : raw;
        }

        // --- Per-Axis Tracking Error ---
        const trackingError = { roll: 0, pitch: 0 };
        let pidTracking = null;
        if (gyroCols.length >= 2 && setpointCols.length >= 2) {
            let totalErr = 0, count = 0;
            let rollErr = 0, rollCount = 0, pitchErr = 0, pitchCount = 0;
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                for (let j = 0; j < Math.min(gyroCols.length, setpointCols.length); j++) {
                    const g = r[gyroCols[j]] || 0;
                    const s = r[setpointCols[j]] || 0;
                    const err = Math.abs(g - s);
                    totalErr += err;
                    count++;
                    if (j === 0) { rollErr += err; rollCount++; }
                    if (j === 1) { pitchErr += err; pitchCount++; }
                }
            }
            pidTracking = count ? totalErr / count : null;
            trackingError.roll = rollCount ? parseFloat((rollErr / rollCount).toFixed(1)) : 0;
            trackingError.pitch = pitchCount ? parseFloat((pitchErr / pitchCount).toFixed(1)) : 0;
        }

        return {
            flightDuration,
            maxThrottle,
            dominantNoiseHz,
            trackingError,
            peakResonances,
            motorAverages,
            pidTracking,
            frameCount: rows.length,
            sampleRateHz
        };
    }

    function parseBflToSummary(buffer) {
        // Very basic partial binary parser to extract some summary data 
        // to avoid full blocking CSV conversion.
        const view = new DataView(buffer);
        const uint8 = new Uint8Array(buffer);
        let offset = 0;

        let sampleRateHz = 1000;
        let firmware = 'Unknown';
        let frameCount = 0;
        let peakResonances = [];
        let motorAverages = [0, 0, 0, 0];
        let pidTracking = null;

        // Try to read header (ASCII strings ending in newline)
        try {
            while (offset < uint8.length) {
                if (uint8[offset] !== 72) break; // 'H' for Header
                offset++;
                let keyStart = offset;
                while (offset < uint8.length && uint8[offset] !== 58) offset++; // ':'
                let key = new TextDecoder().decode(uint8.subarray(keyStart, offset));
                offset++;
                let valStart = offset;
                while (offset < uint8.length && uint8[offset] !== 10) offset++; // '\n'
                let val = new TextDecoder().decode(uint8.subarray(valStart, offset));
                offset++;

                if (key === 'Firmware revision') firmware = val;
                if (key === 'looptime') sampleRateHz = 1000000 / parseInt(val || 1000, 10);
            }

            // Estimate frame count by just scanning for frame markers ('I', 'P', 'S') roughly
            // This is a gross simplification but gives *some* metric without a full bit-banging library
            const len = uint8.length;
            for (let i = offset; i < len; i++) {
                const b = uint8[i];
                if (b === 73 || b === 80) { // 'I' (Intra) or 'P' (Inter) frame marker
                    // To avoid false positives we'd need a real bit-stream parser, 
                    // but for MVP summary we just do a rough count.
                    frameCount++;
                    i += 20; // Skip ahead a bit to avoid overcounting bytes as markers
                }
            }
        } catch (e) {
            console.error("BFL partial parse failed", e);
        }

        return {
            flightDuration: 0,
            maxThrottle: 0,
            dominantNoiseHz: { roll: 0, pitch: 0, yaw: 0 },
            trackingError: { roll: 0, pitch: 0 },
            peakResonances,
            motorAverages,
            pidTracking,
            frameCount,
            sampleRateHz,
            firmware,
            bflParsed: true,
            message: `Native fast-parsed ${frameCount} frames (${(uint8.length / 1024 / 1024).toFixed(2)} MB). Full decoding requires 'blackbox-log-viewer' for in-depth AI tuning.`
        };
    }

    function parseFile(file, onProgress) {
        return new Promise((resolve, reject) => {
            const name = (file.name || '').toLowerCase();
            const isCsv = name.endsWith('.csv') || name.endsWith('.txt');
            const isBfl = name.endsWith('.bbl');

            if (!isCsv && !isBfl) {
                reject(new Error('Unsupported format. Use .bbl, .csv, or .txt.'));
                return;
            }

            const reader = new FileReader();
            reader.onprogress = (e) => {
                if (onProgress && e.lengthComputable) {
                    onProgress(Math.round((e.loaded / e.total) * 30));
                }
            };
            reader.onload = () => {
                try {
                    if (isCsv) {
                        if (onProgress) onProgress(40);
                        const text = String(reader.result);
                        const csvData = parseCSV(text);
                        if (!csvData || !csvData.rows.length) {
                            reject(new Error('CSV appears empty or invalid.'));
                            return;
                        }
                        if (onProgress) onProgress(70);
                        const summary = extractSummaryFromCSV(csvData);
                        if (onProgress) onProgress(90);
                        resolve(summary);
                    } else {
                        if (onProgress) onProgress(40);
                        const buf = reader.result;
                        const summary = parseBflToSummary(buf);
                        if (onProgress) onProgress(90);
                        resolve(summary);
                    }
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file.'));
            if (isCsv) {
                reader.readAsText(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        });
    }

    global.BlackboxParser = {
        parseFile,
        extractSummaryFromCSV,
        parseCSV,
        parseBflToSummary
    };
})(typeof window !== 'undefined' ? window : this);
