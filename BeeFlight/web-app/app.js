// =========================================================
// BETAFLIGHT AI — Phase 3: Hybrid Data Architecture
// Uses mspProtocol.js for encode/decode
// =========================================================

// ---- AI Provider Registry ----
const AI_PROVIDERS = {
    'gemini-2.5-flash': { provider: 'google', label: 'Gemini 2.5 Flash', keySlot: 'bfai_key_google' },
    'gemini-2.0-flash': { provider: 'google', label: 'Gemini 2.0 Flash', keySlot: 'bfai_key_google' },
    'gemini-2.5-pro': { provider: 'google', label: 'Gemini 2.5 Pro', keySlot: 'bfai_key_google' },
    'gpt-4o': { provider: 'openai', label: 'GPT-4o', keySlot: 'bfai_key_openai' },
    'gpt-4o-mini': { provider: 'openai', label: 'GPT-4o Mini', keySlot: 'bfai_key_openai' },
    'claude-sonnet-4-20250514': { provider: 'anthropic', label: 'Claude Sonnet 4', keySlot: 'bfai_key_anthropic' },
    'claude-3-5-haiku-20241022': { provider: 'anthropic', label: 'Claude 3.5 Haiku', keySlot: 'bfai_key_anthropic' },
    'groq-llama3-70b': { provider: 'groq', label: 'Llama 3 70B (Groq)', keySlot: 'bfai_key_groq' }
};

const PROVIDER_LABELS = {
    google: 'Google (Gemini)',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    groq: 'Groq'
};

const API_INSTRUCTIONS = {
    google: {
        name: 'Google Gemini',
        url: 'https://aistudio.google.com/app/apikey',
        steps: 'Log in to Google AI Studio and click "Create API key".'
    },
    openai: {
        name: 'OpenAI',
        url: 'https://platform.openai.com/api-keys',
        steps: 'Log in to the OpenAI Platform, navigate to API Keys, and click "Create new secret key".'
    },
    anthropic: {
        name: 'Anthropic',
        url: 'https://console.anthropic.com/settings/keys',
        steps: 'Log in to the Anthropic Console, go to Settings, and click "Create Key".'
    },
    groq: {
        name: 'Groq',
        url: 'https://console.groq.com/keys',
        steps: 'Log in to GroqCloud and click "Create API Key".'
    }
};

let activeModelId = 'gemini-2.5-flash';

function getProviderKey(modelId) {
    const entry = AI_PROVIDERS[modelId];
    if (!entry) return '';
    return localStorage.getItem(entry.keySlot) || '';
}

function setProviderKey(modelId, key) {
    const entry = AI_PROVIDERS[modelId];
    if (!entry) return;
    localStorage.setItem(entry.keySlot, key || '');
}

