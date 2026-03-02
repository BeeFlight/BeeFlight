# DJI Remote Controller 3 — Pavo Femto Layout

## Quick Reference

```mermaid
flowchart TD
    classDef switch fill:#1e88e5,color:#fff,stroke:#fff,stroke-width:2px
    classDef btn fill:#d32f2f,color:#fff,stroke:#fff,stroke-width:2px
    classDef action fill:#4caf50,color:#fff,stroke:#fff,stroke-width:1px
    classDef default fill:#424242,color:#fff,stroke:#fff,stroke-width:1px

    subgraph TOP VIEW
        direction LR
        Left[Left Side]:::default
        Right[Right Side]:::default

        Left --> NSM["N/S/M Switch<br>(AUX 1)"]:::switch
        Left --> RTH["RTH Button<br>(AUX 3)"]:::btn

        Right --> RIGHT_SW["Right Switch<br>(AUX 2)"]:::switch
        Right --> START_STOP["Start/Stop<br>(AUX 4)"]:::btn

        Left --> C1["C1 Button<br>(AUX 5)"]:::btn
    end

    NSM --> N["N: Angle Mode"]:::action
    NSM --> S["S: Horizon Mode"]:::action
    NSM --> M["M: Acro + Air Mode"]:::action

    RIGHT_SW --> DOWN["DOWN: Indoor Profile<br>50% power, soft sticks"]:::action
    RIGHT_SW --> MID["MIDDLE: Outdoor Profile<br>100% power, fast sticks"]:::action
    RIGHT_SW --> UP["UP: Turtle Mode<br>(flip over after crash)"]:::action

    START_STOP --> ARM["ARM / DISARM<br>(start/stop motors)"]:::action
    C1 --> BEEP["Beeper<br>(find lost drone)"]:::action
    RTH --> FREE["Unassigned"]:::default
```

## How to Fly

### Before Takeoff
1. **Choose environment** — Right Switch **DOWN** (indoor) or **MIDDLE** (outdoor)
2. **Choose flight mode** — N/S/M to **N** (Angle for learning)
3. **Arm** — Press **Start/Stop**. Motors spin up.
4. **Fly!** Raise throttle gently.

### LED Colors
| LED Color | Meaning |
|:---|:---|
| 🟠 Orange | Disarmed |
| 🟢 Green | Indoor + Angle Mode |
| 🔵 Blue | Indoor + Horizon Mode |
| 🟡 Yellow | Outdoor Mode (any flight mode) |
| 🔴 Flashing | Low battery — land now! |

### After a Crash
- **Upside down?** → Disarm → Right Switch **UP** (Turtle) → push stick to roll → switch **DOWN** → re-arm
- **Lost the drone?** → Press **C1** → listen for beeping

## Profile Comparison

| | Indoor (Switch DOWN) | Outdoor (Switch MID) |
|:---|:---|:---|
| Motor Power | 50% | 100% |
| Stick Expo | 55 (soft) | 30 (snappy) |
| Super Rate | 40 (slow) | 70 (fast) |
| Best For | Living room, hallways | Yard, park, field |
