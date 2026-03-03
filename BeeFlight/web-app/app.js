// =========================================================
// BETAFLIGHT AI — Phase 3: Hybrid Data Architecture
// Uses mspProtocol.js for encode/decode
// =========================================================

// ---- Gemini API Key (Secure: sessionStorage) ----
function getApiKey() { return sessionStorage.getItem('gemini_api_key') || ''; }
function setApiKey(key) { sessionStorage.setItem('gemini_api_key', key); }
function promptForApiKey() {
    const key = prompt('Enter your Google Gemini API Key:');
    if (key && key.trim().length > 10) {
        setApiKey(key.trim());
        updateAiStatus();
        logToConsole('Gemini API key saved for this session.', 'success');
    } else if (key !== null) {
        log.warn('Invalid API key entered.');
        logToConsole('Invalid API key.', 'error');
    }
}

// ---- Global Drone State ----
const droneState = {
    connected: false,
    firmwareIdentifier: "Unknown",
    firmwareVersion: "Unknown",
    boardName: "Unknown",
    mspApiVersion: "Unknown",
    live: {
        status: { armed: false, cycleTime: 0, cpuLoad: 0 },
        pids: { roll: { P: 0, I: 0, D: 0 }, pitch: { P: 0, I: 0, D: 0 }, yaw: { P: 0, I: 0, D: 0 } },
        attitude: { roll: 0, pitch: 0, yaw: 0 },
        rc: { roll: 1500, pitch: 1500, yaw: 1500, throttle: 1000, aux: [] },
        analog: { voltage: 0, amperage: 0, mAhDrawn: 0, rssi: 0 },
        rpm: [0, 0, 0, 0]
    },
    // Parsed static configuration derived from CLI diff
    vtx: {
        band: null,
        channel: null,
        power: null,
        lowPowerDisarm: null,
        osdDisplayportDevice: null,
        systemType: 'Unknown',
        protocolLabel: 'Unknown / Not Detected',
        isHdDigital: false
    },
    dynamics: {
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
    },
    cliDiff: "", // Raw text from `diff all`
    cliDump: ""  // Alias used for history snapshots / restore
};

// ---- UI Elements ----
const connectBtn = document.getElementById('connectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const logOutput = document.getElementById('logOutput');
const aiStatusBadge = document.querySelector('.ai-status');
const chatContainer = document.getElementById('chatContainer');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const thinkingIndicator = document.getElementById('thinkingIndicator');
const connectSection = document.getElementById('connectSection');
const dashboardLayout = document.getElementById('dashboardLayout');
const syncOverlay = document.getElementById('syncOverlay');
// ---- Integration Settings ----
const googleClientIdInput = document.getElementById('googleClientIdInput');
const saveGoogleClientIdBtn = document.getElementById('saveGoogleClientIdBtn');
const googleStatusLabel = document.getElementById('googleStatusLabel');
const githubPatInput = document.getElementById('githubPatInput');
const githubPublicDefaultToggle = document.getElementById('githubPublicDefaultToggle');
const saveGithubPatBtn = document.getElementById('saveGithubPatBtn');
const driveAuthStatus = document.getElementById('driveAuthStatus');
const githubAuthStatus = document.getElementById('githubAuthStatus');
const btnExportLocal = document.getElementById('btnExportLocal');
const btnExportDrive = document.getElementById('btnExportDrive');
const btnExportGist = document.getElementById('btnExportGist');
// Restore/import elements
const importFileInput = document.getElementById('importFileInput');
const btnSelectImportFile = document.getElementById('btnSelectImportFile');
const restoreStateUpload = document.getElementById('restoreStateUpload');
const restoreStateAnalyzing = document.getElementById('restoreStateAnalyzing');
const restoreStateChecklist = document.getElementById('restoreStateChecklist');
const importErrorBox = document.getElementById('importErrorBox');
const btnFlashDrone = document.getElementById('btnFlashDrone');
const btnCancelImport = document.getElementById('btnCancelImport');
const importProgressContainer = document.getElementById('importProgressContainer');
const importProgressBar = document.getElementById('importProgressBar');
const importProgressLabel = document.getElementById('importProgressLabel');
const chkHardwareIcon = document.getElementById('chkHardwareIcon');
const chkVersionIcon = document.getElementById('chkVersionIcon');
const chkIntegrityIcon = document.getElementById('chkIntegrityIcon');
const chkMotorIcon = document.getElementById('chkMotorIcon');

// Session history for AI actions (time machine)
window.sessionHistory = window.sessionHistory || [];

// ---- Integration Local Storage Keys ----
const GOOGLE_CLIENT_ID_KEY = 'bfai_google_client_id';
const GITHUB_PAT_KEY = 'bfai_github_pat';
const GITHUB_PUBLIC_DEFAULT_KEY = 'bfai_github_public_default';

let googleDriveAuthed = false;
let importFileText = '';
let lastImportValidation = null;

function getGoogleClientId() {
    return localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || '';
}

function setGoogleClientId(id) {
    localStorage.setItem(GOOGLE_CLIENT_ID_KEY, id || '');
}

function getGithubPat() {
    return localStorage.getItem(GITHUB_PAT_KEY) || '';
}

function setGithubPat(pat) {
    localStorage.setItem(GITHUB_PAT_KEY, pat || '');
}

function getGithubPublicDefault() {
    return localStorage.getItem(GITHUB_PUBLIC_DEFAULT_KEY) === 'true';
}

function setGithubPublicDefault(val) {
    localStorage.setItem(GITHUB_PUBLIC_DEFAULT_KEY, val ? 'true' : 'false');
}

function updateIntegrationStatusUI() {
    const hasClientId = !!getGoogleClientId();
    if (googleStatusLabel) {
        googleStatusLabel.textContent = googleDriveAuthed
            ? 'Connected to Google Drive'
            : hasClientId
                ? 'Client ID saved — connect on export'
                : 'Not connected';
    }
    if (driveAuthStatus) {
        driveAuthStatus.textContent = googleDriveAuthed
            ? 'Ready'
            : hasClientId
                ? 'Auth required'
                : 'Not connected';
    }

    const hasPat = !!getGithubPat();
    if (githubStatusLabel) {
        githubStatusLabel.textContent = hasPat
            ? 'Token saved — ready to publish'
            : 'Not configured';
    }
    if (githubAuthStatus) {
        githubAuthStatus.textContent = hasPat ? 'Ready' : 'Not configured';
    }
}

function resetImportUI() {
    if (!restoreStateUpload) return;
    restoreStateUpload.classList.remove('hidden');
    if (restoreStateAnalyzing) restoreStateAnalyzing.classList.add('hidden');
    if (restoreStateChecklist) restoreStateChecklist.classList.add('hidden');
    if (importErrorBox) {
        importErrorBox.textContent = '';
        importErrorBox.classList.add('hidden');
    }
    if (btnFlashDrone) btnFlashDrone.disabled = true;
    if (importProgressContainer) importProgressContainer.classList.add('hidden');
    if (importProgressBar) importProgressBar.style.width = '0%';
    if (importProgressLabel) importProgressLabel.textContent = '0%';
    if (importFileInput) importFileInput.value = '';
    importFileText = '';
    lastImportValidation = null;
    const icons = [chkHardwareIcon, chkVersionIcon, chkIntegrityIcon, chkMotorIcon];
    icons.forEach(icon => {
        if (!icon) return;
        icon.textContent = '⬜';
        icon.classList.remove('pass', 'fail');
    });
}

function setImportAnalyzingState() {
    if (!restoreStateUpload) return;
    restoreStateUpload.classList.add('hidden');
    if (restoreStateAnalyzing) restoreStateAnalyzing.classList.remove('hidden');
    if (restoreStateChecklist) restoreStateChecklist.classList.add('hidden');
    if (importErrorBox) importErrorBox.classList.add('hidden');
    if (btnFlashDrone) btnFlashDrone.disabled = true;
}

function updateImportProgress(pct) {
    if (importProgressBar) importProgressBar.style.width = `${pct}%`;
    if (importProgressLabel) importProgressLabel.textContent = `${pct}%`;
}

// ---- Serial State ----
let port, reader, writer;
let mspBuffer = [];
let pollingInterval = null;
let isPolling = false;
let cliMode = false;
let isReconnectingAfterCli = false;

// ---------------------------------------------------------
// Logging (mirrors to on-screen console + DebugLogger)
// ---------------------------------------------------------
function logToConsole(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString();
    const el = document.createElement('div');
    el.textContent = `[${ts}] ${msg}`;
    if (type === 'error') el.style.color = 'var(--status-danger)';
    if (type === 'success') el.style.color = 'var(--status-success)';
    if (type === 'rx') el.style.color = 'var(--accent-blue)';
    if (type === 'tx') el.style.color = 'var(--accent-purple)';
    logOutput.appendChild(el);
    logOutput.scrollTop = logOutput.scrollHeight;
    // Mirror to DebugLogger
    if (type === 'error') log.error(msg);
    else if (type === 'success' || type === 'rx' || type === 'tx') log.info(msg);
    else log.info(msg);
}

// ---------------------------------------------------------
// Dashboard UI Updates
// ---------------------------------------------------------
function showDashboard() {
    connectSection.classList.add('hidden');
    dashboardLayout.classList.remove('hidden');
}

let updateLoopActive = false;

function uiUpdateLoop() {
    if (!droneState.connected || cliMode || !updateLoopActive) return;

    // Check which view is active to save rendering performance
    const setupView = document.getElementById('view-setup');
    if (setupView && setupView.classList.contains('active')) {
        // Setup Tab Updates
        document.getElementById('valFirmware').textContent = droneState.firmwareIdentifier;
        document.getElementById('valVersion').textContent = droneState.firmwareVersion;
        document.getElementById('valMspApi').textContent = droneState.mspApiVersion;

        const s = droneState.live.status;
        const armedEl = document.getElementById('valArmed');
        armedEl.textContent = s.armed ? 'ARMED' : 'Disarmed';
        armedEl.className = 'data-value ' + (s.armed ? 'armed-yes' : 'armed-no');
        document.getElementById('valCpuLoad').textContent = s.cpuLoad + '%';

        const a = droneState.live.analog;
        document.getElementById('valBattery').textContent = a.voltage.toFixed(1) + ' V';

        const att = droneState.live.attitude;
        document.getElementById('instRoll').textContent = att.roll.toFixed(1) + '°';
        document.getElementById('instPitch').textContent = att.pitch.toFixed(1) + '°';
        document.getElementById('instYaw').textContent = att.yaw + '°';
    }

    const receiverView = document.getElementById('view-receiver');
    if (receiverView && receiverView.classList.contains('active')) {
        // Receiver Tab Updates
        const rc = droneState.live.rc;

        // Helper to map PWM (1000-2000) to percentage (0-100%)
        const toPct = (val) => Math.max(0, Math.min(100, ((val - 1000) / 1000) * 100)) + '%';

        document.getElementById('valRcRoll').textContent = rc.roll;
        document.getElementById('barRoll').style.width = toPct(rc.roll);

        document.getElementById('valRcPitch').textContent = rc.pitch;
        document.getElementById('barPitch').style.width = toPct(rc.pitch);

        document.getElementById('valRcYaw').textContent = rc.yaw;
        document.getElementById('barYaw').style.width = toPct(rc.yaw);

        document.getElementById('valRcThrottle').textContent = rc.throttle;
        document.getElementById('barThrottle').style.width = toPct(rc.throttle);

        if (rc.aux.length > 0) {
            document.getElementById('valRcAux1').textContent = rc.aux[0] || 1500;
            document.getElementById('barAux1').style.width = toPct(rc.aux[0] || 1500);

            document.getElementById('valRcAux2').textContent = rc.aux[1] || 1500;
            document.getElementById('barAux2').style.width = toPct(rc.aux[1] || 1500);

            document.getElementById('valRcAux3').textContent = rc.aux[2] || 1500;
            document.getElementById('barAux3').style.width = toPct(rc.aux[2] || 1500);

            document.getElementById('valRcAux4').textContent = rc.aux[3] || 1500;
            document.getElementById('barAux4').style.width = toPct(rc.aux[3] || 1500);
        }
    }

    const modesView = document.getElementById('view-modes');
    if (modesView && modesView.classList.contains('active')) {
        // Modes Tab Updates (Evaluate live RC aux against parsed mode ranges)
        const activeModes = droneState.live.rc.aux;
        if (window.parsedModes && window.parsedModes.length > 0) {
            window.parsedModes.forEach(mode => {
                const card = document.getElementById(`modeCard-${mode.modeId}`);
                if (card) {
                    const currentPwm = activeModes[mode.channelIndex] || 1500;
                    const isActive = currentPwm >= mode.minRange && currentPwm <= mode.maxRange;

                    if (isActive) {
                        card.classList.add('active');
                        // Add safety warning if ARM is active on bench
                        if (mode.modeId === 0) card.classList.add('arm-warning');
                    } else {
                        card.classList.remove('active');
                        if (mode.modeId === 0) card.classList.remove('arm-warning');
                    }
                }
            });
        }
    }

    const powerView = document.getElementById('view-power');
    if (powerView && powerView.classList.contains('active')) {
        // Power Tab Live Telemetry
        const a = droneState.live.analog;
        document.getElementById('valLiveVoltage').textContent = a.voltage.toFixed(2) + ' V';
        document.getElementById('valLiveAmperage').textContent = a.amperage.toFixed(2) + ' A';
    }

    const motorsView = document.getElementById('view-motors');
    if (motorsView && motorsView.classList.contains('active')) {
        // Motors Tab Live RPM Telemetry
        const rpms = droneState.live.rpm;
        for (let i = 0; i < 4; i++) {
            const el = document.getElementById(`rpmMotor${i + 1}`);
            if (el) el.textContent = rpms[i] || 0;
        }
    }

    requestAnimationFrame(uiUpdateLoop);
}

function startUiUpdateLoop() {
    if (!updateLoopActive) {
        updateLoopActive = true;
        requestAnimationFrame(uiUpdateLoop);
    }
}

// ---------------------------------------------------------
// Toast Notifications (lightweight)
// ---------------------------------------------------------
function showToast(message, type = 'info', linkUrl = null) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.position = 'fixed';
        container.style.top = '16px';
        container.style.right = '16px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.minWidth = '220px';
    toast.style.maxWidth = '340px';
    toast.style.padding = '10px 14px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '0.85rem';
    toast.style.background = 'rgba(15,23,42,0.95)';
    toast.style.border = '1px solid rgba(148,163,184,0.6)';
    toast.style.color = 'var(--text-primary)';
    toast.style.boxShadow = '0 8px 20px rgba(0,0,0,0.4)';
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.gap = '4px';

    if (type === 'success') {
        toast.style.borderColor = 'rgba(16,185,129,0.6)';
    } else if (type === 'error') {
        toast.style.borderColor = 'rgba(239,68,68,0.7)';
    }

    const textEl = document.createElement('div');
    textEl.textContent = message;
    toast.appendChild(textEl);

    if (linkUrl) {
        const linkEl = document.createElement('a');
        linkEl.href = linkUrl;
        linkEl.textContent = 'Open link';
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.style.color = 'var(--accent)';
        linkEl.style.textDecoration = 'underline';
        linkEl.style.fontSize = '0.8rem';
        toast.appendChild(linkEl);
    }

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode === container) {
            container.removeChild(toast);
        }
    }, 4000);
}