// Legacy wrappers (still used by validation prompt and settings modal)
function getApiKey() { return getProviderKey(activeModelId); }
function getActiveProviderType() { return AI_PROVIDERS[activeModelId]?.provider || 'google'; }
function setApiKey(key) { setProviderKey(activeModelId, key); }
function promptForApiKey() {
    switchAIModel(activeModelId);
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
    launchControl: {
        mode: 'NORMAL',
        triggerThrottlePercent: 20,
        angleLimit: 0
    },
    features: {
        acc: true
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
        // Modes Tab Live Slider Updates
        const activeAux = droneState.live.rc.aux;
        if (window.parsedModes && window.parsedModes.length > 0) {
            window.parsedModes.forEach(mode => {
                const card = document.getElementById(`modeCard-${mode.modeId}`);
                if (card) {
                    const currentPwm = activeAux[mode.channelIndex] || 1500;
                    const isActive = currentPwm >= mode.minRange && currentPwm <= mode.maxRange;

                    if (isActive) card.classList.add('active');
                    else card.classList.remove('active');

                    // Move local slider indicator
                    const indicator = document.getElementById(`indicator-${mode.modeId}`);
                    if (indicator) {
                        const pct = Math.max(0, Math.min(100, ((currentPwm - 900) / 1200) * 100));
                        indicator.style.left = `${pct}%`;
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
    if (role === 'ai' && typeof marked !== 'undefined') {
        d.innerHTML = marked.parse(text);
    } else {
        d.textContent = text;
    }
    chatContainer.appendChild(d);
    chatContainer.scrollTop = chatContainer.scrollHeight;
} // end function appendChatMessage

/**
 * Validates AI proposed CLI commands against current drone hardware state.
 * Returns null if clean, or a DependencyError object if a required link is missing.
 */
function validateDependencies(proposedCommands, cliDiff) {
    if (!cliDiff || !window.CliParser) return null;

    const ports = window.CliParser.parsePorts(cliDiff);

    // Rule 1: GPS Required
    const needsGps = proposedCommands.some(c =>
        c.toLowerCase().includes('feature gps') ||
        c.toLowerCase().includes('set gps_provider')
    );

    if (needsGps) {
        // Sensor ID 2 is GPS
        const hasGpsPort = ports.some(p => p.sensor_1 === 2 || p.sensor_2 === 2 || p.sensor_3 === 2 || p.sensor_4 === 2 || p.sensor_5 === 2);
        if (!hasGpsPort) return { type: 'UART', required: 'GPS' };
    }

    // Rule 2: MSP VTX / Displayport Required
    const needsMspVtx = proposedCommands.some(c =>
        c.toLowerCase().includes('set osd_displayport_device = msp')
    );

    if (needsMspVtx) {
        // Checking for MSP enabled on any hardware UART (id > 0)
        const hasMspPort = ports.some(p => p.id > 0 && p.mspBaudrate > 0);
        if (!hasMspPort) return { type: 'UART', required: 'MSP_VTX' };
    }

    return null;
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

    const dismissBtn = document.createElement('button');
    dismissBtn.classList.add('btn-secondary', 'action-dismiss');
    dismissBtn.textContent = '✕ Dismiss';

    const spinner = document.createElement('div');
    spinner.classList.add('action-spinner', 'hidden');

    const statusText = document.createElement('div');
    statusText.classList.add('action-status');

    const undoBtn = document.createElement('button');
    undoBtn.classList.add('btn-secondary', 'action-undo', 'hidden');
    undoBtn.textContent = '↩️ Undo (Rollback)';

    actionsRow.appendChild(approveBtn);
    actionsRow.appendChild(dismissBtn);
    actionsRow.appendChild(spinner);
    actionsRow.appendChild(undoBtn);

    card.appendChild(title);
    card.appendChild(summary);
    card.appendChild(details);

    // Linter Engine Integration
    const commands = cmds.map(c => String(c || '').trim()).filter(c => c.length > 0);
    const depError = validateDependencies(commands, droneState.cliDiff);

    let warningDiv = null;
    let fixDropdown = null;

    if (depError) {
        approveBtn.disabled = true;

        warningDiv = document.createElement('div');
        warningDiv.classList.add('action-warning-block');
        warningDiv.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
        warningDiv.style.border = '1px solid rgba(245, 158, 11, 0.5)';
        warningDiv.style.padding = '12px';
        warningDiv.style.borderRadius = '8px';
        warningDiv.style.margin = '12px 0';
        warningDiv.style.color = 'var(--status-warning)';
        warningDiv.style.fontSize = '0.9rem';

        const warningTitle = document.createElement('strong');
        warningTitle.textContent = `⚠️ Missing Hardware Dependency: `;
        warningTitle.style.display = 'block';
        warningTitle.style.marginBottom = '8px';

        let reqLabel = depError.required === 'GPS' ? 'a GPS Sensor' : 'an MSP DisplayPort VTX';
        let fixFlags = depError.required === 'GPS' ? '0 115200 57600 0 115200' : '115200 57600 0 115200'; // simplification for mock

        const warningMsg = document.createElement('span');
        warningMsg.textContent = `This action requires ${reqLabel} assigned to a ${depError.type}. Select an available UART to automatically inject the fix:`;

        warningDiv.appendChild(warningTitle);
        warningDiv.appendChild(warningMsg);

        fixDropdown = document.createElement('select');
        fixDropdown.classList.add('action-fix-dropdown');
        fixDropdown.style.display = 'block';
        fixDropdown.style.marginTop = '8px';
        fixDropdown.style.padding = '6px';
        fixDropdown.style.background = 'var(--bg-input)';
        fixDropdown.style.color = 'var(--text-primary)';
        fixDropdown.style.border = '1px solid var(--border-subtle)';
        fixDropdown.style.borderRadius = '4px';
        fixDropdown.style.width = '100%';

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Select UART --';
        fixDropdown.appendChild(defaultOpt);

        if (window.CliParser && droneState.cliDiff) {
            const ports = window.CliParser.parsePorts(droneState.cliDiff);
            // Assume FC has 8 standard UARTs (ids 1 through 8, indices 0 through 7)
            for (let i = 1; i <= 8; i++) {
                const serialIndex = i - 1;
                const portCfg = ports.find(p => p.id === i);
                const isUsed = portCfg && (portCfg.rxIndicator > 0 || portCfg.mspBaudrate > 0 || portCfg.sensor_1 > 0);

                const opt = document.createElement('option');
                opt.value = serialIndex;
                opt.textContent = `UART ${i}${isUsed ? ' (In Use)' : ''}`;
                if (isUsed) opt.disabled = true;
                fixDropdown.appendChild(opt);
            }
        }

        fixDropdown.addEventListener('change', (e) => {
            const selectedIdx = e.target.value;
            if (selectedIdx === '') {
                approveBtn.disabled = true;
                approveBtn.textContent = 'Approve & Flash';
                return;
            }

            let fixCmd = '';
            if (depError.required === 'GPS') {
                // index 1 for rxIndicator is GPS sensor bit, but raw CLI: serial [identifier] [functionMask] [mspBaudrate] [gpsBaudrate] [telemetryBaudrate] [blackboxBaudrate]
                // Function mask 2 is sensor GPS.
                fixCmd = `serial ${selectedIdx} 2 115200 57600 0 115200`;
            } else if (depError.required === 'MSP_VTX') {
                // MSP function mask is 1 (or combined). 
                fixCmd = `serial ${selectedIdx} 1 115200 57600 0 115200`;
            }

            // Resolution Injector
            if (fixCmd) {
                // Remove any previous injected fix to prevent duplicates
                const baseCommands = cmds.filter(c => !c.startsWith('serial '));
                baseCommands.unshift(fixCmd);

                // Update internal array so validation passes and execution flashes correct data
                commands.length = 0;
                commands.push(...baseCommands);

                // Update visual representation
                codeBlock.textContent = commands.join('\n');

                // UI cleanup
                warningDiv.style.opacity = '0.5';
                fixDropdown.disabled = true;
                approveBtn.disabled = false;
                approveBtn.textContent = 'Fix & Flash';
                statusText.textContent = 'Hardware dependency satisfied by resolution injector.';
                statusText.style.color = 'var(--status-success)';
            }
        });

        warningDiv.appendChild(fixDropdown);
        card.appendChild(warningDiv);
    }

    card.appendChild(actionsRow);
    card.appendChild(statusText);

    container.appendChild(card);
    chatContainer.appendChild(container);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Execution wiring

    approveBtn.addEventListener('click', async () => {
        if (commands.length === 0) {
            statusText.textContent = 'No CLI commands found in action.';
            return;
        }

        // Security validation
        const banned = ['resource', 'defaults', 'timer', 'dma', 'flash'];
        const allowedPrefixes = ['set', 'profile', 'rateprofile', 'save', 'serial', 'feature'];
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

    dismissBtn.addEventListener('click', () => {
        statusText.textContent = '🚫 Dismissed';
        approveBtn.classList.add('hidden');
        dismissBtn.classList.add('hidden');
        card.style.opacity = '0.5';
    });
}

function updateAiStatus() {
    const key = getProviderKey(activeModelId);
    if (key && key.length > 5) {
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
        chatInput.placeholder = "Select a model above and add an API key";
    }
}
aiStatusBadge.addEventListener('click', () => switchAIModel(activeModelId));

// ---- Multi-provider AI Request Router (Replaced by aiService.js) ----
// Note: See aiService.js for the complete adapter pattern implementation.

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

## RESPONSE STYLE — MANDATORY
- **Brevity is law.** Answer only the specific question asked in 1–3 short sentences. Never dump the entire drone state or config unless the user explicitly asks for it.
- **Progressive disclosure.** Give the high-level answer first, then end with a one-line offer to go deeper (e.g. "Want me to break down the filter chain?").
- **Formatting rules:** Use Markdown. Use **bold** for key values (firmware versions, protocol names, numbers). Use bullet lists sparingly (max 3–4 items). Never write a paragraph longer than 3 sentences. Use headings (###) only when listing multiple distinct topics.
- **No filler.** Do not start responses with "Sure!", "Great question!", "Absolutely!", or similar. Get straight to the answer.

## Understanding Betaflight CLI Dumps
- The user provides a diff or diff all, which only contains settings that differ from the firmware defaults. If a variable (like blackbox_mode or blackbox_device) is NOT in the text, you must assume it is set to its factory default value. Do not tell the user the data is 'missing' or 'not explicitly shown'.
- To determine if Blackbox logging is enabled, look at the feature list. If feature BLACKBOX is present, logging is enabled. If blackbox_device = SPIFLASH or SDCARD is present, it is active. If blackbox_device = NONE is present, it is completely disabled.
- Stop using filler phrases like 'the configuration diff indicates' or 'in the provided telemetry'. Speak directly and confidently. If you see it, say it.

## RULES
- Use live telemetry for current state (armed, tilt, stick positions) and the configuration diff for settings (PIDs, filters, UARTs, VTX, OSD).
- If the user asks to calibrate voltage or amperage, use CLI data to find the current scale. Formula: New Scale = Old Scale * (Drone Reading / Multimeter Reading). Generate the \`set vbat_scale = [NEW_VALUE]\` and \`save\` CLI commands.
- NEVER generate commands that arm motors without explicit safety warnings.
- If the CLI diff is not yet available, tell the user you can help with live telemetry but recommend syncing context first.
- BLACKBOX INTENTS: Generate CLI commands wrapped in an action JSON (see below) for filter diagnostics, general flight, or disable logging intents. Remind them to erase flash before a tuning flight.
- MOTOR DIAGNOSTICS: For flip-on-takeoff, check yaw_motors_reversed and mixer. Explain that physical props, motor spin, and the software toggle must match. Point them to the 3D Motors visualizer tab.
- OSD TEMPLATES: Generate osd_..._pos CLI commands based on video system (Analog 30x16 vs HD 50x18) as an action JSON.
- SYMPTOM-BASED TUNING: Base advice on droneState.dynamics JSON.
- HOT MOTORS: Suggest lowering d_pitch/d_roll by ~10–15%. If dterm_lowpass_hz > 150Hz, recommend reducing it. Never increase D-term for hot motors.
- PROPWASH SHAKES: Suggest small d_pitch/d_roll increases (within limits) and/or reducing filter delay, respecting the D-term safety rule.
- CINEMATIC RATES: Propose rc_rate/rc_expo changes for softer center stick, output as action JSON.
- TWITCHY CENTER STICK: If the user complains about 'twitchy', 'sensitive', or 'jittery' controls near center stick, suggest an Action Card that increases roll_expo and pitch_expo by ~10 (e.g., from 0 to 10 or from 10 to 20) or lowers rc_rate. Never set expo above 80.
- SLOW FLIPS/ROLLS: If the user complains that flips, rolls, or rotations feel too slow or take too long, suggest an Action Card that increases roll_srate and pitch_srate by ~5-10. If super rate is already above 80, warn about potential loss of control.
- INDOOR / TIGHT SPACES: If the user mentions flying indoors, hitting the ceiling, struggling through doors or windows, or flying a Whoop, suggest the 'Indoor' rate profile (RC Rate: 0.7, Super Rate: 0.55, Expo: 0.60). Explain that setting Expo to 0.60 deeply flattens the center stick response, giving much finer micro-movement control in tight quarters while still allowing full rotation at max deflection.
- SAFETY D-TERM LIMIT: Never increase d_roll/d_pitch/d_yaw by more than 5 points at a time. If already above 50, recommend reductions.
- AUDIT_MODES: When the user asks "How are my modes looking?" or to audit their switches, analyze the 'aux' commands in the CLI Diff. Apply these 3 Safety Checks: 
    1. If ARM (modeId 0) is assigned but PREARM (modeId 39) is missing, gently suggest adding PREARM to prevent accidental throttle-up.
    2. If FLIP OVER AFTER CRASH (modeId 35, Turtle Mode) is missing, warn them they will have to perform the 'walk of shame' if they crash upside down.
    3. Ensure the active range (min to max) for ARM (modeId 0) does NOT overlap with dangerous modes like FAILSAFE (modeId 27). 
    Output your recommendations as a standard JSON Action Card with the appropriate "aux" CLI commands.

## ACTION FORMAT
When the user asks you to change a configuration setting (PIDs, rates, filters, VTX, Blackbox, OSD, etc.), you MUST respond with a structured JSON block wrapped in a fenced code block annotated as \`\`\`action (no other markdown). The JSON MUST have this shape:
{
  "intent": "<short human readable description of the change>",
  "summary": "<1-2 sentence explanation of what this change will do and why>",
  "commands": ["set ...", "set ...", "save"]
}
Do not include any additional fields. Do not wrap the JSON in markdown besides the single \`\`\`action fence. All CLI commands must be in the commands array only.`;

    try {
        const responseText = await window.generateAIResponse(getActiveProviderType(), activeModelId, systemPrompt, userText, apiKey);
        renderAiResponse(responseText);
    } catch (err) {
        log.error('AI API call failed', err);
        logToConsole(`AI copilot error: ${err.message}`, 'error');
        appendChatMessage('ai', `Error reaching AI provider. Check console logs.`);
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

        // Best-effort board_name extraction from CLI for accurate hardware matching
        try {
            const lines = droneState.cliDiff.split(/\r?\n/);
            for (const raw of lines) {
                const line = String(raw).trim();
                if (line.toLowerCase().startsWith('board_name')) {
                    const parts = line.split(/\s+/);
                    if (parts.length >= 2) {
                        const bn = parts[1].trim();
                        if (bn) {
                            droneState.boardName = bn;
                            logToConsole(`Board name detected from CLI: ${droneState.boardName}`, 'success');
                        }
                    }
                    break;
                }
            }
        } catch (e) {
            log.error('Failed to parse board_name from CLI diff', e);
        }

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
        renderConfigurationTab();
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
        const cliReader = port.readable.getReader();
        const decoder = new TextDecoder();
        let cliOutput = '';
        let stage = 'ENTER_CLI';

        // Enter CLI mode aggressively
        await cliWriter.write(encoder.encode('#\r\n'));
        log.info('Sent # to enter CLI');

        const deadline = Date.now() + 15000; // Give 15s total for safety
        log.info('Starting CLI stream read loop...');
        try {
            while (Date.now() < deadline) {
                const readPromise = cliReader.read();
                const timeoutPromise = sleep(500).then(() => ({ value: null, done: false, timeout: true }));
                const result = await Promise.race([readPromise, timeoutPromise]);

                if (result.done) {
                    logToConsole('CLI stream EOF reached', 'warning');
                    break;
                }
                if (result.value && result.value.byteLength > 0) {
                    const chunk = decoder.decode(result.value);
                    cliOutput += chunk;
                    logToConsole(`[RX Chunk]: ${chunk.length} chars. Total: ${cliOutput.length}`, 'rx');

                    if (stage === 'ENTER_CLI') {
                        // Wait for the FC to print its banner and land on a '#' prompt (or if it's already there)
                        if (cliOutput.trimEnd().endsWith('#')) {
                            log.info('FC CLI prompt detected. Sending "diff all"...');
                            // Clear output to cleanly capture just the diff
                            cliOutput = '';
                            await cliWriter.write(encoder.encode('diff all\r\n'));
                            stage = 'WAITING_DIFF';
                        }
                    } else if (stage === 'WAITING_DIFF') {
                        const stripped = cliOutput.trim();
                        // wait for it to process the command and return a new prompt
                        if (cliOutput.length > 50 && cliOutput.includes('diff') && stripped.endsWith('#')) {
                            log.info("Found closing '#' prompt. Diff capture complete.");
                            break;
                        }
                    }
                } else if (result.timeout && stage === 'ENTER_CLI') {
                    // Sometimes the drone is already in CLI but silent, or missed the #. Resend it gently.
                    logToConsole('Timeout waiting for prompt. Resending # (DTR asserted)...', 'warning');
                    await cliWriter.write(encoder.encode('\r\n#\r\n'));
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

        // Best-effort board_name extraction from CLI for accurate hardware matching
        try {
            const cliLines = droneState.cliDiff.split(/\r?\n/);
            for (const raw of cliLines) {
                const line = String(raw).trim();
                if (line.toLowerCase().startsWith('board_name')) {
                    const parts = line.split(/\s+/);
                    if (parts.length >= 2) {
                        const bn = parts[1].trim();
                        if (bn) {
                            droneState.boardName = bn;
                            log.info(`Board name detected from CLI: ${droneState.boardName}`);
                            logToConsole(`Board name detected from CLI: ${droneState.boardName}`, 'success');
                        }
                    }
                    break;
                }
            }
        } catch (e) {
            log.error('Failed to parse board_name from CLI diff', e);
        }

        // CRITICAL: Exit CLI mode so FC returns to MSP mode before we close the port.
        // Without this, the FC stays in CLI and ignores all MSP commands on reopen.
        await cliWriter.write(encoder.encode('exit\r\n'));
        log.info('Sent CLI exit command');
        await sleep(400); // Give it a bit more time to process exit

    } catch (err) {
        log.error('CLI diff capture error', err);
        logToConsole(`CLI diff error: ${err.message}`, 'error');
        // Try to exit CLI even on error
        try {
            await cliWriter.write(encoder.encode('exit\r\n'));
            await sleep(400);
        } catch (e) { }
    } finally {
        cliWriter.releaseLock();
    }
    // Note: syncOverlay remains visible during the USB reboot phase
}

// ---------------------------------------------------------
// Web Serial Connection (Two-phase: CLI first, then MSP)
// ---------------------------------------------------------

navigator.serial.addEventListener('disconnect', async (event) => {
    if (event.target === port || !port) {
        log.info('USB Disconnect event: FC dropped connection');

        // ---- VIOLENT TEARDOWN (Graceful Hardware Reboot Lifecycle) ----
        if (isRebooting) {
            const rebootOverlay = document.getElementById('rebootOverlay');
            if (rebootOverlay) {
                rebootOverlay.classList.remove('hidden');
                rebootOverlay.classList.add('active');
            }

            try {
                if (reader) {
                    await reader.cancel();
                    reader.releaseLock();
                }
            } catch (e) { }
            try { if (writer) writer.releaseLock(); } catch (e) { }
            try { if (port) await port.close(); } catch (e) { }

            // Clear RC intervals to stop console beg spam
            if (typeof mspRcInterval !== 'undefined' && mspRcInterval) clearInterval(mspRcInterval);
            if (typeof autoDetectInterval !== 'undefined' && autoDetectInterval) clearInterval(autoDetectInterval);

            logToConsole('Hardware disconnected rapidly. Releasing locks.', 'warning');
        }

        stopPolling();
        // Clear session history on disconnect to prevent cross-drone rollbacks
        if (window.sessionHistory) window.sessionHistory = [];

        if (isReconnectingAfterCli || isRebooting) {
            droneState.connected = false;
        } else {
            // Auto-Reconnect scenario triggered manually or unexpectedly
            isReconnecting = true;
            droneState.connected = false;
            connectionStatus.textContent = "Waiting for USB...";
            connectionStatus.style.color = "var(--status-warning)";
            connectionStatus.style.background = "rgba(245,158,11,0.1)";
            connectionStatus.classList.remove("connected");
        }
    }
});

navigator.serial.addEventListener('connect', async (event) => {
    log.info('USB Connect event: FC re-enumerated');

    // ---- AUTO-CATCH (Graceful Hardware Reboot Lifecycle) ----
    if (isRebooting) {
        isRebooting = false;
        logToConsole('FC boot completed. Auto-catching USB...', 'info');

        setTimeout(async () => {
            try {
                const ports = await navigator.serial.getPorts();
                const matchedPort = ports.find(p => {
                    const info = p.getInfo();
                    return info.usbVendorId === connectedVid && info.usbProductId === connectedPid;
                });

                if (matchedPort) {
                    port = matchedPort;
                    await port.open({ baudRate: 115200 });

                    // Windows USB VCP (STM32) often requires DTR/RTS to be asserted to stream data
                    try {
                        await port.setSignals({ dataTerminalReady: true, requestToSend: true });
                    } catch (e) {
                        log.info('DTR/RTS setSignals not supported or failed (ignoring)');
                    }

                    const rebootOverlay = document.getElementById('rebootOverlay');
                    if (rebootOverlay) {
                        const subtext = rebootOverlay.querySelector('.reboot-subtext');
                        if (subtext) subtext.textContent = "Syncing Configuration...";
                    }

                    logToConsole('Serial port opened. Fetching fresh CLI config...', 'info');

                    // Post-Boot Fetch: Grab the fresh CLI data after the batch flash
                    await captureCliDiff();

                    // As before, FC resets USB when leaving CLI. Close port and pass the baton.
                    await port.close();

                    isReconnectingAfterCli = true;
                    wasRebooting = true; // Track that we came from an auto-catch sequence

                } else {
                    throw new Error("Port not found in previously granted devices.");
                }
            } catch (err) {
                log.error('Auto-catch failed', err);
                const rebootOverlay = document.getElementById('rebootOverlay');
                if (rebootOverlay) {
                    rebootOverlay.classList.remove('active');
                    rebootOverlay.classList.add('hidden');
                }
                showToast('Auto-Catch failed. Please click Connect manually.', 'error');
            }
        }, 600); // 600ms buffer for FC Bootloader
        return;
    }

    if (isReconnectingAfterCli) {
        isReconnectingAfterCli = false;
        port = event.target;
        logToConsole('FC reboot completed. Starting MSP...', 'success');

        try {
            await port.open({ baudRate: 115200 });
            try {
                await port.setSignals({ dataTerminalReady: true, requestToSend: true });
            } catch (e) { }

            droneState.connected = true;
            connectionStatus.textContent = "Connected";
            connectionStatus.classList.add("connected");

            writer = port.writable.getWriter();
            startMspReadLoop();
            await initializeDrone();

            // ---- STATE RE-HYDRATION (Graceful Hardware Reboot Lifecycle) ----
            if (wasRebooting) {
                wasRebooting = false;

                // Explicitly redraw the DOM using the freshly pulled droneState.cliDiff
                if (typeof renderModesTab === 'function') renderModesTab();
                if (typeof renderPowerTab === 'function') renderPowerTab();

                // Tear down the overlay ONLY after the DOM has been painted with fresh data
                const rebootOverlay = document.getElementById('rebootOverlay');
                if (rebootOverlay) {
                    rebootOverlay.classList.remove('active');
                    setTimeout(() => {
                        rebootOverlay.classList.add('hidden');
                        const subtext = rebootOverlay.querySelector('.reboot-subtext');
                        if (subtext) subtext.textContent = "Waiting for USB reconnection...";
                    }, 300);
                }

                showToast('Graceful Hardware Reboot Successful.', 'success');
                logToConsole('Hardware Auto-Catch & Config Sync seamless execution.', 'success');
            }

        } catch (err) {
            log.error('Failed to start MSP session on reconnect', err);
            logToConsole(`MSP init failed: ${err.message}`, 'error');
            syncOverlay.classList.add('hidden');
        }
    } else if (isReconnecting) {
        log.info('Auto-reconnect engine tracking...');
        setTimeout(async () => {
            try {
                const ports = await navigator.serial.getPorts();
                const matchedPort = ports.find(p => {
                    const info = p.getInfo();
                    return info.usbVendorId === connectedVid && info.usbProductId === connectedPid;
                });

                if (matchedPort) {
                    if (targetMode) {
                        // Flash the new setting!
                        // Ensure we pass the precise linkId tied to this mode card
                        await updateModeLinkCli(targetMode.linkId, modeId, i, minBound, maxBound);
                    } droneState.connected = true;
                    connectionStatus.textContent = "Auto-Reconnected!";
                    connectionStatus.style.color = "var(--status-success)";
                    connectionStatus.style.background = "rgba(16,185,129,0.1)";
                    connectionStatus.classList.add("connected");

                    setTimeout(() => {
                        if (droneState.connected) {
                            connectionStatus.textContent = "Connected";
                            connectionStatus.style.color = "";
                            connectionStatus.style.background = "";
                        }
                    }, 3000);

                    writer = port.writable.getWriter();
                    startMspReadLoop();
                    await initializeDrone();
                    isReconnecting = false;
                    logToConsole('Auto-reconnected seamlessly.', 'success');
                }
            } catch (err) {
                log.error('Auto-reconnect failed', err);
                isReconnecting = false;
                connectionStatus.textContent = "Disconnected";
                connectionStatus.style.color = "";
                connectionStatus.style.background = "";
            }
        }, 800); // Give the FC USB stack 800ms
    }
});

let connectedVid = null;
let connectedPid = null;
let isReconnecting = false;
let isRebooting = false;
let wasRebooting = false;

async function connectToDrone() {
    if (!('serial' in navigator)) {
        logToConsole('Web Serial API not supported.', 'error');
        return;
    }
    try {
        port = await navigator.serial.requestPort();
        const info = port.getInfo();
        connectedVid = info.usbVendorId;
        connectedPid = info.usbProductId;
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

        // Windows USB VCP (STM32) often requires DTR/RTS to be asserted to stream data.
        // Node's serialport does this automatically, Chrome's Web Serial does not.
        try {
            await port.setSignals({ dataTerminalReady: true, requestToSend: true });
        } catch (e) {
            log.info('DTR/RTS setSignals not supported or failed (ignoring)');
        }

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

// API Key save (legacy settings modal — saves to active provider)
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', () => {
        const apiInput = document.getElementById('apiKeyInput');
        if (apiInput && apiInput.value.trim()) {
            setProviderKey(activeModelId, apiInput.value.trim());
            apiInput.value = '';
            updateAiStatus();
            const entry = AI_PROVIDERS[activeModelId];
            const label = entry ? entry.label : activeModelId;
            logToConsole(`API key saved for ${label}.`, 'success');
            appendChatMessage('ai', `API key saved for **${label}**! I'm online now.`);
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

        if (viewId === 'view-blackbox') renderBlackboxTab();
        if (viewId === 'view-pids') {
            wireRatesEngine();
            setTimeout(() => { updateMaxValues(); drawRateCurve(); }, 50);
        }
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
            const rawText = String(ev.target?.result || '');

            const fileName = file.name || '';
            const lowerName = fileName.toLowerCase();
            const isBfai = lowerName.endsWith('.bfai');

            let cliText = rawText;
            let extraMeta = null;

            if (isBfai) {
                try {
                    const parsed = JSON.parse(rawText);
                    if (parsed && typeof parsed === 'object') {
                        extraMeta = {
                            format: parsed.format || null,
                            version: parsed.version || null,
                            createdAt: parsed.createdAt || null,
                            board: parsed.board || null,
                            stats: parsed.stats || null,
                            meta: parsed.meta || null
                        };
                        if (parsed.cli && typeof parsed.cli === 'string') {
                            cliText = parsed.cli;
                        } else {
                            throw new Error('BeeFlight backup file is missing cli field.');
                        }
                    } else {
                        throw new Error('BeeFlight backup file is not valid JSON.');
                    }
                } catch (err) {
                    logToConsole('Failed to parse .bfai backup file. Make sure it was exported by BeeFlight AI.', 'error');
                    showToast('Failed to parse .bfai backup file.', 'error');
                    resetImportUI();
                    return;
                }
            }

            importFileText = cliText;

            const lines = cliText.split(/\r?\n/);
            const headerLines = lines.slice(0, 120);
            const headerSnippet = headerLines.join('\n');
            const tailSnippet = lines.slice(-10).join('\n');

            // Try to locally detect motor protocol from the header snippet to avoid wasting AI tokens
            let detectedMotorProtocol = null;
            for (const raw of headerLines) {
                const line = String(raw).trim();
                const match = line.match(/^set\s+motor_pwm_protocol\s*=\s*(\S+)/i);
                if (match) {
                    detectedMotorProtocol = match[1];
                    break;
                }
            }

            const context = {
                headerSnippet,
                tailSnippet,
                liveBoard: droneState.boardName || 'Unknown',
                liveFirmwareId: droneState.firmwareIdentifier || 'Unknown',
                liveVersion: droneState.firmwareVersion || 'Unknown',
                fileApproxLines: lines.length,
                motorProtocol: (extraMeta && extraMeta.meta && extraMeta.meta.motorProtocol) || detectedMotorProtocol || 'Unknown',
                backupMeta: extraMeta
            };

            log.info('Backup validation context', context);

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

// ---- System Logs toggle (collapse/expand) ----
const consoleToggle = document.getElementById('consoleToggle');
const devConsole = document.getElementById('devConsole');
if (consoleToggle && devConsole) {
    const savedState = localStorage.getItem('bfai_console_collapsed');
    if (savedState === 'true') devConsole.classList.add('collapsed');
    consoleToggle.addEventListener('click', () => {
        devConsole.classList.toggle('collapsed');
        localStorage.setItem('bfai_console_collapsed', devConsole.classList.contains('collapsed'));
    });
}

// ---- AI Model Selector & Key Interceptor ----
const aiModelSelector = document.getElementById('aiModelSelector');
const apiKeyPromptModal = document.getElementById('apiKeyPromptModal');
const apiKeyPromptTitle = document.getElementById('apiKeyPromptTitle');
const providerKeyInput = document.getElementById('providerKeyInput');
const saveProviderKeyBtn = document.getElementById('saveProviderKeyBtn');
const closeApiKeyPromptBtn = document.getElementById('closeApiKeyPromptBtn');
const clearAiKeysBtn = document.getElementById('clearAiKeysBtn');

let pendingSwitchModelId = null;

function renderApiKeyModalContent(providerKey) {
    const info = API_INSTRUCTIONS[providerKey];
    const name = info ? info.name : providerKey;
    const steps = info ? info.steps : 'Visit the provider dashboard to create an API key.';
    const url = info ? info.url : '#';

    if (apiKeyPromptTitle) apiKeyPromptTitle.textContent = `Enter your ${name} API Key`;
    const stepsEl = document.getElementById('apiKeyHelperSteps');
    if (stepsEl) stepsEl.textContent = `Don't have one? ${steps}`;
    const linkEl = document.getElementById('apiKeyHelperLink');
    if (linkEl) {
        linkEl.href = url;
        linkEl.textContent = `Get your ${name} key here ↗`;
    }
    const securityEl = document.getElementById('apiKeySecurityText');
    if (securityEl) securityEl.textContent = `Your API key is stored securely in your browser's local storage and is never sent to our servers. You communicate directly with ${name}.`;
}

window.appState = { activeAIProvider: '', activeAIModel: '' };

function switchAIModel(modelId) {
    const entry = AI_PROVIDERS[modelId];
    if (!entry) return;

    const key = getProviderKey(modelId);
    if (!key) {
        pendingSwitchModelId = modelId;
        renderApiKeyModalContent(entry.provider);
        if (providerKeyInput) providerKeyInput.value = '';
        if (apiKeyPromptModal) apiKeyPromptModal.classList.remove('hidden');
        return;
    }

    activeModelId = modelId;
    localStorage.setItem('bfai_active_model', modelId);

    let providerName = '';
    if (entry.provider === 'google') providerName = 'Gemini';
    else if (entry.provider === 'openai') providerName = 'OpenAI';
    else if (entry.provider === 'anthropic') providerName = 'Anthropic';
    else if (entry.provider === 'grok') providerName = 'Grok';
    else if (entry.provider === 'groq') providerName = 'Groq';

    window.appState.activeAIProvider = providerName;
    window.appState.activeAIModel = modelId;

    updateAiStatus();
    appendChatMessage('ai', `Switched to **${entry.label}**.`);
    log.info(`AI model switched to ${entry.label} (${modelId})`);
}

if (saveProviderKeyBtn) {
    saveProviderKeyBtn.addEventListener('click', () => {
        const val = providerKeyInput ? providerKeyInput.value.trim() : '';
        if (!val || val.length < 5) {
            showToast('Please enter a valid API key.', 'error');
            return;
        }
        if (pendingSwitchModelId) {
            setProviderKey(pendingSwitchModelId, val);
        }
        if (providerKeyInput) providerKeyInput.value = '';
        if (apiKeyPromptModal) apiKeyPromptModal.classList.add('hidden');

        if (pendingSwitchModelId) {
            const entry = AI_PROVIDERS[pendingSwitchModelId];
            activeModelId = pendingSwitchModelId;
            localStorage.setItem('bfai_active_model', pendingSwitchModelId);

            let providerName = '';
            if (entry.provider === 'google') providerName = 'Gemini';
            else if (entry.provider === 'openai') providerName = 'OpenAI';
            else if (entry.provider === 'anthropic') providerName = 'Anthropic';
            else if (entry.provider === 'grok') providerName = 'Grok';
            else if (entry.provider === 'groq') providerName = 'Groq';

            window.appState.activeAIProvider = providerName;
            window.appState.activeAIModel = pendingSwitchModelId;
            updateAiStatus();
            appendChatMessage('ai', `Switched to **${entry.label}**.`);
            log.info(`AI model switched to ${entry.label} (${pendingSwitchModelId})`);
            pendingSwitchModelId = null;
        }
    });
}

if (closeApiKeyPromptBtn) {
    closeApiKeyPromptBtn.addEventListener('click', () => {
        if (providerKeyInput) providerKeyInput.value = '';
        if (apiKeyPromptModal) apiKeyPromptModal.classList.add('hidden');
        if (pendingSwitchModelId && aiModelSelector) {
            aiModelSelector.value = activeModelId;
        }
        pendingSwitchModelId = null;
    });
}

if (aiModelSelector) {
    const savedModel = localStorage.getItem('bfai_active_model');
    if (savedModel && AI_PROVIDERS[savedModel]) {
        activeModelId = savedModel;
        aiModelSelector.value = savedModel;
    }
    aiModelSelector.addEventListener('change', () => {
        switchAIModel(aiModelSelector.value);
    });
}

if (clearAiKeysBtn) {
    clearAiKeysBtn.addEventListener('click', () => {
        const slots = new Set(Object.values(AI_PROVIDERS).map(e => e.keySlot));
        slots.forEach(slot => localStorage.removeItem(slot));
        showToast('All saved AI provider keys have been cleared.', 'success');
        log.info('All AI provider keys cleared from localStorage.');
        updateAiStatus();
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
// ---------------------------------------------------------
// Modes Tab Overhaul (Phase 5)
// ---------------------------------------------------------
window.parsedModes = [];
let autoDetectActive = false;
let autoDetectInterval = null;
let currentAutoDetectModeId = null;
let baselineRc = null;
let hasUnsavedChanges = false;

function updateUnsavedModesUI() {
    const banner = document.getElementById('unsavedModesBanner');
    if (!banner) return;

    if (hasUnsavedChanges) {
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

async function batchFlashModes() {
    let cliCommands = "mode_color 0 0 0\n";
    let linkId = 0;

    if (window.parsedModes && window.parsedModes.length > 0) {
        for (const m of window.parsedModes) {
            cliCommands += `aux ${linkId} ${m.modeId} ${m.channelIndex} ${m.minRange} ${m.maxRange} 0\n`;
            linkId++;
        }
    }

    // Explicitly clear any legacy/dangling mode links that might have been deleted
    const oldModes = window.CliParser ? window.CliParser.parseModes(droneState.cliDiff) : [];
    let maxOldLink = -1;
    if (oldModes && oldModes.length > 0) {
        maxOldLink = Math.max(...oldModes.map(m => m.linkId));
    }

    while (linkId <= maxOldLink) {
        cliCommands += `aux ${linkId} 0 0 900 900 0\n`;
        linkId++;
    }

    if (cliCommands === "mode_color 0 0 0\n" && maxOldLink === -1) {
        alert("No modes to save or clear.");
        return;
    }

    // --- Launch Control Fix ---
    // Betaflight will silently reject and delete 'aux' mappings for mode 68 (Launch Control) 
    // on reboot if the feature itself is currently disabled (launch_control_mode = NORMAL).
    const isLaunchControlModeMapped = window.parsedModes.some(m => m.modeId === 68);
    const lcfg = window.CliParser ? window.CliParser.parseLaunchControl(droneState.cliDiff) : null;

    if (isLaunchControlModeMapped && lcfg && lcfg.mode === 'NORMAL') {
        // Automatically set it to a valid active mode so the FC respects the 'aux' assign
        cliCommands += "set launch_control_mode = PITCHONLY\n";
    }

    cliCommands += "save\n";

    const btnFlash = document.getElementById('btnBatchFlashModes');
    const originalText = btnFlash ? btnFlash.textContent : 'Save & Flash Modes';
    if (btnFlash) btnFlash.textContent = "⏳ Flashing...";

    console.log("[Modes Save] Batch flashing the following UI payload to drone:");
    console.log(cliCommands);

    try {
        await restoreCliData(cliCommands);
        hasUnsavedChanges = false;
        updateUnsavedModesUI();
        showToast("Modes Flashed Successfully", "success");
    } catch (err) {
        log.error("Batch mode flash failed", err);
        alert("Failed to flash modes to the drone.");
    } finally {
        if (btnFlash) btnFlash.textContent = originalText;
    }
}

function renderModesTab() {
    const modesGrid = document.getElementById('modesGrid');
    if (!modesGrid) return;

    modesGrid.innerHTML = '';

    // Handle initial state or missing CLI
    if (!droneState.cliDiff) {
        modesGrid.innerHTML = `<div class="mode-item placeholder" style="grid-column: 1 / -1; text-align: center; padding: 40px;">Waiting for CLI Sync...</div>`;
        return;
    }

    // When we have unsaved draft changes, use current parsedModes; otherwise re-parse from CLI
    if (!hasUnsavedChanges) {
        window.parsedModes = window.CliParser.parseModes(droneState.cliDiff);
    }

    if (!window.parsedModes || window.parsedModes.length === 0) {
        modesGrid.innerHTML = `<div class="mode-item placeholder" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                                No modes configured. Click "+ Add Mode" to begin.
                               </div>`;
        return;
    }

    // Helper: Map channel names to AUX indices (AUX 1 = index 0)
    const channelOptions = [
        { val: 0, text: 'AUX 1' }, { val: 1, text: 'AUX 2' },
        { val: 2, text: 'AUX 3' }, { val: 3, text: 'AUX 4' },
        { val: 4, text: 'AUX 5' }, { val: 5, text: 'AUX 6' }
    ];

    window.parsedModes.forEach(mode => {
        const card = document.createElement('div');
        card.className = `mode-card-modern ${mode.modeId === 0 ? 'mode-arm' : ''}`;
        card.id = `modeCard-${mode.modeId}`;

        // Build Dropdown Options
        let optionsHtml = '';
        channelOptions.forEach(opt => {
            // mode.channelIndex represents standard AUX index (0-based)
            // But Betaflight CLI uses 0 for AUX1, 1 for AUX2, etc. in mode links.
            const selected = (mode.channelIndex === opt.val) ? 'selected' : '';
            optionsHtml += `<option value="${opt.val}" ${selected}>${opt.text}</option>`;
        });

        // Map Betaflight's 900-2100 logic to percentages for the slider UI
        const rangeMinPct = ((mode.minRange - 900) / 1200) * 100;
        const rangeWidthPct = ((mode.maxRange - mode.minRange) / 1200) * 100;

        card.innerHTML = `
            <div class="mode-info-block">
                <div class="mode-title-modern">${mode.modeName}</div>
                <div class="mode-controls">
                    <select class="mode-channel-select" id="modeSelect-${mode.modeId}">
                        ${optionsHtml}
                    </select>
                    <button class="btn-auto-detect" id="btnAuto-${mode.modeId}">🎧 Auto-Detect</button>
                    ${mode.modeId !== 0 ? `<button class="mode-delete-btn" id="btnDelMode-${mode.modeId}" title="Delete Mode">×</button>` : ''}
                </div>
            </div>
            <div class="mode-slider-block" data-mode-id="${mode.modeId}">
                <div class="mode-slider-track" id="track-${mode.modeId}">
                    <div class="mode-slider-range" id="range-${mode.modeId}" style="left: ${Math.max(0, rangeMinPct)}%; width: ${Math.min(100, rangeWidthPct)}%;">
                        <div class="slider-drag-handle left-handle" data-side="min"></div>
                        <div class="slider-drag-handle right-handle" data-side="max"></div>
                    </div>
                    <div class="mode-slider-indicator" id="indicator-${mode.modeId}" style="left: 50%;"></div>
                </div>
                <div class="mode-slider-labels">
                    <span>900</span>
                    <span>1500</span>
                    <span>2100</span>
                </div>
            </div>
        `;

        modesGrid.appendChild(card);

        // Wire Auto-Detect
        const btnAuto = card.querySelector(`#btnAuto-${mode.modeId}`);
        if (btnAuto) {
            btnAuto.addEventListener('click', () => {
                if (autoDetectActive) stopAutoDetect(); // Stop any exact one
                startAutoDetect(mode.modeId, btnAuto);
            });
        }

        // Wire Delete
        const btnDel = card.querySelector(`#btnDelMode-${mode.modeId}`);
        if (btnDel) {
            btnDel.addEventListener('click', () => {
                const isConfirmed = confirm(`Are you sure you want to delete the ${mode.modeName} mode link?`);
                if (!isConfirmed) return;

                window.parsedModes = (window.parsedModes || []).filter(m => m.modeId !== mode.modeId);
                hasUnsavedChanges = true;
                renderModesTab();
                updateUnsavedModesUI();
            });
        }

        // Wire Manual Channel Select
        const selChan = card.querySelector(`#modeSelect-${mode.modeId}`);
        if (selChan) {
            selChan.addEventListener('change', () => {
                const newAux = parseInt(selChan.value, 10);
                mode.channelIndex = newAux;
                hasUnsavedChanges = true;
                updateUnsavedModesUI();
            });
        }

        // Wire Slider Drag Logic
        const track = card.querySelector(`#track-${mode.modeId}`);
        const rangeBox = card.querySelector(`#range-${mode.modeId}`);
        const handles = card.querySelectorAll('.slider-drag-handle');

        let isDragging = false;
        let activeHandle = null;
        let pMin = mode.minRange;
        let pMax = mode.maxRange;

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                isDragging = true;
                activeHandle = handle.dataset.side;
                document.body.style.cursor = 'ew-resize';
                e.stopPropagation();
                e.preventDefault();
            });
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging || !track) return;
            const rect = track.getBoundingClientRect();
            let pct = (e.clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            let val = Math.round(900 + (pct * 1200));

            // Constrain & snap cleanly like BF (25 points)
            val = Math.round(val / 25) * 25;

            if (activeHandle === 'min') {
                pMin = Math.min(val, pMax - 25);
            } else {
                pMax = Math.max(val, pMin + 25);
            }

            // Update UI visually instantly
            const pMinPct = ((pMin - 900) / 1200) * 100;
            const pWidthPct = ((pMax - pMin) / 1200) * 100;
            rangeBox.style.left = `${pMinPct}%`;
            rangeBox.style.width = `${pWidthPct}%`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = 'default';

                // Only register if bounds truly mutated
                if (pMin !== mode.minRange || pMax !== mode.maxRange) {
                    mode.minRange = pMin;
                    mode.maxRange = pMax;
                    hasUnsavedChanges = true;
                    updateUnsavedModesUI();
                }
            }
        });
    });

    // Wire up Draft State Banner Buttons
    const btnBatchFlash = document.getElementById('btnBatchFlashModes');
    const btnDiscard = document.getElementById('btnDiscardModes');

    if (btnBatchFlash) {
        const newBtnF = btnBatchFlash.cloneNode(true);
        btnBatchFlash.parentNode.replaceChild(newBtnF, btnBatchFlash);
        newBtnF.addEventListener('click', batchFlashModes);
    }

    if (btnDiscard) {
        const newBtnD = btnDiscard.cloneNode(true);
        btnDiscard.parentNode.replaceChild(newBtnD, btnDiscard);
        newBtnD.addEventListener('click', () => {
            hasUnsavedChanges = false;
            updateUnsavedModesUI();
            // Re-render UI from the original un-mutated CLI diff
            renderModesTab();
        });
    }

    // Wire up Add Mode Dropdown
    const btnAddMode = document.getElementById('btnAddMode');
    const addModeDropdown = document.getElementById('addModeDropdown');
    const launchControlItem = document.getElementById('addModeLaunchControl');

    // Hardware support visual lockout
    if (launchControlItem && droneState.features) {
        if (droneState.features.launchControlSupported === false) {
            launchControlItem.classList.add('disabled');
            launchControlItem.title = "Firmware Update Required: Your drone was compiled without Launch Control support.";
        } else {
            launchControlItem.classList.remove('disabled');
            launchControlItem.title = "";
        }
    }

    if (btnAddMode && addModeDropdown) {
        // Remove old listeners to prevent stacking
        const newBtnAddMode = btnAddMode.cloneNode(true);
        btnAddMode.parentNode.replaceChild(newBtnAddMode, btnAddMode);

        newBtnAddMode.addEventListener('click', (e) => {
            e.stopPropagation();
            addModeDropdown.classList.toggle('hidden');
        });

        // Close when clicking outside
        document.addEventListener('click', () => addModeDropdown.classList.add('hidden'), { once: true });

        // Wire dropdown items
        addModeDropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();

                // Block if this mode requires hardware support the drone lacks
                if (item.classList.contains('disabled')) {
                    alert(item.title || "This feature is not supported by your current firmware.");
                    return;
                }

                addModeDropdown.classList.add('hidden');
                const mId = parseInt(item.getAttribute('data-mode-id'));
                const mName = item.getAttribute('data-mode-name');

                // Check if already exists in active bounds
                const existingActiveMode = window.parsedModes.find(m =>
                    m.modeId === mId &&
                    !(m.minRange === 900 && m.maxRange === 900) &&
                    !(m.minRange === 1000 && m.maxRange === 1000)
                );

                if (existingActiveMode) {
                    alert(`${mName} is already active.`);
                    return;
                }

                // Find first available linkId (0-40 usually allowed)
                const usedLinkIds = window.parsedModes.map(m => m.linkId);
                let nextLinkId = 0;
                while (usedLinkIds.includes(nextLinkId)) {
                    nextLinkId++;
                }

                // DO NOT flash the drone here. Just add to draft state.
                const btnOriginalText = newBtnAddMode.textContent;
                newBtnAddMode.textContent = '⏳ Adding...';
                try {
                    // Push new mode into draft state so the grid re-renders
                    const newMode = {
                        modeId: mId,
                        linkId: nextLinkId,
                        modeName: mName,
                        channelIndex: 0,
                        channelName: 'AUX 1',
                        minRange: 1300,
                        maxRange: 1700
                    };
                    window.parsedModes = window.parsedModes || [];
                    window.parsedModes.push(newMode);
                    hasUnsavedChanges = true;
                    console.log(`[Modes] Added mode ${mName} (ID: ${mId}, Link: ${nextLinkId}) to draft state. Waiting for batch flash.`);
                    renderModesTab();
                    updateUnsavedModesUI();

                } catch (err) {
                    log.error('Add mode failed', err);
                } finally {
                    newBtnAddMode.textContent = btnOriginalText;
                }
            });
        });
    }

    // Wire up Export / Import Mode Layouts
    const btnSaveModeLayout = document.getElementById('btnSaveModeLayout');
    const btnLoadModeLayout = document.getElementById('btnLoadModeLayout');
    const modeLayoutFileInput = document.getElementById('modeLayoutFileInput');

    if (btnSaveModeLayout) {
        // Cloning prevents duplicate event listeners if renderModesTab runs multiple times
        const newBtnSave = btnSaveModeLayout.cloneNode(true);
        btnSaveModeLayout.parentNode.replaceChild(newBtnSave, btnSaveModeLayout);

        newBtnSave.addEventListener('click', () => {
            if (!window.parsedModes || window.parsedModes.length === 0) {
                alert("No active modes to save.");
                return;
            }

            const payload = {
                templateName: "BeeFlight Modes Layout",
                exportedAt: new Date().toISOString(),
                modes: window.parsedModes.map(m => ({
                    modeId: m.modeId,
                    modeName: m.modeName,
                    channelIndex: m.channelIndex,
                    minRange: m.minRange,
                    maxRange: m.maxRange
                }))
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `beeflight-modes-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('Mode Layout Exported Successfully', 'success');
        });
    }

    if (btnLoadModeLayout && modeLayoutFileInput) {
        const newBtnLoad = btnLoadModeLayout.cloneNode(true);
        btnLoadModeLayout.parentNode.replaceChild(newBtnLoad, btnLoadModeLayout);

        const newFileInput = modeLayoutFileInput.cloneNode(true);
        modeLayoutFileInput.parentNode.replaceChild(newFileInput, modeLayoutFileInput);

        newBtnLoad.addEventListener('click', () => {
            newFileInput.click();
        });

        newFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = JSON.parse(evt.target.result);
                    if (!data.modes || !Array.isArray(data.modes)) {
                        throw new Error("Invalid format: Missing 'modes' array.");
                    }

                    // Build CLI commands to clear and apply the new layout
                    let cliCommands = "mode_color 0 0 0\n";
                    let newLinkId = 0;

                    for (const m of data.modes) {
                        // mode format: aux <link_id> <mode_id> <aux_index> <min> <max> 0
                        cliCommands += `aux ${newLinkId} ${m.modeId} ${m.channelIndex} ${m.minRange} ${m.maxRange} 0\n`;
                        newLinkId++;
                    }
                    cliCommands += "save\n";

                    // Push the action card to the AI Copilot to safely flash
                    const messageId = `msg-${Date.now()}`;
                    window.appendChatMessage(`I want to import the mode layout from **${file.name}**.`, 'user');

                    const responseHtml = `
                        <p>I have processed the <strong>${data.templateName || 'Custom'}</strong> layout template.</p>
                        <p>This layout contains <strong>${data.modes.length}</strong> mode assignments.</p>
                        <p>Review the commands below and click <strong>Approve & Flash</strong> to apply them to your flight controller.</p>
                    `;

                    window.renderAiResponse({
                        text: responseHtml,
                        commands: cliCommands
                    }, messageId);

                } catch (err) {
                    log.error("Failed to parse mode layout JSON", err);
                    alert("Error parsing file. Please ensure it is a valid BeeFlight Modes JSON template.");
                } finally {
                    newFileInput.value = ''; // Reset for next use
                }
            };
            reader.readAsText(file);
        });
    }
}

// Write the compiled mode link to the drone
async function updateModeLinkCli(linkId, modeId, auxIndex, minBound, maxBound) {
    // Mode format: aux <linkId> <modeId> <auxChannel> <min> <max> <reserved>
    let cmds = `aux ${linkId} ${modeId} ${auxIndex} ${minBound} ${maxBound} 0\n`;

    // --- Launch Control Fix ---
    if (modeId === 68) {
        const lcfg = window.CliParser ? window.CliParser.parseLaunchControl(droneState.cliDiff) : null;
        if (lcfg && lcfg.mode === 'NORMAL') {
            cmds += "set launch_control_mode = PITCHONLY\n";
        }
    }

    cmds += "save\n";
    try {
        await restoreCliData(cmds);
    } catch (e) {
        log.error("Failed to update mode link", e);
    }
}

// ---------------------------------------------------------
// Auto-Detect Switch Logic
// ---------------------------------------------------------
async function startAutoDetect(modeId, btnElement) {
    if (!droneState.connected || !serialPort) {
        alert("Drone not connected for Auto-Detect.");
        return;
    }

    autoDetectActive = true;
    currentAutoDetectModeId = modeId;
    btnElement.classList.add('listening');
    btnElement.textContent = "🔴 Listening...";

    // Get a baseline of where the switches are right now
    baselineRc = await fetchRcData();
    if (!baselineRc) {
        stopAutoDetect();
        return;
    }

    // Poll rapidly
    autoDetectInterval = setInterval(async () => {
        const liveRc = await fetchRcData();
        if (!liveRc) return;

        // Compare AUX channels against baseline
        for (let i = 0; i < liveRc.aux.length; i++) {
            const baselineVal = baselineRc.aux[i];
            const liveVal = liveRc.aux[i];
            const delta = Math.abs(liveVal - baselineVal);

            // If a switch moved by more than 200 points
            if (delta > 200) {
                stopAutoDetect(); // Got a hit!

                // Determine the new "active range" for this physical position
                let bouncePadding = 150; // padding around the exact value
                let newMin = Math.max(900, liveVal - bouncePadding);
                let newMax = Math.min(2100, liveVal + bouncePadding);

                // Round to clean 100s if close
                if (newMin < 1000) newMin = 900;
                if (newMax > 2000) newMax = 2100;

                btnElement.classList.remove('listening');
                btnElement.textContent = "✅ Snapped!";

                // UI Resolution: Update Dropdown to match the detected channel
                const selChan = document.querySelector(`#modeSelect-${modeId}`);
                if (selChan) selChan.value = i;

                // UI Resolution: Update Slider UI visually instantly
                const rangeBox = document.querySelector(`#range-${modeId}`);
                if (rangeBox) {
                    const pMinPct = ((newMin - 900) / 1200) * 100;
                    const pWidthPct = ((newMax - newMin) / 1200) * 100;
                    rangeBox.style.left = `${pMinPct}%`;
                    rangeBox.style.width = `${pWidthPct}%`;
                }

                // Update draft state so dropdown and slider stay in sync on re-render
                const targetMode = window.parsedModes.find(m => m.modeId === modeId);
                if (targetMode) {
                    targetMode.channelIndex = i;
                    targetMode.minRange = newMin;
                    targetMode.maxRange = newMax;
                    hasUnsavedChanges = true;
                    renderModesTab();
                    updateUnsavedModesUI();
                    await updateModeLinkCli(targetMode.linkId, modeId, i, newMin, newMax);
                }

                setTimeout(() => {
                    if (btnElement) btnElement.textContent = "🎧 Auto-Detect";
                }, 2000);

                return;
            }
        }
    }, 50); // Poll every 50ms for snappy feel
}

function stopAutoDetect() {
    autoDetectActive = false;
    currentAutoDetectModeId = null;
    if (autoDetectInterval) {
        clearInterval(autoDetectInterval);
        autoDetectInterval = null;
    }
    // Clean up stranded button states
    document.querySelectorAll('.btn-auto-detect.listening').forEach(b => {
        b.classList.remove('listening');
        b.textContent = "🎧 Auto-Detect";
    });
}

// Manually fetch a single MSP_RC frame
async function fetchRcData() {
    try {
        // Send request
        const req = MSP.encode(MSP.MSP_RC);
        const writer = serialPort.writable.getWriter();
        await writer.write(req);
        writer.releaseLock();

        // Let the global loop process it, we just steal the latest from a global state if we track it.
        // Or wait slightly and grab droneState.live.rc
        // For standard async flow, we rely on the main loop having updated droneState.live.rc
        await new Promise(r => setTimeout(r, 20)); // wait for response
        return droneState.live.rc;
    } catch (e) {
        return droneState.live?.rc || null; // fallback to last known
    }
}


// ---------------------------------------------------------
// Configuration Tab Rendering (Launch Control)
// ---------------------------------------------------------
function renderConfigurationTab() {
    if (!window.CliParser || !droneState.cliDiff) return;

    droneState.features = window.CliParser.parseFeatures(droneState.cliDiff);
    droneState.launchControl = window.CliParser.parseLaunchControl(droneState.cliDiff);

    const lcfg = droneState.launchControl;
    const lcPanel = document.getElementById('launch-control-panel');

    if (!lcfg || !lcfg.mode) {
        if (lcPanel) lcPanel.style.display = 'none';
        return; // firmware doesn't support launch control
    } else {
        if (lcPanel) lcPanel.style.display = 'block'; // ensure it's visible
    }

    // UI Setup
    const modeSelect = document.getElementById('launchModeSelect');
    if (modeSelect) modeSelect.value = lcfg.mode;

    const throttleSlider = document.getElementById('launchThrottleSlider');
    const throttleVal = document.getElementById('launchThrottleValue');
    if (throttleSlider && throttleVal) {
        throttleSlider.value = lcfg.triggerThrottlePercent;
        throttleVal.textContent = lcfg.triggerThrottlePercent + '%';

        throttleSlider.addEventListener('input', (e) => {
            throttleVal.textContent = e.target.value + '%';
        });
    }

    const angleSlider = document.getElementById('launchAngleSlider');
    const angleVal = document.getElementById('launchAngleValue');
    if (angleSlider && angleVal) {
        angleSlider.value = lcfg.angleLimit;
        angleVal.textContent = lcfg.angleLimit + '°';

        angleSlider.addEventListener('input', (e) => {
            angleVal.textContent = e.target.value + '°';
        });
    }

    // Guardrail Check
    const warningBanner = document.getElementById('accWarningBanner');
    if (warningBanner) {
        if (!droneState.features.acc) {
            warningBanner.classList.remove('hidden');
        } else {
            warningBanner.classList.add('hidden');
        }
    }
}

// ---------------------------------------------------------
// Global Event Listeners for Configuration Tab
// ---------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const btnSaveLaunchControl = document.getElementById('btnSaveLaunchControl');
    if (btnSaveLaunchControl) {
        btnSaveLaunchControl.addEventListener('click', async () => {
            const mode = document.getElementById('launchModeSelect').value;
            const throttle = document.getElementById('launchThrottleSlider').value;
            const angle = document.getElementById('launchAngleSlider').value;

            // Batch CLI commands
            let cmds = [
                `set launch_control_mode = ${mode}`,
                `set launch_trigger_throttle_percent = ${throttle}`,
                `set launch_angle_limit = ${angle}`
            ];

            // Setup mode mapping for AUX switch if not already matched
            // Look for existing MODE 68 logic or just save. The user handles mode mappings in the Modes Tab, 
            // but the prompt specifies: "Ensure these are batched with the set aux command for the Launch Control switch itself." 
            // Wait, we can pull the active Launch Control link from parsedModes, or inject a default link.
            // If the user hasn't set it, we will just use save, and assume the Modes Tab handles the aux definition. 
            // Better yet, let's capture the existing aux mappings for mode 68 and re-issue them so they are explicitly batched!

            if (window.parsedModes) {
                const lcModes = window.parsedModes.filter(m => m.modeId === 68);
                lcModes.forEach(m => {
                    cmds.push(`aux ${m.linkId} ${m.modeId} ${m.channelIndex} ${m.minRange} ${m.maxRange} 0`);
                });
            }

            cmds.push('save');

            const commandsList = cmds.join('\\n');

            showToast('Saving Launch Control Configuration...', 'info');
            btnSaveLaunchControl.disabled = true;

            try {
                await restoreCliData(commandsList);
                showToast('Launch Control saved successfully!', 'success');
            } catch (err) {
                log.error('Failed to save Launch Control', err);
                showToast('Failed to save Launch Control', 'error');
            } finally {
                btnSaveLaunchControl.disabled = false;
            }
        });
    }
});


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
function buildBackupBaseName() {
    const boardName = droneState.boardName || droneState.firmwareIdentifier || 'Betaflight';
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `Betaflight_Backup_${boardName}_${yyyy}-${mm}-${dd}`;
}

function buildBackupFileName() {
    return `${buildBackupBaseName()}.txt`;
}

function buildBfaiBackupFileName() {
    return `${buildBackupBaseName()}.bfai`;
}

function getBackupContent() {
    return droneState.cliDiff || '# No CLI diff captured yet.\n';
}

function getBfaiBackupContent() {
    const cliText = getBackupContent();
    const lines = cliText.split(/\r?\n/);

    let motorProtocol = null;
    for (const raw of lines) {
        const line = String(raw).trim();
        const match = line.match(/^set\s+motor_pwm_protocol\s*=\s*(\S+)/i);
        if (match) {
            motorProtocol = match[1];
            break;
        }
    }

    const payload = {
        format: 'BeeFlightBackup',
        version: 1,
        createdAt: new Date().toISOString(),
        source: 'BeeFlight AI',
        board: {
            name: droneState.boardName || null,
            firmwareId: droneState.firmwareIdentifier || null,
            firmwareVersion: droneState.firmwareVersion || null,
            mspApiVersion: droneState.mspApiVersion || null
        },
        stats: {
            lineCount: lines.length
        },
        meta: {
            motorProtocol: motorProtocol || null
        },
        cli: cliText
    };

    return JSON.stringify(payload, null, 2);
}

function triggerDownload(name, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportLocalBackup() {
    const txtName = buildBackupFileName();
    const txtContent = getBackupContent();
    triggerDownload(txtName, txtContent, 'text/plain');

    const bfaiName = buildBfaiBackupFileName();
    const bfaiContent = getBfaiBackupContent();
    triggerDownload(bfaiName, bfaiContent, 'application/json');

    showToast('Configuration downloaded as .txt and .bfai backups.', 'success');
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
- hardwareMatch: boolean (does the backup file's board_name match the live board_name?)
- versionMatch: boolean (does the Betaflight major/minor version match the live firmware?)
- fileIntegrity: boolean (does this look like a valid Betaflight dump, with headers and a terminating save command?)
- motorSafety: boolean (is the configured motor protocol a DSHOT variant, indicating safe digital throttle signaling?)
- reasoning: string (short explanation of any failures or risks).

Additional context rules:
- The JSON context may contain: headerSnippet, tailSnippet, liveBoard, liveFirmwareId, liveVersion, fileApproxLines, and motorProtocol.
- liveBoard represents the current board_name of the connected flight controller. liveFirmwareId is a short identifier such as "BTFL" and must NOT be treated as a board name.
- When checking hardwareMatch, compare the backup's board_name ONLY to liveBoard. If liveBoard is "Unknown", set hardwareMatch to false and explain the uncertainty.
- When deciding motorSafety, if motorProtocol is one of: DSHOT150, DSHOT300, DSHOT600, DSHOT1200 (case-insensitive), treat motorSafety as true. If motorProtocol is missing or a non-DSHOT value, set motorSafety to false and explain why.

General rules:
- Output ONLY raw JSON, no markdown and no extra commentary.
- If you are uncertain about any key, set it to false and explain why in the reasoning string.`;

    try {
        const apiKey = getProviderKey(activeModelId);
        let raw = await window.generateAIResponse(getActiveProviderType(), activeModelId, systemPrompt, JSON.stringify(context), apiKey);
        raw = (raw || '').trim();
        if (!raw) throw new Error('Empty validation response from AI');

        // Be tolerant of markdown fences like ```json ... ``` around the JSON
        if (raw.startsWith('```')) {
            const firstNewline = raw.indexOf('\n');
            if (firstNewline !== -1) {
                raw = raw.slice(firstNewline + 1);
            }
            const lastFence = raw.lastIndexOf('```');
            if (lastFence !== -1) {
                raw = raw.slice(0, lastFence).trim();
            }
        }

        try {
            const parsed = JSON.parse(raw);
            log.info('Backup validation result', parsed);
            return parsed;
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
        isRebooting = true; // Trigger hardware teardown blockade
        await cliWriter.write(encoder.encode('save\n'));
        updateImportProgress(100);
        logToConsole('Restore complete. FC is rebooting gracefully...', 'success');
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
// ---------------------------------------------------------
// Interactive Rates Engine (global scope)
// ---------------------------------------------------------
const RATE_PRESETS = {
    cinematic: { rcRate: 0.8, superRate: 0.5, expo: 0.4 },
    freestyle: { rcRate: 1.0, superRate: 0.7, expo: 0.2 },
    race: { rcRate: 1.0, superRate: 0.5, expo: 0.1 },
    indoor: { rcRate: 0.7, superRate: 0.55, expo: 0.6 }
};
const RATE_AXES = ['Roll', 'Pitch', 'Yaw'];
const AXIS_COLORS = { Roll: '#3b82f6', Pitch: '#22c55e', Yaw: '#f59e0b' };

function calcBFRate(rcCommand, rcRate, superRate, expo) {
    const rcCommandf = rcCommand;
    const expof = rcCommandf * (Math.pow(rcCommandf, 3) * expo + rcCommandf * (1 - expo));
    const angleRate = 200.0 * rcRate * expof;
    if (superRate > 0 && superRate < 1) {
        return angleRate * (1.0 / (1.0 - (rcCommandf * superRate)));
    }
    return angleRate;
}

function getMaxDegPerSec(rcRate, superRate, expo) {
    return Math.round(calcBFRate(1.0, rcRate, superRate, expo));
}

function readRateInputs() {
    const result = {};
    RATE_AXES.forEach(axis => {
        result[axis] = {
            rcRate: parseFloat(document.getElementById(`pid${axis}RcRate`)?.value) || 0,
            superRate: parseFloat(document.getElementById(`pid${axis}SuperRate`)?.value) || 0,
            expo: parseFloat(document.getElementById(`pid${axis}Expo`)?.value) || 0
        };
    });
    return result;
}

function updateMaxValues() {
    const rates = readRateInputs();
    RATE_AXES.forEach(axis => {
        const el = document.getElementById(`pid${axis}MaxDeg`);
        if (el) el.textContent = getMaxDegPerSec(rates[axis].rcRate, rates[axis].superRate, rates[axis].expo);
    });
}

function drawRateCurve() {
    const canvas = document.getElementById('ratesChart');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // tab not visible
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i); ctx.stroke();
        ctx.beginPath(); ctx.moveTo((w / 4) * i, 0); ctx.lineTo((w / 4) * i, h); ctx.stroke();
    }

    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.fillText('0%', 2, h - 4);
    ctx.fillText('100%', w - 32, h - 4);

    const rates = readRateInputs();
    const allMax = Math.max(
        ...RATE_AXES.map(a => getMaxDegPerSec(rates[a].rcRate, rates[a].superRate, rates[a].expo)),
        200
    );

    RATE_AXES.forEach(axis => {
        const r = rates[axis];
        ctx.strokeStyle = AXIS_COLORS[axis];
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
            const stick = i / 60;
            const degPS = calcBFRate(stick, r.rcRate, r.superRate, r.expo);
            const x = stick * w;
            const y = h - (degPS / allMax) * h;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });

    let legendX = w - 90;
    ctx.font = '11px sans-serif';
    RATE_AXES.forEach(axis => {
        ctx.fillStyle = AXIS_COLORS[axis];
        ctx.fillRect(legendX, 8, 10, 10);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(axis, legendX + 14, 17);
        legendX += 30;
    });
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.fillText(`${allMax}°/s`, 2, 14);
}

let ratesEngineWired = false;
function wireRatesEngine() {
    if (ratesEngineWired) return;
    ratesEngineWired = true;

    // Live input → redraw
    document.querySelectorAll('.rate-input').forEach(input => {
        input.addEventListener('input', () => {
            updateMaxValues();
            drawRateCurve();
            const flashBtn = document.getElementById('btnFlashRates');
            if (flashBtn) flashBtn.disabled = false;
        });
    });

    // Preset buttons
    document.querySelectorAll('.pid-template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = RATE_PRESETS[btn.getAttribute('data-template')];
            if (!preset) return;
            document.querySelectorAll('.pid-template-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            RATE_AXES.forEach(axis => {
                const rc = document.getElementById(`pid${axis}RcRate`);
                const sr = document.getElementById(`pid${axis}SuperRate`);
                const ex = document.getElementById(`pid${axis}Expo`);
                if (rc) rc.value = preset.rcRate;
                if (sr) sr.value = preset.superRate;
                if (ex) ex.value = preset.expo;
            });
            updateMaxValues();
            drawRateCurve();
            const flashBtn = document.getElementById('btnFlashRates');
            if (flashBtn) flashBtn.disabled = false;
        });
    });

    // Flash Rates button
    const flashRatesBtn = document.getElementById('btnFlashRates');
    if (flashRatesBtn) {
        flashRatesBtn.addEventListener('click', async () => {
            const rates = readRateInputs();
            const commands = [
                `set roll_rc_rate = ${Math.round(rates.Roll.rcRate * 100)}`,
                `set pitch_rc_rate = ${Math.round(rates.Pitch.rcRate * 100)}`,
                `set yaw_rc_rate = ${Math.round(rates.Yaw.rcRate * 100)}`,
                `set roll_srate = ${Math.round(rates.Roll.superRate * 100)}`,
                `set pitch_srate = ${Math.round(rates.Pitch.superRate * 100)}`,
                `set yaw_srate = ${Math.round(rates.Yaw.superRate * 100)}`,
                `set roll_expo = ${Math.round(rates.Roll.expo * 100)}`,
                `set pitch_expo = ${Math.round(rates.Pitch.expo * 100)}`,
                `set yaw_expo = ${Math.round(rates.Yaw.expo * 100)}`,
                'save'
            ];
            flashRatesBtn.disabled = true;
            flashRatesBtn.textContent = '⏳ Flashing...';
            try {
                await restoreCliData(commands.join('\n'));
                flashRatesBtn.textContent = '✅ Rates Applied!';
                setTimeout(() => { flashRatesBtn.textContent = '⚡ Flash Rates to Drone'; flashRatesBtn.disabled = false; }, 2500);
            } catch (err) {
                flashRatesBtn.textContent = '❌ Flash Failed';
                log.error('Flash rates failed', err);
                setTimeout(() => { flashRatesBtn.textContent = '⚡ Flash Rates to Drone'; flashRatesBtn.disabled = false; }, 2500);
            }
        });
    }

    // Initial draw
    updateMaxValues();
    drawRateCurve();
}

// Wire the engine on load so it works immediately without drone connection
document.addEventListener('DOMContentLoaded', () => { wireRatesEngine(); });

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

    // Populate rate inputs from parsed dynamics
    const rateAxes = ['roll', 'pitch', 'yaw'];
    rateAxes.forEach(axis => {
        const rates = dyn.rates[axis];
        if (!rates) return;
        const prefix = axis.charAt(0).toUpperCase() + axis.slice(1);
        const rcRateEl = document.getElementById(`pid${prefix}RcRate`);
        const superRateEl = document.getElementById(`pid${prefix}SuperRate`);
        const expoEl = document.getElementById(`pid${prefix}Expo`);
        if (rcRateEl) rcRateEl.value = rates.rcRate !== null ? rates.rcRate : 0;
        if (superRateEl) superRateEl.value = rates.superRate !== null ? rates.superRate : 0;
        if (expoEl) expoEl.value = rates.expo !== null ? rates.expo : 0;
    });

    // Redraw with synced values
    updateMaxValues();
    drawRateCurve();

    // Enable flash button on connected
    const flashBtn2 = document.getElementById('btnFlashRates');
    if (flashBtn2) flashBtn2.disabled = false;

    // Symptom badges wiring
    document.querySelectorAll('.symptom-badge').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.getAttribute('data-symptom-prompt');
            if (!prompt || !chatInput) return;
            chatInput.value = prompt;
            chatInput.focus();
        });
    });
}

