<p align="center">
  <img src="docs/logo2.png" alt="BeeFlight AI bee logo" width="180" />
</p>

# 🐝 BeeFlight AI

**The intelligent, conversational copilot for FPV drone configuration.**

<p align="center">
  <!-- Note: Replace "docs/dashboard-preview.png" with the path or URL of your uploaded screenshot -->
  <img src="docs/dashboard-preview.png" alt="BeeFlight AI Dashboard" width="800" style="border-radius: 8px;" />
</p>

BeeFlight AI is a modern web application that reimagines the traditional flight controller setup process. By replacing dense, spreadsheet-like tables with an AI-driven, intent-based interface, this project democratizes FPV drone building and tuning for beginners while streamlining workflows for advanced pilots.

---

## 🎥 Video Demos

Below are autoplaying demonstrations of the BeeFlight UX and the AI Copilot in action.

### BeeFlight UX
<video src="samples/BeeFlightUx.mp4" controls autoplay loop muted playsinline width="100%" style="border-radius: 8px;"></video>

### BeeFlight AI Copilot
<video src="samples/BeeFlightUxAi.mp4" controls autoplay loop muted playsinline width="100%" style="border-radius: 8px;"></video>

---

## 🎯 The Goal

The standard open-source Betaflight Configurator is incredibly powerful, but it requires deep prerequisite knowledge of UART bitmasks, PID loops, filters, and CLI commands. 

**BeeFlight AI aims to bridge that knowledge gap.** Instead of forcing users to hunt for obscure settings, the app uses the Web Serial API to extract the drone's entire configuration and feeds it to a Google Gemini-powered Copilot. You don't need to know how to calculate a voltage divider or write a `set osd_vbat_pos` command—you just tell the AI what you want to do, and it handles the math and syntax for you.

---

## 🧠 Core Architecture (The Hybrid Engine)

This application uses a unique "Hybrid Data Architecture" to deliver both real-time UI responsiveness and deep AI context:

1. **Live Telemetry (MSP):** The app constantly polls the MultiWii Serial Protocol (MSP) to drive live UI elements like the 3D model, battery voltage, and radio stick inputs without interrupting the flight controller.
2. **Deep Context (CLI):** Upon connection, the app silently scrapes the drone's brain using the `dump` command. This massive text block is fed directly into the Gemini AI's system prompt, giving the Copilot absolute awareness of your specific hardware (e.g., "You are connected to a BetaFPV F405 running DShot300 and SBUS").

---

## ✨ Key Features & Modules

### 🤖 The AI Copilot (Agent Mode)
A persistent chat interface fixed to the right side of the screen. The Copilot is context-aware, meaning it knows exactly what drone you plugged in. Ask it to "change my VTX to Raceband 8" or "bump up my pitch P a little," and it generates structured **Action Cards**: human-readable summaries plus the exact CLI commands, wrapped in a JSON `action` block for **Approve & Flash** / **Undo (Rollback)** flows.

**Dependency Linter Engine:** Action Cards feature a built-in pre-flight linter. If the AI proposes a command that requires missing hardware (e.g., GPS or an MSP VTX), the **Interceptor UI** blocks the flash and injects a resolution dropdown, allowing you to easily map an available UART before applying.

### 📊 Modern, Read-Only Dashboards
The legacy left-hand tabs have been completely redesigned into semantic, read-only status hubs:
* **Setup:** Live battery stats, CPU load, Arming Flags, and a live 3D procedural representation of your drone's attitude.
* **Ports:** Replaces the confusing bitmask spreadsheet with a simple UI showing what "Job" is currently assigned to each UART (e.g., "UART 1: 🟢 Serial RX").
* **Power & Battery:** Displays live voltage/amperage alongside calibration settings. Features an AI math assistant for easy multimeter calibration.
* **Receiver:** Live RC channel visualizer that moves instantly when you move your physical radio sticks.
* **Modes:** Replaces complex sliders with interactive "Mode Cards" (ARM, ANGLE, TURTLE) that instantly glow green when you flip the correct physical switch on your radio.
* **Motors (Safety First):** A purely diagnostic dashboard. Features procedural 3D spinning propellers (powered by Three.js) that adapt to your exact drone geometry (Quad, Hex, etc.) and motor spin direction. Displays live RPM telemetry via Bidirectional DSHOT. *Note: Manual motor spinning via the browser is strictly disabled for safety.*
* **OSD (Hybrid Canvas):** Features one-click AI templates ("Apply Long Range Layout"), an **Elements Drawer** for dragging inactive items onto the screen, and smart auto-detection that builds the correct grid dimensions (HD 50x18 vs Analog 30x16) while accurately handling Betaflight's bitwise coordinate math behind the scenes.
* **Blackbox:** Intent-driven configuration ("Diagnose Filters" vs. "General Flight") and one-click Mass Storage (MSC) mounting.
* **VTX:** Intelligently detects if you are using Analog (SmartAudio) or HD Digital (MSP DisplayPort) and adapts the UI to prevent useless CLI commands.
* **PID Tuning & Rates:** Read-only snapshot of PID gains, rates, and filter cutoffs, plus an AI-powered *Symptom-Based* tuner (e.g. "hot motors", "propwash on descent") that proposes safe Action Cards instead of raw CLI.
* **Backup:** Dedicated Backup tab for exporting configuration to **local .txt**, **Google Drive**, or **GitHub Gists** (secret by default), with integration settings managed in the app’s Settings modal.

### 🧪 Zero-Friction Automated Testing
Includes an integrated `localStorage` mock-data pipeline. Developers can click "Capture Live Drone," save the physical drone's exact CLI dump to the browser's memory, and run autonomous QA Agent testing without needing the drone plugged in.

---

## 🧬 Backup, Restore & Time Machine

BeeFlight AI includes a full **backup/restore pipeline** designed around safety and reversibility:

- **Multi-destination export:** One-click export of the live `diff all` to:
  - Local download (`.txt` file with board name + date)
  - Google Drive (via Drive API with `drive.file` scope)
  - GitHub Gists (PAT-based auth, secret by default unless you opt-in to public)
- **AI Pre-Flight Checklist (Restore):**
  - When you select a backup file, only a small header/tail snippet is sent to Gemini, along with live `board_name` and firmware version.
  - The **Betaflight Safety Inspector** returns a strict JSON object with:
    - `hardwareMatch` — does the backup target match the connected FC?
    - `versionMatch` — are Betaflight major/minor versions compatible?
    - `fileIntegrity` — does it look like a valid dump, ending in `save`?
    - `motorSafety` — is the motor protocol a DSHOT variant?
  - A visual checklist in the UI must pass all four items before the "Overwrite Current Settings" button unlocks.
- **Safe line-by-line flasher:** Restores run through a guarded CLI pipeline that:
  - Enters CLI mode, sends each line with small delays, tracks progress, then issues a final `save`.
  - Handles FC reboot gracefully and guides the user to reconnect.
- **Session History & Undo:** Every AI Action Card approval snapshots the previous CLI dump into `sessionHistory`. If something feels wrong, the **Undo (Rollback)** button uses the same flasher to replay the last known-good configuration, then marks the card as **“⏪ Rollback Complete”**.

## 🚀 Getting Started

### Prerequisites
* A Chromium-based web browser (Google Chrome, Microsoft Edge, Brave, or Opera). *Note: Safari and Firefox do not currently support the Web Serial API.*
* A valid **Google Gemini API Key**.
* An FPV Drone running Betaflight.

### Installation & Usage
1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/tcdomain/Ai.git
   ```