function stopUiUpdateLoop() {
    updateLoopActive = false;
}

// ---------------------------------------------------------
// AI Copilot — Chat
// ---------------------------------------------------------
function appendChatMessage(role, text) {
    const d = document.createElement('div');
    d.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');
    d.textContent = text;
    chatContainer.appendChild(d);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function renderAiResponse(rawText) {
    // Look for ```action ... ``` fenced block
    const actionFence = '```action';
    const fenceIndex = rawText.indexOf(actionFence);
    if (fenceIndex === -1) {
        appendChatMessage('ai', rawText);
        return;
    }

    const before = rawText.slice(0, fenceIndex).trim();
    const afterStart = fenceIndex + actionFence.length;
    const closingIndex = rawText.indexOf('```', afterStart);
    if (closingIndex === -1) {
        // malformed; just show as normal text
        appendChatMessage('ai', rawText);
        return;
    }

    const jsonText = rawText.slice(afterStart, closingIndex).trim();
    let action = null;
    try {
        action = JSON.parse(jsonText);
    } catch (e) {
        log.error('Failed to parse action JSON', jsonText);
        appendChatMessage('ai', rawText);
        return;
    }

    // Optional explanatory text before the action
    if (before) {
        appendChatMessage('ai', before);
    }

    // Render action card
    const container = document.createElement('div');
    container.classList.add('message', 'ai-message');

    const card = document.createElement('div');
    card.classList.add('action-card');

    const title = document.createElement('div');
    title.classList.add('action-title');
    title.textContent = action.intent || 'Proposed Change';

    const summary = document.createElement('div');
    summary.classList.add('action-summary');
    summary.textContent = action.summary || '';

    const details = document.createElement('details');
    const summaryTag = document.createElement('summary');
    summaryTag.textContent = 'Show CLI';
    details.appendChild(summaryTag);
    const codeBlock = document.createElement('pre');
    codeBlock.classList.add('action-cli');
    const cmds = Array.isArray(action.commands) ? action.commands : [];
    codeBlock.textContent = cmds.join('\n');
    details.appendChild(codeBlock);

    const actionsRow = document.createElement('div');
    actionsRow.classList.add('action-buttons');

    const approveBtn = document.createElement('button');
    approveBtn.classList.add('btn-primary', 'action-approve');
    approveBtn.textContent = 'Approve & Flash';

    const spinner = document.createElement('div');
    spinner.classList.add('action-spinner', 'hidden');

    const statusText = document.createElement('div');
    statusText.classList.add('action-status');

    const undoBtn = document.createElement('button');
    undoBtn.classList.add('btn-secondary', 'action-undo', 'hidden');
    undoBtn.textContent = '↩️ Undo (Rollback)';

    actionsRow.appendChild(approveBtn);
    actionsRow.appendChild(spinner);
    actionsRow.appendChild(undoBtn);

    card.appendChild(title);
    card.appendChild(summary);
    card.appendChild(details);
    card.appendChild(actionsRow);
    card.appendChild(statusText);

    container.appendChild(card);
    chatContainer.appendChild(container);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Execution wiring
    const commands = cmds.map(c => String(c || '').trim()).filter(c => c.length > 0);

    approveBtn.addEventListener('click', async () => {
        if (commands.length === 0) {
            statusText.textContent = 'No CLI commands found in action.';
            return;
        }

        // Security validation
        const banned = ['resource', 'defaults', 'timer', 'dma', 'flash'];
        const allowedPrefixes = ['set', 'profile', 'rateprofile', 'save'];
        for (const cmd of commands) {
            const lower = cmd.toLowerCase();
            if (banned.some(b => lower.includes(b))) {
                statusText.textContent = 'Action rejected: contains unsafe or unsupported CLI commands.';
                return;
            }
            const firstWord = lower.split(/\s+/)[0];
            if (!allowedPrefixes.includes(firstWord)) {
                statusText.textContent = 'Action rejected: only set/profile/rateprofile/save commands are allowed.';
                return;
            }
        }

        // Snapshot
        const uniqueID = `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        card.dataset.executionId = uniqueID;
        if (!window.sessionHistory) window.sessionHistory = [];
        window.sessionHistory.push({
            id: uniqueID,
            timestamp: Date.now(),
            previousDump: droneState.cliDump || droneState.cliDiff || ''
        });

        approveBtn.disabled = true;
        spinner.classList.remove('hidden');
        statusText.textContent = 'Flashing changes...';

        await restoreCliData(commands.join('\n'));

        spinner.classList.add('hidden');
        statusText.textContent = '✅ Applied Successfully';
        approveBtn.classList.add('hidden');
        undoBtn.classList.remove('hidden');
    });

    undoBtn.addEventListener('click', async () => {
        const id = card.dataset.executionId;
        if (!id || !window.sessionHistory) {
            statusText.textContent = 'No rollback information available.';
            return;
        }
        const record = window.sessionHistory.find(r => r.id === id);
        if (!record || !record.previousDump) {
            statusText.textContent = 'No previous configuration snapshot found for rollback.';
            return;
        }

        undoBtn.disabled = true;
        spinner.classList.remove('hidden');
        statusText.textContent = 'Rolling back changes...';

        await restoreCliData(record.previousDump);

        spinner.classList.add('hidden');
        statusText.textContent = '⏪ Rollback Complete';
        undoBtn.classList.add('hidden');
    });
}

function updateAiStatus() {
    const key = getApiKey();
    if (key && key.length > 10) {
        aiStatusBadge.textContent = "Online";
        aiStatusBadge.style.color = "var(--status-success)";
        aiStatusBadge.style.background = "rgba(16,185,129,0.1)";
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.placeholder = "Ask Copilot a question...";
    } else {
        aiStatusBadge.textContent = "No API Key";
        aiStatusBadge.style.color = "var(--status-warning)";
        aiStatusBadge.style.background = "rgba(245,158,11,0.1)";
        chatInput.disabled = true;
        sendBtn.disabled = true;
        chatInput.placeholder = "Click the AI status badge to enter your API key";
    }
}
aiStatusBadge.addEventListener('click', promptForApiKey);

// ---------------------------------------------------------
// AI Copilot — Gemini API (Overhauled System Prompt)
// ---------------------------------------------------------
async function sendMessageToCopilot(userText) {
    const apiKey = getApiKey();
    if (!apiKey) { promptForApiKey(); return; }

    appendChatMessage('user', userText);
    chatInput.value = '';

    if (!droneState.cliDiff) {
        appendChatMessage('ai', "I am still syncing data from the flight controller. Please wait a moment.");
        return;
    }

    thinkingIndicator.classList.remove('hidden');
    chatInput.disabled = true;
    sendBtn.disabled = true;

    // Two-part payload: live telemetry JSON + raw CLI diff text
    const systemPrompt = `You are BeeFlight AI, the world's most helpful FPV drone configuration copilot. You have access to both live telemetry, a parsed dynamics snapshot, and the core configuration diff.

## PART 1: Live Telemetry (Real-time)
${JSON.stringify(droneState.live, null, 2)}

## PART 1b: Dynamics Snapshot (PIDs, Rates, Filters)
${JSON.stringify(droneState.dynamics || {}, null, 2)}

## PART 2: Configuration Diff (from CLI \`diff all\`)
\`\`\`
${droneState.cliDiff || '(Not yet synced — CLI diff has not been captured yet.)'}
\`\`\`

## RULES
- Provide clear, concise, beginner-friendly answers.
- Reference the live telemetry when discussing the drone's current state (armed, tilt, stick positions).
- Reference the configuration diff when discussing settings (PIDs, filters, UARTs, VTX, OSD).
- If the user asks to calibrate their voltage or amperage, use the provided CLI data to find their current scale. The formula for Betaflight voltage calibration is: New Scale = Old Scale * (Drone Reading / Multimeter Reading). Calculate the new scale, and generate the \`set vbat_scale = [NEW_VALUE]\` and \`save\` CLI commands for them.
- NEVER generate commands that arm motors without explicit safety warnings.
- If the CLI diff is not yet available, tell the user you can still help based on live telemetry but recommend they sync context first.
- BLACKBOX INTENTS: If the user selects 'Filter & Noise Diagnostics', generate CLI commands as usual but wrap them in an action JSON (see below). If they select 'General Flight & PIDs', generate the appropriate CLI commands in an action JSON. If they select 'Disable Logging', generate the appropriate CLI commands in an action JSON. Always remind them to erase their flash memory before a tuning flight.
- MOTOR DIAGNOSTICS: If a user asks why their drone flips instantly on takeoff, check their yaw_motors_reversed and mixer settings in the CLI dump. Explain that their physical props, physical motor spin direction, and the software yaw_motors_reversed toggle must all match exactly. Tell them to look at the 3D Motors visualizer tab to verify.
- OSD TEMPLATES: If the user clicks an OSD template button, generate the CLI commands to enable the relevant osd_..._pos elements based on their selected video system (Analog 30x16 vs HD 50x18) as an action JSON (see below).
- SYMPTOM-BASED TUNING: When the user describes tuning symptoms (e.g. hot motors, propwash on descent, bounce-back, sluggish feel), always base your advice on the parsed droneState.dynamics JSON.
- HOT MOTORS: For hot motors, always suggest lowering d_pitch and d_roll by about 10–15% from their current values. Also inspect dterm_lowpass_hz; if it is very high (e.g. > 150Hz) recommend reducing it modestly to reduce heat. Never suggest *increasing* any D-term when the symptom is hot motors.
- PROPWASH SHAKES: For propwash shakes on descent, suggest small increases to d_pitch and d_roll (within safe limits) and/or reducing filter delay (for example, modestly raising gyro_lowpass_hz or dterm_lowpass_hz within reasonable ranges), while still respecting the D-term safety rule below.
- CINEMATIC RATES: For cinematic feel, propose changes to rc_rate and rc_expo so the center stick is softer but full-stick authority is preserved, and output these as CLI commands inside an action JSON (see below), not as raw CLI text.
- SAFETY D-TERM LIMIT: Never increase any D-term value (d_roll, d_pitch, d_yaw) by more than 5 absolute points at a time. If the user's current D-term is already very high (e.g. above 50), recommend reductions instead of increases.

## ACTION FORMAT
When the user asks you to change a configuration setting (PIDs, rates, filters, VTX, Blackbox, OSD, etc.), you MUST respond with a structured JSON block wrapped in a fenced code block annotated as \`\`\`action (no other markdown). The JSON MUST have this shape:
{
  "intent": "<short human readable description of the change>",
  "summary": "<1-2 sentence explanation of what this change will do and why>",
  "commands": ["set ...", "set ...", "save"]
}
Do not include any additional fields. Do not wrap the JSON in markdown besides the single \`\`\`action fence. All CLI commands must be in the commands array only.`;

    try {
        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ parts: [{ text: userText }] }]
                })
            }
        );
        if (!resp.ok) throw new Error(`API ${resp.status}`);
        const data = await resp.json();
        const text = data.candidates[0].content.parts[0].text;
        renderAiResponse(text);
    } catch (err) {
        log.error('Gemini API call failed', err);
        logToConsole(`Gemini Error: ${err.message}`, 'error');
        appendChatMessage('ai', `Error reaching Gemini. Check console logs.`);
    } finally {
        thinkingIndicator.classList.add('hidden');
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

sendBtn.addEventListener('click', () => {
    const t = chatInput.value.trim();
    if (t) sendMessageToCopilot(t);
});
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const t = chatInput.value.trim();
        if (t) sendMessageToCopilot(t);
    }
});