// ---------------------------------------------------------
// Blackbox Tab Rendering
// ---------------------------------------------------------
let blackboxDropzoneWired = false;

function renderBlackboxTab() {
    const bbcfg = window.CliParser ? window.CliParser.parseBlackboxConfig(droneState.cliDiff) : null;

    const deviceEl = document.getElementById('valBboxDevice');
    const rateEl = document.getElementById('valBboxRate');
    if (deviceEl) deviceEl.textContent = bbcfg ? bbcfg.device : '—';
    if (rateEl) rateEl.textContent = bbcfg ? `${bbcfg.sampleRate} / ${bbcfg.debugMode}` : '—';

    // Intent Card Click Handlers
    document.querySelectorAll('.intent-card').forEach(card => {
        card.replaceWith(card.cloneNode(true));
    });
    document.querySelectorAll('.intent-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.intent-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const intent = card.dataset.intent;
            let message = '';
            if (intent === 'general') message = 'I want to set my Blackbox to General Flight & PID logging mode. Please give me the CLI commands.';
            else if (intent === 'filters') message = 'I want to set my Blackbox to Filter & Noise Diagnostics mode (GYRO_SCALED, max sample rate). Please give me the CLI commands.';
            else if (intent === 'disable') message = 'I want to disable Blackbox logging entirely to save storage. Please give me the CLI commands.';
            if (message) sendMessageToCopilot(message);
        });
    });

    if (bbcfg) {
        const mscBtn = document.getElementById('btnMountMsc');
        if (mscBtn) mscBtn.onclick = () => triggerMassStorage();
        const eraseBtn = document.getElementById('btnEraseFlash');
        if (eraseBtn) eraseBtn.onclick = () => sendMessageToCopilot('I want to erase my Blackbox flash storage. Please give me the CLI command and warn me about data loss.');
    }

    const scanBtn = document.getElementById('btnScanLogs');
    if (scanBtn && !scanBtn.onclick) {
        scanBtn.onclick = () => accessDroneLogs();
    }

    // Blackbox Log Analyzer (wire once)
    if (!blackboxDropzoneWired && window.BlackboxParser) {
        wireBlackboxAnalyzer();
        blackboxDropzoneWired = true;
    }
}

