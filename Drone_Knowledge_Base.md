# Pavo Femto + DJI O4 System Knowledge Base

This document contains a record of all the specific configurations, quirks, and fixes applied to get the BetaFPV Pavo Femto (DJI O4 PNP version) working perfectly with the DJI Goggles 3 and DJI FPV Remote Controller 3.

## 1. Hardware Overview
*   **Drone:** BetaFPV Pavo Femto (PNP Version)
*   **Video System:** DJI O4 Air Unit
*   **Controller:** DJI FPV Remote Controller 3 (RC3)
*   **Goggles:** DJI Goggles 3
*   **Connection Protocol:** SBUS via the DJI O4 Air Unit (no external ELRS receiver needed).

## 2. DJI O4 OSD (On-Screen Display) Fixes
Getting the Betaflight OSD to show up on the newest DJI Goggles 3 required specific settings. Manually setting canvas sizes in the CLI is no longer recommended and can break the link. 

**The Working Solution:**
1.  Betaflight must be configured to send **MSP DisplayPort** data over **UART 4** (the default port for the Air Unit).
2.  Apply the official Betaflight Preset: **"OSD for FPV.WTF, DJI O3, Avatar HD"**. 
    *   *This applies the correct hidden font structures for the DJI system.*
3.  In the DJI Goggles 3, go to **Settings > Display** (or Camera > Advanced) and set **Canvas Mode / Custom OSD** to **HD**.
4.  **Important Quirk:** The drone battery must be plugged in and connected *before* you toggle the Canvas Mode to HD in the goggles, otherwise the goggles won't render it.

## 3. Flight Controller Settings (Air Mode)
By default, Betaflight has a feature called **"Air Mode"** permanently enabled. 
*   **The Problem:** When flying indoors, if you crash and the drone is stuck on the ground, Air Mode tries to auto-correct the level aggressively. This causes the motors to spool up violently on the floor.
*   **The Fix:** We ran `feature -AIRMODE` in the Betaflight CLI to disable it from always running. We then tied Air Mode activation to only turn on when you switch into full Acro mode (M position on the RC3).

## 4. Indoor / Beginner Controller Mapping
To make the RC3 safer for indoor learning, the switches were entirely re-mapped using the Betaflight `Modes` tab.

**Physical Layout to Betaflight AUX Channels:**
*   AUX 1: N/S/M Switch (Left Side)
*   AUX 2: 3-Position Switch (Right Side)
*   AUX 3: RTH Button (Top Left Inner)
*   AUX 4: Start/Stop Button (Top Right Inner)

**The Logic:**
| Switch/Button | Betaflight Mode | Function Description |
| :--- | :--- | :--- |
| **Start/Stop (AUX 4)** | `ARM` | Starts and stops the motors. Using a firm button press prevents accidental mid-air disarming. |
| **N/S/M Switch (AUX 1)** | `ANGLE` / `HORIZON` | **N:** Angle Mode (Maximum stability, no flips). <br>**S:** Horizon Mode (Stability + allowed flips if pushed hard). <br>**M:** Acro/Manual Mode + Air Mode |
| **Right Toggle (AUX 2)** | `FLIP OVER AFTER CRASH` | Pushed UP: Activates **Turtle Mode**. Allows you to flip an upside-down drone back over using the right joystick without walking to it. |
| **RTH Button (AUX 3)** | `BEEPER` | Pressed: Activates the motor beepers to help find the drone if it gets lost behind furniture. |

## 5. Helpful Betaflight CLI Commands Used
If you ever need to reset or check the values we configured, here are the raw commands used:
*   Enable Flight Mode OSD Warning: `set osd_flymode_pos = 2081`
*   Enable Warnings OSD Element (Shows AIR mode): `set osd_warnings_pos = 2088`
*   Set Video format to HD: `set vcd_video_system = HD`

*End of Knowledge Base.*
