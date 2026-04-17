<p align="center">
  <img src="docs/logo2.png" alt="BeeFlight AI" width="160" />
</p>

# BeeFlight AI

**Conversational copilot for Betaflight FPV drone configuration.**

BeeFlight AI is a browser-based configurator that connects to your flight controller over USB (Web Serial), reads your CLI configuration, and uses an AI assistant to suggest and apply changes via structured Action Cards with Approve & Flash and Undo (Rollback).

---
**Use at your own risk.** BeeFlight AI allows you to read and write flight-controller configuration. Incorrect or incompatible settings can damage ESCs, motors, or the flight controller, and can cause loss of control, crashes, or injury. Always verify changes (including AI-suggested commands) before flying. Backup your config before applying changes. The authors and contributors are not responsible for any damage or loss resulting from use of this software.

## Overview

The standard Betaflight Configurator is powerful but assumes familiarity with UART bitmasks, PID loops, filters, and CLI syntax. BeeFlight AI reduces that barrier: you describe what you want (e.g. “change VTX to Raceband 8”, “bump pitch P”), and the Copilot proposes safe CLI changes you can apply in one click or roll back.

- **Live telemetry (MSP)** — Battery, attitude, RC channels, and tab-specific readouts.
- **Deep context (CLI)** — On connect, the app captures a `diff`/`dump` and feeds it into the AI so suggestions match your board and firmware.

---

## Features

| Area | Description |
|------|-------------|
| **AI Copilot** | Chat sidebar with context-aware Action Cards (intent, summary, CLI commands). Approve & Flash or Undo after apply. |
| **Dashboards** | Setup, Ports, Power, Receiver, Modes, Motors (diagnostic 3D props, no spin-from-browser), OSD, Blackbox, VTX, PID & Rates, Backup. |
| **Backup / Restore** | Export to local `.txt`, Google Drive, or GitHub Gists. Restore with AI pre-flight checklist (hardware, version, integrity, motor protocol) and line-by-line CLI flash. |
| **Safety** | Action Card linter blocks unsafe or mismatched commands; session history enables rollback per approval. |

---

## Requirements

- **Browser:** Chromium-based (Chrome, Edge, Brave, Opera). Web Serial is required; Safari and Firefox are not supported.
- **Node.js:** 18+ if using the included dev server.
- **AI:** At least one provider API key (e.g. Gemini) in Settings. Keys are stored only in the browser (localStorage).
- **Hardware:** Betaflight FC over USB (typically 115200 baud).

---

## Disclaimer

**Use at your own risk.** BeeFlight AI allows you to read and write flight-controller configuration. Incorrect or incompatible settings can damage ESCs, motors, or the flight controller, and can cause loss of control, crashes, or injury. Always verify changes (including AI-suggested commands) before flying. Backup your config before applying changes. The authors and contributors are not responsible for any damage or loss resulting from use of this software.

---

## Quick start

```bash
git clone https://github.com/tcdomain/Ai.git
cd Ai/BeeFlight/web-app
npm install
npm run start
```

Open **http://localhost:3000**, click **Connect Drone**, choose the FC serial port, then configure your API key in **Settings** if needed.

---

## Project layout

```
Ai/
├── BeeFlight/web-app/   # Static app (HTML, JS, CSS); run with npm run start
├── docs/                # Logo and docs
├── samples/             # Optional demo assets (e.g. videos)
└── tools/               # Helper scripts (e.g. serial CLI)
```

---

## Security

API keys and tokens are entered in the app and stored in **localStorage** only. They are sent directly to the chosen AI provider (e.g. Google, OpenAI); they are not sent to this repository’s servers.

---

## License

See repository for license information.