async function accessDroneLogs() {
    try {
        if (!('showDirectoryPicker' in window)) {
            showToast('Your browser does not support scanning directories. Please use the fallback file selector.', 'warning');
            document.getElementById('blackboxFileInput').click();
            return;
        }

        const directoryHandle = await window.showDirectoryPicker();
        const bflFiles = [];

        for await (const entry of directoryHandle.values()) {
            const name = entry.name.toLowerCase();
            if (entry.kind === 'file' && (name.endsWith('.bbl') || name.endsWith('.csv') || name.endsWith('.txt'))) {
                const file = await entry.getFile();
                bflFiles.push({ file, handle: entry });
            }
        }

        if (bflFiles.length === 0) {
            showToast('No .bbl, .csv, or .txt logs found in the selected directory.', 'warning');
            return;
        }

        const logListDiv = document.getElementById('blackboxLogList');
        const bflListUl = document.getElementById('bflList');
        if (logListDiv && bflListUl) {
            logListDiv.classList.remove('hidden');
            bflListUl.innerHTML = '';

            bflFiles.forEach(({ file, handle }) => {
                const li = document.createElement('li');
                li.className = 'bfl-item';
                const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
                li.innerHTML = `📄 ${file.name} - ${sizeMb} MB`;
                li.style.cursor = 'pointer';
                li.style.padding = '8px';
                li.style.borderBottom = '1px solid var(--border-color)';

                li.addEventListener('click', async () => {
                    const f = await handle.getFile();
                    runAnalysis(f);
                });
                bflListUl.appendChild(li);
            });
            showToast(`Found ${bflFiles.length} log files.`, 'success');
        }

    } catch (err) {
        if (err.name !== 'AbortError') {
            log.error('Error accessing drone logs directory', err);
            showToast('Failed to access directory. Try the fallback file selector.', 'error');
        }
    }
}