// ---------------------------------------------------------
// MSP Send (uses mspProtocol.js)
// ---------------------------------------------------------
async function sendMspCommand(cmdId, data = []) {
    if (!writer || cliMode) return;
    try {
        await writer.write(MSP.encode(cmdId, data));
    } catch (err) {
        log.error(`MSP send failed cmd ${cmdId}`, err);
        logToConsole(`MSP send failed cmd ${cmdId}: ${err.message}`, 'error');
        // If writing fails, stop polling to prevent error spam
        stopPolling();
    }
}

// ---------------------------------------------------------
// MSP Frame Parser
// ---------------------------------------------------------
function parseMspFrame(cmd, payload) {
    switch (cmd) {
        case MSP.MSP_API_VERSION: {
            const v = MSP.parseApiVersion(payload);
            droneState.mspApiVersion = v.display;
            logToConsole(`API Version: ${v.display}`, 'success');
            break;
        }
        case MSP.MSP_FC_VARIANT: {
            droneState.firmwareIdentifier = MSP.parseFcVariant(payload);
            droneState.boardName = droneState.firmwareIdentifier;
            logToConsole(`FC Variant: ${droneState.firmwareIdentifier}`, 'success');
            break;
        }
        case MSP.MSP_FC_VERSION: {
            droneState.firmwareVersion = MSP.parseFcVersion(payload);
            logToConsole(`FC Version: ${droneState.firmwareVersion}`, 'success');
            break;
        }
        case MSP.MSP_STATUS: {
            const s = MSP.parseStatus(payload);
            droneState.live.status.armed = s.armed;
            droneState.live.status.cycleTime = s.cycleTime;
            droneState.live.status.cpuLoad = s.cpuLoad;
            break;
        }
        case MSP.MSP_PID: {
            const p = MSP.parsePid(payload);
            if (p) droneState.live.pids = p;
            break;
        }
        case MSP.MSP_ATTITUDE: {
            droneState.live.attitude = MSP.parseAttitude(payload);
            break;
        }
        case MSP.MSP_RC: {
            droneState.live.rc = MSP.parseRc(payload);
            break;
        }
        case MSP.MSP_ANALOG: {
            const a = MSP.parseAnalog(payload);
            if (a) droneState.live.analog = a;
            break;
        }
        default:
            break;
        case MSP.MSP_MOTOR_TELEMETRY: {
            const mt = MSP.parseMotorTelemetry(payload);
            if (mt) {
                droneState.live.rpm = mt.rpms;
                if (window.Drone3D) window.Drone3D.updateRPMs(mt.rpms);
            }
            break;
        }
    }
}

