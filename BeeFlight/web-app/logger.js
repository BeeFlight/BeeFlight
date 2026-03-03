// =========================================================
// logger.js — Global Debug Logging System
// =========================================================

const DebugLogger = (() => {
    const LOG_KEY = 'debugLogging';
    let entries = [];

    function isEnabled() {
        const val = localStorage.getItem(LOG_KEY);
        // Default: enabled (null means never set = ON)
        return val === null || val === 'true';
    }

    function setEnabled(on) {
        localStorage.setItem(LOG_KEY, String(on));
    }

    function timestamp() {
        return new Date().toISOString();
    }

    function formatError(err) {
        if (!err) return '';
        if (err instanceof Error) {
            return `${err.message}\n${err.stack || ''}`;
        }
        if (typeof err === 'object') {
            try { return JSON.stringify(err, null, 2); } catch (e) { return String(err); }
        }
        return String(err);
    }

    function record(level, message, detail) {
        if (!isEnabled()) return;
        const entry = {
            ts: timestamp(),
            level,
            message: String(message),
            detail: detail ? formatError(detail) : undefined
        };
        entries.push(entry);
        // Also mirror to browser console
        const consoleFn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
        consoleFn(`[${entry.ts}] [${level}] ${entry.message}`, detail || '');
    }

    function info(msg, detail) { record('INFO', msg, detail); }
    function warn(msg, detail) { record('WARN', msg, detail); }
    function error(msg, detail) { record('ERROR', msg, detail); }

    function getEntries() { return entries; }

    function clear() { entries = []; }

    function download() {
        if (entries.length === 0) {
            alert('No log entries to download.');
            return;
        }
        const text = entries.map(e => {
            let line = `[${e.ts}] [${e.level}] ${e.message}`;
            if (e.detail) line += `\n    ${e.detail.replace(/\n/g, '\n    ')}`;
            return line;
        }).join('\n');

        const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `betaflight-ai-${now}.log`;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ---- QA: Global Error Boundaries ----
    window.addEventListener('error', (event) => {
        record('ERROR', `Unhandled Error: ${event.message}`, {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error ? formatError(event.error) : undefined
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        record('ERROR', `Unhandled Promise Rejection`, event.reason);
    });

    return { info, warn, error, isEnabled, setEnabled, getEntries, clear, download };
})();

// Global shorthand
const log = DebugLogger;