async function analyzeBlackboxWithAI(summary) {
    const apiKey = getProviderKey(activeModelId);
    if (!apiKey) {
        switchAIModel(activeModelId);
        throw new Error('API key required for analysis.');
    }

    const systemPrompt = `You are an elite Blackbox Flight Data Analyst for FPV drones. The user will provide a JSON summary of a parsed flight log.

You MUST respond with ONLY a valid JSON object (no markdown fences, no extra text). Use this exact schema:

{
  "flightSummary": "<2 sentences describing the flight aggressiveness and style based on maxThrottle, flightDuration, and trackingError>",
  "vibrationHealth": "<Analysis of dominantNoiseHz. Say 'Clean frame — no concerning resonances' if all axes < 80Hz or zero. Say 'Moderate vibration at XHz on [axis]' if 80-150Hz. Say 'Severe resonance at XHz on [axis] — check frame/motor mounts' if > 150Hz with high magnitude>",
  "motorHealth": "<Analysis of motorAverages. If one motor is >15% higher than the average, warn: 'Motor N is working X% harder — check props, bearings, motor screws'. If balanced, say 'All motors are within normal range'.>",
  "pidPerformance": "<Analysis of trackingError. If roll or pitch error > 40, suggest increasing P/I gains. If < 20, say 'Tracking is responsive'. Mention the specific axis.>",
  "recommendedActions": [
    {
      "intent": "<short human-readable title>",
      "summary": "<1-2 sentence explanation>",
      "commands": ["set ...", "set ...", "save"]
    }
  ]
}

RULES:
- recommendedActions MUST be an array. If no software changes are needed, use an empty array [].
- Do NOT wrap the JSON in markdown code fences. Return raw JSON only.
- Do NOT output any text outside the JSON object.
- For hardware issues (bent props, loose screws), put the warning in motorHealth text but do NOT add a recommendedAction for it.
- flightSummary should mention whether the flight was aggressive, moderate, or gentle based on maxThrottle and trackingError values.`;

    const responseText = await window.generateAIResponse(getActiveProviderType(), activeModelId, systemPrompt, JSON.stringify(summary, null, 2), apiKey);
    return responseText;
}