function processMspStream(chunk) {
    for (let i = 0; i < chunk.length; i++) mspBuffer.push(chunk[i]);

    while (mspBuffer.length >= 6) {
        const si = mspBuffer.findIndex((v, i) =>
            v === 36 && mspBuffer[i + 1] === 77 && mspBuffer[i + 2] === 62);
        if (si === -1) { mspBuffer = []; break; }
        if (si > 0) mspBuffer.splice(0, si);
        if (mspBuffer.length < 6) break;

        const size = mspBuffer[3], cmd = mspBuffer[4];
        const frameLen = 6 + size;
        if (mspBuffer.length < frameLen) break;

        const pl = mspBuffer.slice(5, 5 + size);
        const rxCrc = mspBuffer[5 + size];
        if (rxCrc === MSP.checksum(size, cmd, pl)) {
            parseMspFrame(cmd, pl);
        }
        mspBuffer.splice(0, frameLen);
    }
}

// ---------------------------------------------------------
// MSP Polling Loop (~100ms)
// ---------------------------------------------------------
function startPolling() {
    if (pollingInterval) return;
    isPolling = true;
    startUiUpdateLoop();
    pollingInterval = setInterval(async () => {
        if (!isPolling || cliMode || !writer) return;
        try {
            await sendMspCommand(MSP.MSP_STATUS);
            await sendMspCommand(MSP.MSP_ANALOG);
            await sendMspCommand(MSP.MSP_ATTITUDE);
            await sendMspCommand(MSP.MSP_RC);
            await sendMspCommand(MSP.MSP_MOTOR_TELEMETRY);
        } catch (e) {
            // Silently swallow — sendMspCommand handles logging
        }
    }, 100);
    logToConsole('MSP polling started (100ms)', 'success');
}

function stopPolling() {
    stopUiUpdateLoop();
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    isPolling = false;
    logToConsole('MSP polling stopped', 'info');
}

// ---------------------------------------------------------
// CLI Scraper — The Hybrid Hack
// ---------------------------------------------------------
async function sendCliText(text) {
    if (!writer) return;
    const encoder = new TextEncoder();
    try {
        await writer.write(encoder.encode(text + '\n'));
    } catch (err) {
        log.error(`CLI write error`, err);
        logToConsole(`CLI write error: ${err.message}`, 'error');
    }
}

async function injectAIContext() {
    if (!droneState.connected) return;

    logToConsole('Pausing MSP polling for CLI context sync...', 'info');
    syncOverlay.classList.remove('hidden');

    // 1. Stop polling immediately (clears interval)
    stopPolling();
    cliMode = true;

    // 2. Wait for any in-flight writes to finish
    await sleep(300);

    // 3. Release the writer so we can re-acquire it for CLI text
    if (writer) {
        try { writer.releaseLock(); } catch (e) { }
        writer = null;
    }

    // 4. Release the MSP reader
    if (reader) {
        try { await reader.cancel(); } catch (e) { }
        try { reader.releaseLock(); } catch (e) { }
        reader = null;
    }

    await sleep(200);

    // 5. Re-acquire writer for CLI text
    let cliWriter = null;
    try {
        cliWriter = port.writable.getWriter();
    } catch (err) {
        log.error('Cannot get CLI writer', err);
        logToConsole(`Cannot get CLI writer: ${err.message}`, 'error');
        cliMode = false;
        syncOverlay.classList.add('hidden');
        // Try to recover MSP mode
        writer = port.writable.getWriter();
        startMspReadLoop();
        startPolling();
        return;
    }

    try {
        const encoder = new TextEncoder();

        // Enter CLI mode
        await cliWriter.write(encoder.encode('#\n'));
        await sleep(500);

        // Send `diff all`
        await cliWriter.write(encoder.encode('diff all\n'));

        // Capture CLI output for up to 5 seconds
        let cliOutput = '';
        const cliReader = port.readable.getReader();
        const decoder = new TextDecoder();
        const deadline = Date.now() + 5000;

        try {
            while (Date.now() < deadline) {
                const readPromise = cliReader.read();
                const timeoutPromise = sleep(200).then(() => ({ value: null, done: false, timeout: true }));
                const result = await Promise.race([readPromise, timeoutPromise]);
                if (result.done) break;
                if (result.value) {
                    const text = decoder.decode(result.value);
                    cliOutput += text;
                    if (cliOutput.length > 50 && cliOutput.trimEnd().endsWith('#')) break;
                }
            }
        } finally {
            cliReader.releaseLock();
        }

        // Store the raw output
        droneState.cliDiff = cliOutput.trim();
        droneState.cliDump = droneState.cliDiff;
        logToConsole(`CLI diff captured (${droneState.cliDiff.length} chars)`, 'success');

        // Exit CLI mode
        await cliWriter.write(encoder.encode('exit\n'));
        // Betaflight FC resets its serial interface after CLI exit.
        // We must wait long enough for it to stabilize before resuming MSP.
        logToConsole('Waiting for FC serial reset after CLI exit...', 'info');
        await sleep(1500);

    } catch (err) {
        log.error('CLI scrape error', err);
        logToConsole(`CLI scrape error: ${err.message}`, 'error');
    } finally {
        // Release CLI writer
        try { cliWriter.releaseLock(); } catch (e) { }
    }

    // 6. Resume MSP mode — retry with backoff since FC may still be resetting
    cliMode = false;
    syncOverlay.classList.add('hidden');
    mspBuffer = [];

    let resumed = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            writer = port.writable.getWriter();
            startMspReadLoop();
            startPolling();
            logToConsole('MSP polling resumed after CLI sync', 'success');
            resumed = true;
            break;
        } catch (err) {
            log.warn(`Resume attempt ${attempt}/5 failed: ${err.message}`);
            if (writer) { try { writer.releaseLock(); } catch (e) { } writer = null; }
            await sleep(500 * attempt); // Exponential backoff: 500, 1000, 1500...
        }
    }
    if (!resumed) {
        log.error('Failed to resume MSP after CLI — all retry attempts exhausted');
        logToConsole('Failed to resume MSP after CLI. Try reconnecting.', 'error');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------
// Serial Read Loop
// ---------------------------------------------------------
async function startMspReadLoop() {
    while (port.readable && droneState.connected && !cliMode) {
        reader = port.readable.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value && !cliMode) processMspStream(value);
            }
        } catch (e) {
            if (!cliMode) logToConsole(`Read error: ${e.message}`, 'error');
        } finally {
            reader.releaseLock();
            reader = null;
        }
    }
}

// ---------------------------------------------------------
// Drone Initialization (MSP only — CLI diff already captured)
// ---------------------------------------------------------
async function initializeDrone() {
    logToConsole('Initializing drone (MSP)...', 'info');

    // Give the FC time to be ready for MSP after port reopen
    await sleep(500);
    log.info('Sending MSP init commands...');

    // Fetch firmware metadata with adequate response time
    await sendMspCommand(MSP.MSP_API_VERSION);
    await sleep(250);
    await sendMspCommand(MSP.MSP_FC_VARIANT);
    await sleep(250);
    await sendMspCommand(MSP.MSP_FC_VERSION);
    await sleep(250);
    await sendMspCommand(MSP.MSP_PID);
    await sleep(250);
    await sendMspCommand(MSP.MSP_STATUS);
    await sleep(500);

    logToConsole('Init commands sent. Starting live polling...', 'info');
    startPolling();
    syncOverlay.classList.add('hidden'); // Ensure overlay is hidden once live data starts

    // Greet with context summary
    await sleep(500);
    appendChatMessage('ai',
        `Connected to ${droneState.firmwareIdentifier} v${droneState.firmwareVersion}! ` +
        (droneState.cliDiff
            ? `I have your full config diff (${droneState.cliDiff.length} chars). Ask me anything — PIDs, filters, rates, UARTs — BeeFlight AI has the full picture.`
            : `Live telemetry is active. Ask me anything!`)
    );

    // Render the Config Tabs from CLI data
    if (droneState.cliDiff && window.CliParser) {
        renderPortsTab();
        renderModesTab();
        renderPowerTab();
        renderPidTab();
        renderVtxTab();
        renderBlackboxTab();
        renderMotorsTab();
        renderOsdTab();
    }
}

