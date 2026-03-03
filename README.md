<p align="center">
  <img src="DroneBuild/logo.png" alt="BeeFlight AI bee logo" width="180" />
</p>

# 🐝 BeeFlight AI

**The intelligent, conversational copilot for FPV drone configuration.**

BeeFlight AI is a modern web application that reimagines the traditional flight controller setup process. By replacing dense, spreadsheet-like tables with an AI-driven, intent-based interface, this project democratizes FPV drone building and tuning for beginners while streamlining workflows for advanced pilots.

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

### 🤖 The AI Copilot
A persistent chat interface fixed to the right side of the screen. The Copilot is context-aware, meaning it knows exactly what drone you plugged in. Ask it to "change my VTX to Raceband 8" or "calculate my voltage scale," and it will generate the exact Betaflight CLI commands required.

### 📊 Modern, Read-Only Dashboards
The legacy left-hand tabs have been completely redesigned into semantic, read-only status hubs:
* **Setup:** Live battery stats, CPU load, Arming Flags, and a live 3D procedural representation of your drone's attitude.
* **Ports:** Replaces the confusing bitmask spreadsheet with a simple UI showing what "Job" is currently assigned to each UART (e.g., "UART 1: 🟢 Serial RX").
* **Power & Battery:** Displays live voltage/amperage alongside calibration settings. Features an AI math assistant for easy multimeter calibration.
* **Receiver:** Live RC channel visualizer that moves instantly when you move your physical radio sticks.
* **Modes:** Replaces complex sliders with interactive "Mode Cards" (ARM, ANGLE, TURTLE) that instantly glow green when you flip the correct physical switch on your radio.
* **Motors (Safety First):** A purely diagnostic dashboard. Features procedural 3D spinning propellers (powered by Three.js) that adapt to your exact drone geometry (Quad, Hex, etc.) and motor spin direction. Displays live RPM telemetry via Bidirectional DSHOT. *Note: Manual motor spinning via the browser is strictly disabled for safety.*
* **OSD (Hybrid Canvas):** Features one-click AI templates ("Apply Long Range Layout") alongside a smart drag-and-drop HTML canvas that automatically supports both HD Digital and Analog grid sizes.
* **Blackbox:** Intent-driven configuration ("Diagnose Filters" vs. "General Flight") and one-click Mass Storage (MSC) mounting.
* **VTX:** Intelligently detects if you are using Analog (SmartAudio) or HD Digital (MSP DisplayPort) and adapts the UI to prevent useless CLI commands.

### 🧪 Zero-Friction Automated Testing
Includes an integrated `localStorage` mock-data pipeline. Developers can click "Capture Live Drone," save the physical drone's exact CLI dump to the browser's memory, and run autonomous QA Agent testing without needing the drone plugged in.

---

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