function renderBlackboxReport(summary, aiResponseText) {
    const dashboard = document.getElementById('blackboxReportDashboard');
    if (!dashboard) return;

    // --- Parse AI JSON (with fallback) ---
    let aiData = null;
    try {
        let cleaned = (aiResponseText || '').trim();
        // Strip markdown fences if AI wrapped it despite instructions
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }
        aiData = JSON.parse(cleaned);
    } catch (e) {
        console.warn('AI response was not valid JSON, rendering as markdown fallback.', e);
    }

    // --- Flight Stats Card ---
    const dur = document.getElementById('statDuration');
    const thr = document.getElementById('statMaxThrottle');
    const frm = document.getElementById('statFrames');
    if (dur) dur.textContent = summary.flightDuration ? `${summary.flightDuration}s` : '—';
    if (thr) thr.textContent = summary.maxThrottle ? `${summary.maxThrottle}%` : '—';
    if (frm) frm.textContent = summary.frameCount || '—';

    // --- Vibration Card ---
    const vibeStatus = document.getElementById('vibeStatus');
    const noiseRoll = document.getElementById('noiseRoll');
    const noisePitch = document.getElementById('noisePitch');
    const noiseYaw = document.getElementById('noiseYaw');
    if (noiseRoll) noiseRoll.textContent = summary.dominantNoiseHz?.roll ? `${summary.dominantNoiseHz.roll}Hz` : '0Hz';
    if (noisePitch) noisePitch.textContent = summary.dominantNoiseHz?.pitch ? `${summary.dominantNoiseHz.pitch}Hz` : '0Hz';
    if (noiseYaw) noiseYaw.textContent = summary.dominantNoiseHz?.yaw ? `${summary.dominantNoiseHz.yaw}Hz` : '0Hz';
    if (vibeStatus) {
        vibeStatus.className = 'vibe-indicator';
        if (aiData && aiData.vibrationHealth) {
            vibeStatus.textContent = aiData.vibrationHealth;
            const vt = aiData.vibrationHealth.toLowerCase();
            if (vt.includes('severe')) vibeStatus.classList.add('vibe-severe');
            else if (vt.includes('moderate')) vibeStatus.classList.add('vibe-moderate');
            else vibeStatus.classList.add('vibe-clean');
        } else {
            vibeStatus.textContent = 'Awaiting AI analysis...';
            vibeStatus.classList.add('vibe-clean');
        }
    }

    // --- Motor Health Card + Bar Chart ---
    const motorText = document.getElementById('motorHealthText');
    if (motorText) motorText.textContent = aiData?.motorHealth || 'No motor data available.';
    const motors = summary.motorAverages || [0, 0, 0, 0];
    const maxMotor = Math.max(...motors, 1);
    const avgMotor = motors.reduce((a, b) => a + b, 0) / motors.length || 1;
    for (let i = 0; i < 4; i++) {
        const bar = document.getElementById(`motorBar${i + 1}`);
        if (!bar) continue;
        const pct = Math.round((motors[i] / maxMotor) * 100);
        bar.style.height = `${Math.max(pct, 5)}%`;
        bar.className = 'motor-bar';
        if (motors[i] > avgMotor * 1.15) bar.classList.add('bar-danger');
        else if (motors[i] > avgMotor * 1.05) bar.classList.add('bar-warning');
        else bar.classList.add('bar-normal');
    }

    // --- PID Tracking Card ---
    const pidText = document.getElementById('pidPerformanceText');
    const trackRoll = document.getElementById('trackRoll');
    const trackPitch = document.getElementById('trackPitch');
    if (pidText) pidText.textContent = aiData?.pidPerformance || 'No tracking data.';
    if (trackRoll) trackRoll.textContent = summary.trackingError?.roll != null ? summary.trackingError.roll.toFixed(1) : '—';
    if (trackPitch) trackPitch.textContent = summary.trackingError?.pitch != null ? summary.trackingError.pitch.toFixed(1) : '—';

    // --- Flight Summary ---
    const summaryText = document.getElementById('reportFlightSummary');
    if (summaryText) {
        if (aiData?.flightSummary) {
            summaryText.textContent = aiData.flightSummary;
        } else if (!aiData && aiResponseText) {
            // Markdown fallback
            summaryText.innerHTML = typeof marked !== 'undefined' ? marked.parse(aiResponseText) : aiResponseText;
        } else {
            summaryText.textContent = 'Analysis complete.';
        }
    }

    // --- Recommended Actions ---
    const fixesSection = document.getElementById('reportRecommendedFixes');
    const actionCardsEl = document.getElementById('reportActionCards');
    if (fixesSection && actionCardsEl) {
        actionCardsEl.innerHTML = '';
        const actions = aiData?.recommendedActions || [];
        if (actions.length > 0) {
            fixesSection.classList.remove('hidden');
            actions.forEach(action => {
                if (typeof createActionCard === 'function') {
                    const card = createActionCard(action);
                    actionCardsEl.appendChild(card);
                } else {
                    // Fallback if createActionCard doesn't exist
                    const div = document.createElement('div');
                    div.className = 'action-card';
                    div.innerHTML = `
                        <div class="action-title">${action.intent || ''}</div>
                        <div class="action-summary">${action.summary || ''}</div>
                        <pre class="action-cli">${(action.commands || []).join('\n')}</pre>
                    `;
                    actionCardsEl.appendChild(div);
                }
            });
        } else {
            fixesSection.classList.add('hidden');
        }
    }

    dashboard.classList.remove('hidden');
}