// ---------------------------------------------------------
// CLI Diff Capture (runs BEFORE MSP, on its own port session)
// ---------------------------------------------------------
async function captureCliDiff() {
    logToConsole('Capturing CLI diff before MSP init...', 'info');
    syncOverlay.classList.remove('hidden');

    const cliWriter = port.writable.getWriter();
    const encoder = new TextEncoder();

    try {
        // Enter CLI mode
        await cliWriter.write(encoder.encode('#\n'));
        await sleep(500);

        // Send diff all
        await cliWriter.write(encoder.encode('diff all\n'));

        // Read CLI output
        let cliOutput = '';
        const cliReader = port.readable.getReader();
        const decoder = new TextDecoder();
        const deadline = Date.now() + 10000; // Give diff all up to 10s to stream

        log.info('Starting CLI stream read loop...');
        try {
            while (Date.now() < deadline) {
                const readPromise = cliReader.read();
                const timeoutPromise = sleep(500).then(() => ({ value: null, done: false, timeout: true }));
                const result = await Promise.race([readPromise, timeoutPromise]);

                if (result.done) {
                    log.info('CLI stream EOF reached');
                    break;
                }
                if (result.value) {
                    const chunk = decoder.decode(result.value);
                    cliOutput += chunk;
                    log.info(`CLI Chunk received (${chunk.length} chars). Total length: ${cliOutput.length}`);

                    // Betaflight CLI returns to '#' when a command finishes
                    // Make sure we have enough data (not just the echo) before breaking
                    if (cliOutput.length > 250 && cliOutput.includes('diff') && cliOutput.trimEnd().endsWith('#')) {
                        log.info("Found closing '#' prompt. Diff capture complete.");
                        break;
                    }
                }
            }
        } finally {
            try { await cliReader.cancel(); } catch (e) { }
            cliReader.releaseLock();
        }

        droneState.cliDiff = cliOutput.trim();
        droneState.cliDump = droneState.cliDiff;
        log.info(`CLI capture finished. Final length: ${droneState.cliDiff.length}`);
        logToConsole(`CLI diff captured (${droneState.cliDiff.length} chars)`, 'success');

        // CRITICAL: Exit CLI mode so FC returns to MSP mode before we close the port.
        // Without this, the FC stays in CLI and ignores all MSP commands on reopen.
        await cliWriter.write(encoder.encode('exit\n'));
        log.info('Sent CLI exit command');
        await sleep(200);

    } catch (err) {
        log.error('CLI diff capture error', err);
        logToConsole(`CLI diff error: ${err.message}`, 'error');
        // Try to exit CLI even on error
        try {
            await cliWriter.write(encoder.encode('exit\n'));
        } catch (e) { }
    } finally {
        cliWriter.releaseLock();
    }
    // Note: syncOverlay remains visible during the USB reboot phase
}

// ---------------------------------------------------------
// Web Serial Connection (Two-phase: CLI first, then MSP)
// ---------------------------------------------------------

navigator.serial.addEventListener('disconnect', (event) => {
    if (event.target === port || !port) {
        log.info('USB Disconnect event: FC dropped connection');
        if (!isReconnectingAfterCli) {
            logToConsole('Drone disconnected.', 'error');
        }
        droneState.connected = false;
        connectionStatus.textContent = "Disconnected";
        connectionStatus.classList.remove("connected");
        stopPolling();
        // Clear session history on disconnect to prevent cross-drone rollbacks
        if (window.sessionHistory) window.sessionHistory = [];
    }
});

navigator.serial.addEventListener('connect', async (event) => {
    log.info('USB Connect event: FC re-enumerated');
    if (isReconnectingAfterCli) {
        isReconnectingAfterCli = false;
        port = event.target;
        logToConsole('FC reboot completed. Starting MSP...', 'success');

        try {
            await port.open({ baudRate: 115200 });
            droneState.connected = true;
            connectionStatus.textContent = "Connected";
            connectionStatus.classList.add("connected");

            writer = port.writable.getWriter();
            startMspReadLoop();
            await initializeDrone();
        } catch (err) {
            log.error('Failed to start MSP session on reconnect', err);
            logToConsole(`MSP init failed: ${err.message}`, 'error');
            syncOverlay.classList.add('hidden');
        }
    }
});

async function connectToDrone() {
    if (!('serial' in navigator)) {
        logToConsole('Web Serial API not supported.', 'error');
        return;
    }
    try {
        port = await navigator.serial.requestPort();
    } catch (err) {
        log.error('Serial port request cancelled', err);
        logToConsole('Connection cancelled.', 'error');
        return;
    }

    // Clear session history for a new connection session
    if (window.sessionHistory) window.sessionHistory = [];

    // ---- PHASE A: Open port, capture CLI diff ----
    try {
        await port.open({ baudRate: 115200 });
        logToConsole('Serial port opened. Initiating CLI diff...', 'success');
        showDashboard();

        await captureCliDiff();

        // The FC resets its USB when leaving CLI. We close the Web Serial port
        // so Windows can cleanly re-enumerate it. The 'connect' event will handle Phase B.
        await port.close();
        isReconnectingAfterCli = true;
        logToConsole('Waiting for FC to reboot... Do not unplug.', 'info');

        // Fallback if re-enumeration fails or takes too long (10 seconds)
        setTimeout(() => {
            if (isReconnectingAfterCli) {
                isReconnectingAfterCli = false;
                log.error('Reconnect timeout exceeded');
                logToConsole('Reconnect timeout. Please click Connect manually.', 'error');
                syncOverlay.classList.add('hidden');
            }
        }, 10000);

    } catch (err) {
        log.error('CLI phase failed', err);
        logToConsole(`CLI phase error: ${err.message}`, 'error');
        isReconnectingAfterCli = false;
        try { await port.close(); } catch (e) { }
        syncOverlay.classList.add('hidden');
    }
}

connectBtn.addEventListener('click', async () => {
    if (!droneState.connected) await connectToDrone();
});

// ---- Settings Modal Wiring ----
const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const debugToggle = document.getElementById('debugToggle');
const downloadLogBtn = document.getElementById('downloadLogBtn');

// Sync toggle with current state
debugToggle.checked = log.isEnabled();

settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    // Pre-fill the API key input (masked)
    const apiInput = document.getElementById('apiKeyInput');
    if (apiInput) apiInput.value = getApiKey();
});
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// API Key save
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', () => {
        const apiInput = document.getElementById('apiKeyInput');
        if (apiInput && apiInput.value.trim()) {
            setApiKey(apiInput.value.trim());
            updateAiStatus();
            logToConsole('Gemini API key saved to sessionStorage.', 'success');
            appendChatMessage('ai', 'API key saved! I\'m online now. Ask me anything about your drone.');
        }
    });
}

// Integration settings save handlers
if (saveGoogleClientIdBtn && googleClientIdInput) {
    saveGoogleClientIdBtn.addEventListener('click', () => {
        setGoogleClientId(googleClientIdInput.value.trim());
        updateIntegrationStatusUI();
        showToast('Google Client ID saved locally.', 'success');
    });
}

if (saveGithubPatBtn && githubPatInput && githubPublicDefaultToggle) {
    saveGithubPatBtn.addEventListener('click', () => {
        setGithubPat(githubPatInput.value.trim());
        setGithubPublicDefault(!!githubPublicDefaultToggle.checked);
        updateIntegrationStatusUI();
        showToast('GitHub token preferences saved locally.', 'success');
    });
}

debugToggle.addEventListener('change', () => {
    log.setEnabled(debugToggle.checked);
    logToConsole(`Debug logging ${debugToggle.checked ? 'enabled' : 'disabled'}`, 'info');
});

downloadLogBtn.addEventListener('click', () => log.download());

// ---- Sidebar Menu Tabs (Phase 5) ----
const sidebarItems = document.querySelectorAll('.sidebar-menu li');
const tabViews = document.querySelectorAll('.tab-view');

sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all items and views
        sidebarItems.forEach(i => i.classList.remove('active'));
        tabViews.forEach(v => v.classList.remove('active'));

        // Add active class to clicked item
        item.classList.add('active');

        // Find corresponding view and make it active
        const viewId = item.getAttribute('data-view');
        const viewElement = document.getElementById(viewId);
        if (viewElement) viewElement.classList.add('active');
    });
});

// ---- Backup Tab Button Wiring ----
if (btnExportLocal) {
    btnExportLocal.addEventListener('click', () => {
        exportLocalBackup();
    });
}
if (btnExportDrive) {
    btnExportDrive.addEventListener('click', () => {
        const fileName = buildBackupFileName();
        const content = getBackupContent();
        saveToGoogleDrive(fileName, content);
    });
}
if (btnExportGist) {
    btnExportGist.addEventListener('click', () => {
        const fileName = buildBackupFileName();
        const content = getBackupContent();
        publishToGitHub(fileName, content);
    });
}

// ---- Restore/Import Wiring ----
if (btnSelectImportFile && importFileInput) {
    btnSelectImportFile.addEventListener('click', () => {
        importFileInput.click();
    });
}

if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
            resetImportUI();
            return;
        }

        setImportAnalyzingState();

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const text = String(ev.target?.result || '');
            importFileText = text;

            const lines = text.split(/\r?\n/);
            const headerSnippet = lines.slice(0, 60).join('\n');
            const tailSnippet = lines.slice(-10).join('\n');

            const context = {
                headerSnippet,
                tailSnippet,
                liveBoard: droneState.boardName || droneState.firmwareIdentifier || 'Unknown',
                liveVersion: droneState.firmwareVersion || 'Unknown',
                fileApproxLines: lines.length
            };

            const result = await validateBackupWithAi(context);
            if (!result) {
                resetImportUI();
                return;
            }

            lastImportValidation = result;

            if (restoreStateAnalyzing) restoreStateAnalyzing.classList.add('hidden');
            if (restoreStateChecklist) restoreStateChecklist.classList.remove('hidden');

            const mapping = [
                { key: 'hardwareMatch', icon: chkHardwareIcon },
                { key: 'versionMatch', icon: chkVersionIcon },
                { key: 'fileIntegrity', icon: chkIntegrityIcon },
                { key: 'motorSafety', icon: chkMotorIcon }
            ];
            let allPass = true;
            mapping.forEach(({ key, icon }) => {
                const pass = !!result[key];
                if (!pass) allPass = false;
                if (!icon) return;
                icon.textContent = pass ? '✅' : '❌';
                icon.classList.remove('pass', 'fail');
                icon.classList.add(pass ? 'pass' : 'fail');
            });

            if (importErrorBox) {
                if (!allPass) {
                    importErrorBox.textContent = result.reasoning || 'One or more checks failed. Restore is blocked.';
                    importErrorBox.classList.remove('hidden');
                } else {
                    importErrorBox.textContent = '';
                    importErrorBox.classList.add('hidden');
                }
            }

            if (btnFlashDrone) {
                btnFlashDrone.disabled = !allPass;
            }

            if (restoreStateUpload) restoreStateUpload.classList.add('hidden');
        };
        reader.onerror = () => {
            logToConsole('Failed to read backup file.', 'error');
            showToast('Failed to read backup file.', 'error');
            resetImportUI();
        };
        reader.readAsText(file);
    });
}

