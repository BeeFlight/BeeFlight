# DJI Remote Controller 3 (RC3) - Indoor Learning Setup

This document outlines the custom Betaflight switch layout configured for indoor and beginner flight using the DJI RC3 and the Pavo Femto.

## Controller Interface Diagram

```mermaid
flowchart TD
    classDef switch fill:#1e88e5,color:#fff,stroke:#fff,stroke-width:2px;
    classDef btn fill:#d32f2f,color:#fff,stroke:#fff,stroke-width:2px;
    classDef action fill:#4caf50,color:#fff,stroke:#fff,stroke-width:1px;
    classDef default fill:#424242,color:#fff,stroke:#fff,stroke-width:1px;

    subgraph DJI FPV Remote Controller 3 (Top View)
        direction LR
        Left[Left Side Controls]:::default
        Right[Right Side Controls]:::default
        
        Left --> NSM["N/S/M Switch (AUX 1)"]:::switch
        Left --> RTH["RTH Button (AUX 3)"]:::btn
        
        Right --> RIGHT_SW["Right Switch (AUX 2)"]:::switch
        Right --> START_STOP["Start/Stop Button (AUX 4)"]:::btn
    end
    
    NSM --> ModeAngle["N: Angle Mode<br>(Self-Levels, Max Stability)"]:::action
    NSM --> ModeHorizon["S: Horizon Mode<br>(Self-Levels, Allows Flips)"]:::action
    NSM --> ModeAcro["M: Acro + Air Mode<br>(Full Manual, No Limits)"]:::action
    
    RTH --> Beeper["Press: Beeper<br>(Loudly beeps to find lost drone)"]:::action
    
    START_STOP --> Arm["Press: ARM / DISARM<br>(Spins up motors for flight)"]:::action
    
    RIGHT_SW --> ModeTurtle["UP: Turtle Mode<br>(Pushes drone over after a crash)"]:::action
```

## Detailed Breakdown

### 1. Master Arming (Starts Motors)
*   **Button:** `Start/Stop Button` (Top Right, inner button)
*   **Usage:** Press this once deliberately to ARM the drone. Press it again to DISARM if you are about to crash to immediately kill the motors.
*   **Safety Note:** Using a button instead of a toggle for Arming minimizes the chance of you accidentally bumping a switch while flying indoors and dropping out of the sky.

### 2. Flight Modes
*   **Switch:** `N/S/M Switch` (Top Left, 3-position toggle)
*   **N (Normal/Angle):** Safest mode. The drone will forcefully keep itself flat. If you let go of the right stick, the drone will instantly level out. It physically stops you from flipping upside down. This is what you should use to learn!
*   **S (Sport/Horizon):** Intermediate mode. It auto-levels like Angle mode, but if you push the stick 100% to the edge, it will do a flip or roll.
*   **M (Manual/Acro):** Advanced mode. The drone will stick exactly pointing where you leave it. You have to manually counter-steer to fly flat. *Air Mode* is permanently tied to this position so that flips and diving outdoors are smooth.

### 3. Recovery: Turtle Mode
*   **Switch:** `Right Toggle Switch` (Top Right, 3-position toggle)
*   **Usage:** Indoors, you will eventually crash upside down (or against a wall). Instead of walking over to pick it up, DISARM the motors, push this switch `UP` into Turtle Mode, and then pulse the right stick in the direction you want to roll. The drone will fire up two motors in reverse and flip itself over onto its feet. Flip this switch `DOWN` when finished, and re-arm to fly away.

### 4. Recovery: Lost Drone Beeper
*   **Button:** `RTH Button` (Top Left, inner button)
*   **Usage:** If you crash indoors (under a couch) or outdoors in tall grass and can't find it, press this button. The motors will emit a loud chirping sound to help you track it down.

---
*Created per user request for Pavo Femto / Betaflight configuration.*