function wireBlackboxAnalyzer() {
    const dropzone = document.getElementById('blackboxDropzone');
    const fileInput = document.getElementById('blackboxFileInput');
    const progress = document.getElementById('blackboxProgress');
    const progressBar = document.getElementById('blackboxProgressBar');
    const step1 = document.getElementById('bbStep1');
    const step2 = document.getElementById('bbStep2');
    const step3 = document.getElementById('bbStep3');
    const dashboard = document.getElementById('blackboxReportDashboard');

    if (!dropzone || !fileInput || !window.BlackboxParser) return;

    // "Close Report" button
    const closeBtn = document.getElementById('btnCloseReport');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (dashboard) dashboard.classList.add('hidden');
            if (progress) progress.classList.add('hidden');
        });
    }

    // Attach runAnalysis to global window so accessDroneLogs can use it
    window.runAnalysis = async function (file) {
        reset();
        if (progress) progress.classList.remove('hidden');
        setProgress(10, 0);

        try {
            const summary = await window.BlackboxParser.parseFile(file, (p) => setProgress(Math.min(60, p + 20), p < 40 ? 0 : 1));
            if (!summary) throw new Error('Could not parse log.');
            setProgress(70, 1);

            if (summary.message && summary.bflParsed === false) {
                renderBlackboxReport(summary, summary.message);
                setProgress(100, 2);
                return;
            }

            setProgress(80, 2);
            const aiResponse = await analyzeBlackboxWithAI(summary);
            setProgress(100, 2);

            renderBlackboxReport(summary, aiResponse);
            renderAiResponse(aiResponse);
        } catch (err) {
            log.error('Blackbox analysis failed', err);
            showToast(err.message || 'Blackbox analysis failed.', 'error');
            reset();
        }
    }

    function setProgress(pct, activeStep) {
        if (progressBar) progressBar.style.width = pct + '%';
        [step1, step2, step3].forEach((el, i) => {
            if (!el) return;
            el.classList.remove('active', 'done');
            if (i < activeStep) el.classList.add('done');
            else if (i === activeStep) el.classList.add('active');
        });
    }

    function reset() {
        if (progress) progress.classList.add('hidden');
        if (dashboard) dashboard.classList.add('hidden');
    }

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) window.runAnalysis(file);
        e.target.value = '';
    });
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
    // System Select Click Handlers (Manual selection)
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
            logToConsole(`OSD Editor manually initialized (${system.toUpperCase()}, ${window.OsdEditor.elements.length} elements)`, 'success');
        });
    });

    // Auto-Bypass Logic based on detected VTX configuration
    if (droneState.vtx && droneState.cliDiff && window.OsdEditor) {
        let detectedSystem = null;

        // If osd_displayport_device is explicitly MSP/Walksnail etc (or not NONE)
        if (droneState.vtx.isHdDigital) {
            detectedSystem = 'hd';
        } else if (droneState.vtx.hasAnalogVtxOnSerial) {
            // OR if we detected analog VTX on a serial port
            detectedSystem = 'analog';
        } else if (droneState.vtx.osdDisplayportDevice) {
            const rawRaw = String(droneState.vtx.osdDisplayportDevice).toUpperCase();
            // If it's MAX7456 or explicitly 0
            if (rawRaw === 'MAX7456' || rawRaw === '0') {
                detectedSystem = 'analog';
            }
        }

        if (detectedSystem) {
            window.OsdEditor.setVideoSystem(detectedSystem);
            window.OsdEditor.parseFromCli(droneState.cliDiff);

            const canvas = document.getElementById('osdCanvas');
            if (canvas) {
                const cols = detectedSystem === 'hd' ? 50 : 30;
                const rows = detectedSystem === 'hd' ? 18 : 16;
                canvas.style.backgroundSize = `calc(100% / ${cols}) calc(100% / ${rows})`;
            }

            // Hide system select, show editor directly
            document.getElementById('osdSystemSelect').classList.add('hidden');
            document.getElementById('osdEditor').classList.remove('hidden');

            window.OsdEditor.renderCanvas();
            logToConsole(`OSD Auto-Bypass: Detected ${detectedSystem.toUpperCase()} system. Skipping selection screen.`, 'success');
        } else {
            // Unconfigured or unknown: show manual selection screen
            document.getElementById('osdSystemSelect').classList.remove('hidden');
            document.getElementById('osdEditor').classList.add('hidden');
        }
    }

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