if (btnCancelImport) {
    btnCancelImport.addEventListener('click', () => {
        resetImportUI();
    });
}

if (btnFlashDrone) {
    btnFlashDrone.addEventListener('click', () => {
        if (!importFileText) {
            showToast('No backup file loaded.', 'error');
            return;
        }
        btnFlashDrone.disabled = true;
        if (importProgressContainer) importProgressContainer.classList.remove('hidden');
        updateImportProgress(0);
        restoreCliData(importFileText);
    });
}

// ---- Init ----
updateAiStatus();
log.info('BeeFlight AI System initialized. Awaiting connection...');
logToConsole('BeeFlight AI System initialized. Awaiting connection...', 'info');
// Prefill integration fields from storage
if (googleClientIdInput) googleClientIdInput.value = getGoogleClientId();
if (githubPublicDefaultToggle) githubPublicDefaultToggle.checked = getGithubPublicDefault();
updateIntegrationStatusUI();
// ---------------------------------------------------------
// Ports Tab Rendering
// ---------------------------------------------------------
function renderPortsTab() {
    const portsList = document.getElementById('portsList');
    if (!portsList) return;

    // Clear placeholder
    portsList.innerHTML = '';

    const portsData = window.CliParser.parsePorts(droneState.cliDiff);

    if (!portsData || portsData.length === 0) {
        portsList.innerHTML = '<li class="port-item placeholder">No serial ports found in CLI data.</li>';
        return;
    }

    portsData.forEach(port => {
        const li = document.createElement('li');
        li.className = 'port-item';

        let nameHtml = `<span class="port-name">${port.portName}</span>`;
        if (port.isUsbVcp) {
            nameHtml = `<span class="port-name">${port.portName} <span class="port-vcp-icon" title="Active Configurator Connection">🔒</span></span>`;
        }

        const badgeHtml = `<span class="job-badge ${port.jobClass}">${port.activeJob}</span>`;

        li.innerHTML = `${nameHtml}${badgeHtml}`;
        portsList.appendChild(li);
    });
}

// ---------------------------------------------------------
// Modes Tab Rendering
// ---------------------------------------------------------
// Store parsed modes globally so the hot loop can access them
window.parsedModes = [];

function renderModesTab() {
    const modesGrid = document.getElementById('modesGrid');
    if (!modesGrid) return;

    // Clear placeholder
    modesGrid.innerHTML = '';

    window.parsedModes = window.CliParser.parseModes(droneState.cliDiff);

    if (!window.parsedModes || window.parsedModes.length === 0) {
        modesGrid.innerHTML = `<div class="mode-item placeholder" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                                No modes configured. Ask the AI Copilot to set up your Arm and Flight Mode switches.
                               </div>`;
        return;
    }

    window.parsedModes.forEach(mode => {
        const card = document.createElement('div');
        // mode.modeId = 0 is ARM
        card.className = `mode-card ${mode.modeId === 0 ? 'mode-arm' : ''}`;
        card.id = `modeCard-${mode.modeId}`;

        const nameEl = document.createElement('div');
        nameEl.className = 'mode-name';
        nameEl.textContent = mode.modeName;

        const chanEl = document.createElement('div');
        chanEl.className = 'mode-channel';
        chanEl.textContent = `Switch: ${mode.channelName}`;

        card.appendChild(nameEl);
        card.appendChild(chanEl);
        modesGrid.appendChild(card);
    });
}

// ---------------------------------------------------------
// Power Tab Rendering
// ---------------------------------------------------------
function renderPowerTab() {
    const pcfg = window.CliParser.parsePowerConfig(droneState.cliDiff);
    if (!pcfg) return;

    // Inject static properties to DOM
    if (document.getElementById('valVbatMax')) document.getElementById('valVbatMax').textContent = pcfg.vbatMax.toFixed(2) + ' V';
    if (document.getElementById('valVbatWarn')) document.getElementById('valVbatWarn').textContent = pcfg.vbatWarn.toFixed(2) + ' V';
    if (document.getElementById('valVbatMin')) document.getElementById('valVbatMin').textContent = pcfg.vbatMin.toFixed(2) + ' V';

    if (document.getElementById('valVbatScale')) document.getElementById('valVbatScale').textContent = pcfg.vbatScale;
    if (document.getElementById('valVbatDivider')) document.getElementById('valVbatDivider').textContent = pcfg.vbatDivider;
    if (document.getElementById('valVbatMultiplier')) document.getElementById('valVbatMultiplier').textContent = pcfg.vbatMultiplier;

    if (document.getElementById('valIbataScale')) document.getElementById('valIbataScale').textContent = pcfg.ibataScale;
    if (document.getElementById('valIbataOffset')) document.getElementById('valIbataOffset').textContent = pcfg.ibataOffset;
}

// ---------------------------------------------------------
// Backup Tab — Export routing
// ---------------------------------------------------------
function buildBackupFileName() {
    const boardName = droneState.firmwareIdentifier || 'Betaflight';
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `Betaflight_Backup_${boardName}_${yyyy}-${mm}-${dd}.txt`;
}

function getBackupContent() {
    return droneState.cliDiff || '# No CLI diff captured yet.\n';
}

function exportLocalBackup() {
    const fileName = buildBackupFileName();
    const content = getBackupContent();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Configuration downloaded as text file.', 'success');
}

async function ensureGoogleDriveAuth() {
    const clientId = getGoogleClientId();
    if (!clientId) {
        alert('Google Drive Client ID is not configured. Open Settings → Integrations to add it.');
        return false;
    }
    if (typeof gapi === 'undefined') {
        alert('Google API client (gapi) failed to load. Check your network or script settings.');
        return false;
    }

    if (!gapi.auth2 || !gapi.auth2.getAuthInstance) {
        await new Promise((resolve, reject) => {
            gapi.load('client:auth2', {
                callback: resolve,
                onerror: () => reject(new Error('Failed to load gapi client/auth2'))
            });
        });
        await gapi.client.init({
            clientId,
            scope: 'https://www.googleapis.com/auth/drive.file'
        });
    }

    const auth = gapi.auth2.getAuthInstance();
    if (!auth) {
        alert('Google auth instance failed to initialize.');
        return false;
    }
    if (!auth.isSignedIn.get()) {
        await auth.signIn();
    }
    googleDriveAuthed = true;
    updateIntegrationStatusUI();
    return true;
}

async function saveToGoogleDrive(fileName, fileContent) {
    const ok = await ensureGoogleDriveAuth();
    if (!ok) return;

    const metadata = {
        name: fileName,
        mimeType: 'text/plain'
    };
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
        fileContent +
        closeDelimiter;

    try {
        const resp = await gapi.client.request({
            path: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            method: 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body
        });
        if (resp && resp.result && resp.result.id) {
            showToast('Backup saved to Google Drive.', 'success');
        } else {
            showToast('Google Drive export completed, but response was unexpected.', 'info');
        }
    } catch (err) {
        log.error('Google Drive export failed', err);
        showToast('Failed to save to Google Drive. See System Logs.', 'error');
    }
}

async function publishToGitHub(fileName, fileContent) {
    const pat = getGithubPat();
    if (!pat) {
        alert('GitHub Personal Access Token is not configured. Open Settings → Integrations to add it.');
        return;
    }

    const makePublic = getGithubPublicDefault();

    const payload = {
        description: `Betaflight backup: ${fileName}`,
        public: makePublic,
        files: {}
    };
    payload.files[fileName] = { content: fileContent };

    try {
        const resp = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `token ${pat}`
            },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            const text = await resp.text();
            log.error('GitHub Gist error', text);
            showToast('GitHub Gist export failed. See System Logs.', 'error');
            return;
        }
        const data = await resp.json();
        const url = data.html_url || '';
        showToast('Backup published to GitHub Gist.', 'success', url || null);
    } catch (err) {
        log.error('GitHub Gist export failed', err);
        showToast('GitHub Gist export failed. See System Logs.', 'error');
    }
}

async function validateBackupWithAi(context) {
    const apiKey = getApiKey();
    if (!apiKey) {
        promptForApiKey();
        return null;
    }

    const systemPrompt = `You are a Betaflight Safety Inspector. Compare the uploaded file snippet to the live drone state.
You MUST return a strict JSON object with these keys:
- hardwareMatch: boolean (does board_name match the live board?)
- versionMatch: boolean (does the Betaflight major/minor version match the live firmware?)
- fileIntegrity: boolean (does this look like a valid Betaflight dump, with headers and a terminating save command?)
- motorSafety: boolean (is the configured motor protocol a DSHOT variant, indicating safe digital throttle signaling?)
- reasoning: string (short explanation of any failures or risks).

Rules:
- Output ONLY raw JSON, no markdown and no extra commentary.
- If you are uncertain about any key, set it to false and explain why in the reasoning string.`;

    try {
        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ parts: [{ text: JSON.stringify(context) }] }]
                })
            }
        );
        if (!resp.ok) throw new Error(`API ${resp.status}`);
        const data = await resp.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!raw) throw new Error('Empty validation response from AI');
        try {
            return JSON.parse(raw);
        } catch (e) {
            log.error('Backup validation JSON parse error', raw);
            throw new Error('AI did not return valid JSON');
        }
    } catch (err) {
        log.error('Backup AI validation failed', err);
        showToast('Backup validation failed. See System Logs.', 'error');
        return null;
    }
}

