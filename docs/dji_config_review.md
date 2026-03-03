# DJI Controller 2 Typical Setup

## Switches (AUX Channels)
The DJI Controller 2 has a specific layout for its switches that maps to Betaflight AUX channels:
*   **Start/Stop Button (Arming):** Usually maps to `AUX 1`
*   **3-Position Switch (Fly Modes - N/S/M or C/N/S):** Usually maps to `AUX 2`
*   **C1 Button (Turtle Mode/Flip Over After Crash):** Usually maps to `AUX 3`
    *(Note: exact AUX mapping can sometimes vary slightly based on stick mode, but this is standard)*

## Current Pavo Femto Configuration
I pulled the full configuration diff from your drone, and it looks like BetaFPV already applied a custom tune specifically for indoor/cinematic flying!

### Current Switch Setup (Modes Tab)
*   **Arming:** Set to `AUX 1` (This perfectly matches the DJI Controller's Start/Stop button).
*   **Angle/Horizon Modes:** Set to `AUX 2` (This perfectly matches the DJI Controller's 3-position switch).
*   **Turtle Mode (Flip Over After Crash):** Set to `AUX 3` (This matches the C1 button).

### Current PIDs and Rates
BetaFPV has pre-loaded a profile named **"faminsid"** (likely "Femto Indoor") and a rate profile called **"rateindo"**.
*   **Motor Output Limit:** They set it to `50%`. This is a huge reduction, making the drone much tamer and safer for flying indoors.
*   **Rates:** 
    *   Roll/Pitch: RC Rate 1.0, sRate 0.40, Expo 0.40
    *   Yaw: RC Rate 1.0, sRate 0.25, Expo 0.50
    *   *These rates are very slow and cinematic, perfect for smooth flying with the DJI Controller 2.*

## What this means for you
Actually, your drone is already **perfectly configured** for the DJI Controller 2! The switches are mapped to the exact AUX channels the DJI controller outputs, and the PIDs/Rates are already tuned for smooth, indoor flight.

### Do you want to change anything?
If you plan to fly outside and want it to be faster/more aggressive, we need to:
1. Increase the motor output limit back towards 100%.
2. Increase the rates (sRate) so the drone spins faster.

Would you like me to leave it on the safe "Indoor" tune, or would you like me to create an "Outdoor" profile for you to switch to?