// ---------------------------------------------------------
// Layout: Resizable Copilot Splitter
// ---------------------------------------------------------
const copilotSplitter = document.getElementById('copilot-splitter');
const copilotPanel = document.querySelector('.copilot-panel');

if (copilotSplitter && copilotPanel) {
    let isSplitterDragging = false;
    let startX;
    let startWidth;

    copilotSplitter.addEventListener('mousedown', (e) => {
        isSplitterDragging = true;
        startX = e.clientX;
        // Get precise computed width before dragging starts
        startWidth = copilotPanel.getBoundingClientRect().width;

        copilotSplitter.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        // Prevent accidental text selection while dragging
        document.body.style.userSelect = 'none';

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isSplitterDragging) return;

        // Since panel is on the right, moving mouse left (negative delta) increases width
        const dx = startX - e.clientX;
        let newWidth = startWidth + dx;

        // Enforce bounds (matches CSS constraints)
        if (newWidth < 300) newWidth = 300;
        if (newWidth > 600) newWidth = 600;

        // Apply via flex-basis so layout flex engines respect it
        copilotPanel.style.flexBasis = `${newWidth}px`;
        copilotPanel.style.width = `${newWidth}px`; // ensure absolute width is recognized by children
    });

    document.addEventListener('mouseup', () => {
        if (isSplitterDragging) {
            isSplitterDragging = false;
            copilotSplitter.classList.remove('dragging');
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto'; // restore selection
        }
    });
}