async function restoreCliData(fullText) {
    if (!port) {
        logToConsole('Cannot restore configuration — not connected to a flight controller.', 'error');
        showToast('Connect to your drone before restoring a backup.', 'error');
        return;
    }

    const lines = fullText.split(/\r?\n/).map(l => l.trim());
    const payloadLines = lines.filter(l => l.length > 0 && !l.startsWith('#'));
    if (payloadLines.length === 0) {
        showToast('Backup file appears to be empty.', 'error');
        return;
    }

    logToConsole(`Starting CLI restore (${payloadLines.length} lines)...`, 'info');
    showToast('Restoring configuration. Do not unplug the drone.', 'info');

    // Pause MSP polling and enter CLI mode
    stopPolling();
    cliMode = true;
    await sleep(300);

    if (writer) {
        try { writer.releaseLock(); } catch (e) { }
        writer = null;
    }
    if (reader) {
        try { await reader.cancel(); } catch (e) { }
        try { reader.releaseLock(); } catch (e) { }
        reader = null;
    }

    const encoder = new TextEncoder();
    let cliWriter = null;
    try {
        cliWriter = port.writable.getWriter();

        // Enter CLI
        await cliWriter.write(encoder.encode('#\n'));
        await sleep(500);

        const totalSteps = payloadLines.length + 1; // including save
        let sent = 0;

        for (let i = 0; i < payloadLines.length; i++) {
            const line = payloadLines[i];
            await cliWriter.write(encoder.encode(line + '\n'));
            sent++;
            const pct = Math.round((sent / totalSteps) * 100);
            updateImportProgress(pct);
            await sleep(30);
        }

        // Final save
        await cliWriter.write(encoder.encode('save\n'));
        updateImportProgress(100);
        logToConsole('Restore complete. FC is rebooting after save.', 'success');
        showToast('Restore complete. Flight controller is rebooting. Reconnect to refresh state.', 'success');
    } catch (err) {
        log.error('CLI restore error', err);
        logToConsole(`CLI restore error: ${err.message}`, 'error');
        showToast('Restore failed. See System Logs.', 'error');
    } finally {
        try {
            if (cliWriter) cliWriter.releaseLock();
        } catch (e) { }
        cliMode = false;
    }
}

// ---------------------------------------------------------
// PID Tuning & Rates Tab Rendering
// ---------------------------------------------------------
function renderPidTab() {
    if (!window.CliParser || !droneState.cliDiff) return;

    const dyn = window.CliParser.parseDynamics(droneState.cliDiff);
    if (!dyn) return;

    droneState.dynamics = dyn;

    const pidProfileEl = document.getElementById('pidProfileValue');
    const rateProfileEl = document.getElementById('rateProfileValue');
    if (pidProfileEl) pidProfileEl.textContent = String(dyn.profile);
    if (rateProfileEl) rateProfileEl.textContent = String(dyn.rateProfile);

    // Rates table
    const rateAxes = ['roll', 'pitch', 'yaw'];
    rateAxes.forEach(axis => {
        const rates = dyn.rates[axis];
        if (!rates) return;
        const prefix = axis.charAt(0).toUpperCase() + axis.slice(1);
        const rcRateEl = document.getElementById(`pid${prefix}RcRate`);
        const superRateEl = document.getElementById(`pid${prefix}SuperRate`);
        const expoEl = document.getElementById(`pid${prefix}Expo`);
        if (rcRateEl) rcRateEl.textContent = rates.rcRate !== null ? String(rates.rcRate) : '—';
        if (superRateEl) superRateEl.textContent = rates.superRate !== null ? String(rates.superRate) : '—';
        if (expoEl) expoEl.textContent = rates.expo !== null ? String(rates.expo) : '—';
    });

    // PID table
    const pidAxes = ['roll', 'pitch', 'yaw'];
    pidAxes.forEach(axis => {
        const pid = dyn.pids[axis];
        if (!pid) return;
        const Prefix = axis.charAt(0).toUpperCase() + axis.slice(1);
        const pEl = document.getElementById(`pid${Prefix}P`);
        const iEl = document.getElementById(`pid${Prefix}I`);
        const dEl = document.getElementById(`pid${Prefix}D`);
        const fEl = document.getElementById(`pid${Prefix}F`);
        if (pEl) pEl.textContent = pid.p !== null ? String(pid.p) : '—';
        if (iEl) iEl.textContent = pid.i !== null ? String(pid.i) : '—';
        if (dEl) dEl.textContent = pid.d !== null ? String(pid.d) : '—';
        if (fEl) fEl.textContent = pid.f !== null ? String(pid.f) : '—';
    });

    // Rates chart (simple Bezier curve based on expo)
    const canvas = document.getElementById('ratesChart');
    if (canvas && canvas.getContext) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width || canvas.clientWidth || 400;
        const height = canvas.height || 200;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // Background
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height - 1);
        ctx.lineTo(width, height - 1);
        ctx.moveTo(1, 0);
        ctx.lineTo(1, height);
        ctx.stroke();

        // Use pitch expo as representative
        const expo = dyn.rates.pitch && typeof dyn.rates.pitch.expo === 'number' ? dyn.rates.pitch.expo : 0;
        const expoNorm = Math.max(0, Math.min(1, expo));

        // Control points for Bezier (0,0) to (1,1) shaped by expo
        const p0 = { x: 0, y: height };
        const p3 = { x: width, y: 0 };
        const p1 = { x: width * 0.3, y: height * (1 - 0.6 * expoNorm) };
        const p2 = { x: width * 0.7, y: height * (0.4 + 0.4 * expoNorm) };

        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);

        const steps = 40;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x =
                Math.pow(1 - t, 3) * p0.x +
                3 * Math.pow(1 - t, 2) * t * p1.x +
                3 * (1 - t) * Math.pow(t, 2) * p2.x +
                Math.pow(t, 3) * p3.x;
            const y =
                Math.pow(1 - t, 3) * p0.y +
                3 * Math.pow(1 - t, 2) * t * p1.y +
                3 * (1 - t) * Math.pow(t, 2) * p2.y +
                Math.pow(t, 3) * p3.y;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Symptom badges wiring
    document.querySelectorAll('.symptom-badge').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.getAttribute('data-symptom-prompt');
            if (!prompt || !chatInput) return;
            chatInput.value = prompt;
            chatInput.focus();
        });
    });

    // Template buttons wiring (prompt only, AI will turn into CLI)
    document.querySelectorAll('.pid-template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const template = btn.getAttribute('data-template');
            if (!template || !chatInput) return;
            let text = '';
            if (template === 'cinematic') {
                text = 'I want cinematic, smooth rates with softer center stick and reduced max rotation speed. Please suggest safe RC rate and expo changes for all axes and give me the CLI commands.';
            } else if (template === 'race') {
                text = 'I want aggressive race rates with fast roll and pitch but still controllable around center. Please suggest safe RC rate, super rate, and expo values and give me the CLI commands.';
            }
            if (text) {
                chatInput.value = text;
                chatInput.focus();
            }
        });
    });
}

// ---------------------------------------------------------
// Blackbox Tab Rendering
// ---------------------------------------------------------
function renderBlackboxTab() {
    const bbcfg = window.CliParser.parseBlackboxConfig(droneState.cliDiff);
    if (!bbcfg) return;

    const deviceEl = document.getElementById('valBboxDevice');
    const rateEl = document.getElementById('valBboxRate');
    if (deviceEl) deviceEl.textContent = bbcfg.device;
    if (rateEl) rateEl.textContent = `${bbcfg.sampleRate} / ${bbcfg.debugMode}`;

    // Intent Card Click Handlers
    document.querySelectorAll('.intent-card').forEach(card => {
        card.addEventListener('click', () => {
            // Visual selection
            document.querySelectorAll('.intent-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');

            const intent = card.dataset.intent;
            let message = '';
            if (intent === 'general') {
                message = 'I want to set my Blackbox to General Flight & PID logging mode. Please give me the CLI commands.';
            } else if (intent === 'filters') {
                message = 'I want to set my Blackbox to Filter & Noise Diagnostics mode (GYRO_SCALED, max sample rate). Please give me the CLI commands.';
            } else if (intent === 'disable') {
                message = 'I want to disable Blackbox logging entirely to save storage. Please give me the CLI commands.';
            }
            if (message) sendMessageToCopilot(message);
        });
    });

    // Mount MSC button
    const mscBtn = document.getElementById('btnMountMsc');
    if (mscBtn) {
        mscBtn.addEventListener('click', () => triggerMassStorage());
    }

    // Erase Flash button
    const eraseBtn = document.getElementById('btnEraseFlash');
    if (eraseBtn) {
        eraseBtn.addEventListener('click', () => {
            sendMessageToCopilot('I want to erase my Blackbox flash storage. Please give me the CLI command and warn me about data loss.');
        });
    }
}

