# Pavo Femto + DJI O4 System Knowledge Base

## 1. Hardware
- **Drone:** BetaFPV Pavo Femto (DJI O4 PNP)
- **Flight Controller:** BETAFPVF405 running Betaflight 4.5.0
- **Video System:** DJI O4 Air Unit
- **Controller:** DJI FPV Remote Controller 3 (RC3)
- **Goggles:** DJI Goggles 3
- **Protocol:** SBUS via the DJI O4 Air Unit (no external ELRS receiver)

## 2. Controller Layout
See [DJI_RC3_Indoor_Layout.md](./DJI_RC3_Indoor_Layout.md) for the full diagram.

| Button/Switch | AUX | Function |
|:---|:---|:---|
| Start/Stop | AUX 4 | ARM / Disarm |
| N/S/M Switch | AUX 1 | N=Angle, S=Horizon, M=Acro+AirMode |
| Right Switch | AUX 2 | DOWN=Indoor, MID=Outdoor, UP=Turtle |
| C1 Button | AUX 5 | Beeper (find drone) |
| RTH Button | AUX 3 | Unassigned |

## 3. Indoor/Outdoor Profile Switching
The right switch (`adjrange`) automatically selects both PID and rate profiles:
- **DOWN → Profile 0 (Indoor):** 50% motor limit, expo 55, super rate 40
- **MIDDLE → Profile 1 (Outdoor):** 100% motor limit, expo 30, super rate 70
- **UP → Turtle Mode**

## 4. DJI O4 OSD Fix
To get Betaflight OSD showing on DJI Goggles 3:
1. UART 4 must have MSP DisplayPort enabled (`serial 4 64 115200 57600 0 115200`)
2. `set osd_displayport_device = MSP`
3. Apply the Betaflight Preset: **"OSD for FPV.WTF, DJI O3, Avatar HD"** (maps to UART 4)
4. In DJI Goggles 3: **Settings > Display > Canvas Mode = HD**
5. **Quirk:** Drone battery must be plugged in before toggling Canvas Mode

## 5. Air Mode Fix
- Factory had `AIRMODE` always on → causes motors to spool on the ground after crash
- Fixed with `feature -AIRMODE` and tied Air Mode to activate only in Acro (M position)

## 6. Config Improvements Applied
| Setting | Factory | Current | Why |
|:---|:---|:---|:---|
| Beepers (BAT_LOW etc.) | Disabled | **Enabled** | Battery damage prevention |
| `dshot_idle_value` | 1000 | **550** | Less ground aggression |
| `rc_smoothing_*_cutoff` | 12 | **25** | Snappier sticks |
| `tpa_breakpoint` | 1320 | **1500** | Better PID authority |

## 7. Useful CLI Commands
```
# Backup entire config
diff all

# Restore config (paste the diff all output into CLI)
# It will replay everything

# Check active profile
status

# Switch profiles manually
profile 0    # Indoor
profile 1    # Outdoor
rateprofile 0
rateprofile 1
save
```