// ---------------------------------------------------------
// Mass Storage Controller Trigger
// ---------------------------------------------------------
async function triggerMassStorage() {
    if (!droneState.connected || !port) {
        logToConsole('Cannot mount MSC — not connected.', 'error');
        return;
    }

    logToConsole('Sending MSC command — FC will reboot into USB Mass Storage mode...', 'info');

    try {
        // Stop polling and enter CLI mode
        stopPolling();
        cliMode = true;
        await sleep(300);

        if (writer) {
            try { writer.releaseLock(); } catch (e) { }
            writer = null;
        }
        if (reader) {
            try { await reader.cancel(); } catch (e) { }
            try { reader.releaseLock(); } catch (e) { }
            reader = null;
        }

        const mscWriter = port.writable.getWriter();
        const encoder = new TextEncoder();

        // Enter CLI
        await mscWriter.write(encoder.encode('#\n'));
        await sleep(500);

        // Send MSC command — FC will reboot and serial will disconnect
        await mscWriter.write(encoder.encode('msc\n'));
        mscWriter.releaseLock();

        // Graceful UI update
        droneState.connected = false;
        logToConsole('FC is rebooting into Flash Drive Mode. Check your file explorer for the logs.', 'success');

        // Update the Blackbox tab UI
        const deviceEl = document.getElementById('valBboxDevice');
        if (deviceEl) deviceEl.textContent = '⏏ Mounted as USB Drive';

        // Show disconnect state
        connectBtn.textContent = 'Connect to Drone';
        connectionStatus.textContent = 'Disconnected (MSC Mode)';
        connectionStatus.style.color = 'var(--status-warning)';

    } catch (err) {
        log.error('MSC trigger error', err);
        logToConsole(`MSC Error: ${err.message}. The FC may have already disconnected — check your file explorer.`, 'error');
    }
}

// ---------------------------------------------------------
// Motors Tab Rendering
// ---------------------------------------------------------
function renderMotorsTab() {
    let mcfg = null;
    if (droneState.cliDiff && window.CliParser) {
        mcfg = window.CliParser.parseMotorConfig(droneState.cliDiff);
    }

    // Fallback to a sensible default configuration if CLI data is missing
    if (!mcfg) {
        mcfg = {
            mixer: 'QUADX',
            protocol: 'DSHOT300',
            bidir: 'OFF',
            motorPoles: 14,
            yawReversed: 'OFF'
        };
    }

    // Populate config cards
    const protEl = document.getElementById('valEscProtocol');
    const bidirEl = document.getElementById('valBidir');
    const polesEl = document.getElementById('valMotorPoles');

    if (protEl) protEl.textContent = mcfg.protocol;
    if (bidirEl) {
        bidirEl.textContent = mcfg.bidir === 'ON' ? 'Enabled' : 'Disabled';
        bidirEl.style.color = mcfg.bidir === 'ON' ? 'var(--status-success)' : 'var(--text-muted)';
    }
    if (polesEl) polesEl.textContent = mcfg.motorPoles;

    // Initialize 3D Visualizer
    const canvas3D = document.getElementById('motor3DCanvas');
    if (canvas3D && window.Drone3D) {
        window.Drone3D.init(canvas3D, mcfg);
        logToConsole(`3D Visualizer initialized (${mcfg.mixer}, Yaw Reversed: ${mcfg.yawReversed})`, 'success');
    }
}

// ---------------------------------------------------------
// OSD Tab Rendering
// ---------------------------------------------------------
function renderOsdTab() {
    // System Select Click Handlers
    document.querySelectorAll('.osd-sys-card').forEach(card => {
        card.addEventListener('click', () => {
            const system = card.dataset.system;
            if (!system || !window.OsdEditor) return;

            window.OsdEditor.setVideoSystem(system);
            window.OsdEditor.parseFromCli(droneState.cliDiff);

            // Update canvas grid background to match system
            const canvas = document.getElementById('osdCanvas');
            if (canvas) {
                const cols = system === 'hd' ? 50 : 30;
                const rows = system === 'hd' ? 18 : 16;
                canvas.style.backgroundSize = `calc(100% / ${cols}) calc(100% / ${rows})`;
            }

            // Hide system select, show editor
            document.getElementById('osdSystemSelect').classList.add('hidden');
            document.getElementById('osdEditor').classList.remove('hidden');

            window.OsdEditor.renderCanvas();
            logToConsole(`OSD Editor initialized (${system.toUpperCase()}, ${window.OsdEditor.elements.length} elements)`, 'success');
        });
    });

    // Template Button Click Handlers
    document.querySelectorAll('.osd-template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.osd-template-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const template = btn.dataset.template;
            const system = window.OsdEditor ? window.OsdEditor.videoSystem : 'analog';
            let message = '';

            if (template === 'freestyle') {
                message = `I selected the Freestyle OSD template for my ${system === 'hd' ? 'HD' : 'Analog'} video system. Please generate the CLI commands to enable: battery voltage, craft name, flight mode, timer, warnings, and current draw on optimal screen positions.`;
            } else if (template === 'racing') {
                message = `I selected the Racing OSD template for my ${system === 'hd' ? 'HD' : 'Analog'} video system. Please generate minimal CLI commands to enable only: timer, battery voltage, and warnings for clean racing view.`;
            } else if (template === 'longrange') {
                message = `I selected the Long Range / GPS OSD template for my ${system === 'hd' ? 'HD' : 'Analog'} video system. Please generate CLI commands to enable: GPS sats, GPS speed, altitude, battery, RSSI/LQ, distance to home, and timer.`;
            }
            if (message) sendMessageToCopilot(message);
        });
    });

    // Review Button
    const reviewBtn = document.getElementById('osdReviewBtn');
    if (reviewBtn) {
        reviewBtn.addEventListener('click', () => {
            if (!window.OsdEditor || window.OsdEditor.pendingCommands.length === 0) return;
            const block = window.OsdEditor.getPendingBlock();
            sendMessageToCopilot(`I have manually repositioned OSD elements. Here are my pending CLI commands. Please review them and confirm they look correct:\n\`\`\`\n${block}\n\`\`\``);
            window.OsdEditor.clearPending();
        });
    }
}

// ---------------------------------------------------------
// VTX Tab Rendering
// ---------------------------------------------------------
function renderVtxTab() {
    if (!window.CliParser || !droneState.cliDiff) return;

    const cfg = window.CliParser.parseVtxConfig(droneState.cliDiff);
    if (!cfg) return;

    // Persist onto droneState for AI or future features
    droneState.vtx = {
        band: cfg.band,
        channel: cfg.channel,
        power: cfg.power,
        lowPowerDisarm: cfg.lowPowerDisarm,
        osdDisplayportDevice: cfg.osdDisplayportDevice,
        systemType: cfg.systemType,
        protocolLabel: cfg.protocolLabel,
        isHdDigital: cfg.isHdDigital
    };

    const badge = document.getElementById('vtxProtocolBadge');
    const desc = document.getElementById('vtxProtocolDescription');

    if (badge) {
        badge.textContent = `📡 VTX Protocol: ${cfg.protocolLabel}`;
        badge.classList.remove('vtx-protocol-hd', 'vtx-protocol-analog');
        if (cfg.isHdDigital) {
            badge.classList.add('vtx-protocol-hd');
        } else if (cfg.hasAnalogVtxOnSerial) {
            badge.classList.add('vtx-protocol-analog');
        }
    }

    if (desc) {
        if (cfg.systemType === 'HD Digital') {
            desc.textContent = 'Detected HD Digital video system via MSP DisplayPort.';
        } else if (cfg.systemType === 'Analog') {
            desc.textContent = 'Detected analog VTX using SmartAudio or IRC Tramp on a serial port.';
        } else {
            desc.textContent = 'Could not confidently detect your video system from the CLI dump.';
        }
    }

    const bandEl = document.getElementById('vtxBandValue');
    const chanEl = document.getElementById('vtxChannelValue');
    const powerEl = document.getElementById('vtxPowerValue');

    if (bandEl) bandEl.textContent = cfg.band !== null && cfg.band !== undefined ? String(cfg.band) : '—';
    if (chanEl) chanEl.textContent = cfg.channel !== null && cfg.channel !== undefined ? String(cfg.channel) : '—';
    if (powerEl) powerEl.textContent = cfg.power !== null && cfg.power !== undefined ? String(cfg.power) : '—';

    const bandHdNote = document.getElementById('vtxBandHdNote');
    const chanHdNote = document.getElementById('vtxChannelHdNote');
    const showHdNotes = cfg.isHdDigital;

    [bandHdNote, chanHdNote].forEach(el => {
        if (!el) return;
        if (showHdNotes) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
}

// ---------------------------------------------------------
// QA Test Execution Hook
// ---------------------------------------------------------
window.runTestsForAgent = function () {
    console.log("Running QA tests...");
    const resultsDiv = document.getElementById('qa-test-results');
    if (!resultsDiv) {
        console.error("QA results div not found");
        return;
    }

    try {
        const mockCli = `
# diff all
serial 0 1 115200 57600 0 115200
serial 1 64 115200 57600 0 115200
aux 0 0 1300 1700 0 0
aux 1 1 900 1200 0 0
        `.trim();

        // Test 1: Ports Matcher
        const ports = window.CliParser.parsePorts(mockCli);
        if (ports.length !== 2) {
            throw { failed_module: "cliParser.parsePorts", error: "Regex matched " + ports.length + " serial lines instead of 2" };
        }

        // Test 2: Modes Matcher
        const modes = window.CliParser.parseModes(mockCli);
        if (modes.length !== 2) {
            throw { failed_module: "cliParser.parseModes", error: "Regex matched " + modes.length + " aux lines instead of 2" };
        }

        resultsDiv.textContent = JSON.stringify({ status: "PASS" });
    } catch (e) {
        resultsDiv.textContent = JSON.stringify({
            status: "FAIL",
            failed_module: e.failed_module || "unknown",
            error: e.error || e.message
        });
    }
};
