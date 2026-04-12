// rates3D.js - Handles the live 3D drone visualizer on the Rates page

class RatesVisualizer {
    constructor() {
        this.container = document.getElementById('rates3dContainer');
        this.overlay = document.getElementById('rates3dOverlay');
        this.btnReset = document.getElementById('btnReset3D');

        if (!this.container) return;

        this.scene = new THREE.Scene();
        this.scene.background = null; // transparent to show container background

        // Use container dimensions, but default to 1 if it's currently hidden (0 width)
        const width = this.container.clientWidth || 400;
        const height = this.container.clientHeight || 200;

        this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        this.camera.position.set(2, 2, 3);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.addLighting();
        this.buildDroneModel();

        this.frameId = null;
        this.lastTime = performance.now();
        this.gamepadIndex = null;

        if (this.btnReset) {
            this.btnReset.addEventListener('click', () => {
                this.droneGroup.rotation.set(0, 0, 0);
            });
        }

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        if (!this.container || this.container.clientWidth === 0) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    addLighting() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 5);
        this.scene.add(dirLight);
    }

    buildDroneModel() {
        this.droneGroup = new THREE.Group();

        // Central Body
        const bodyGeo = new THREE.BoxGeometry(1, 0.2, 1);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.droneGroup.add(body);

        // Arms (X-configuration)
        const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4);
        const armMat = new THREE.MeshPhongMaterial({ color: 0x444444 });

        const arm1 = new THREE.Mesh(armGeo, armMat);
        arm1.rotation.y = Math.PI / 4;
        arm1.rotation.z = Math.PI / 2;
        this.droneGroup.add(arm1);

        const arm2 = new THREE.Mesh(armGeo, armMat);
        arm2.rotation.y = -Math.PI / 4;
        arm2.rotation.z = Math.PI / 2;
        this.droneGroup.add(arm2);

        // Motors & Props (Simple visual representations)
        const dist = 0.7; // distance from center
        const positions = [
            { x: dist, z: dist, color: 0xff0000 },   // Front Right (Red)
            { x: -dist, z: dist, color: 0xff0000 },  // Front Left (Red)
            { x: dist, z: -dist, color: 0xaaaaaa },  // Back Right (Gray)
            { x: -dist, z: -dist, color: 0xaaaaaa }  // Back Left (Gray)
        ];

        const motorGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.15);
        const propGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 12);

        positions.forEach(pos => {
            const mMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
            const motor = new THREE.Mesh(motorGeo, mMat);
            motor.position.set(pos.x, 0.15, pos.z);
            this.droneGroup.add(motor);

            const pMat = new THREE.MeshBasicMaterial({ color: pos.color, transparent: true, opacity: 0.6 });
            const prop = new THREE.Mesh(propGeo, pMat);
            prop.position.set(pos.x, 0.25, pos.z);
            this.droneGroup.add(prop);
        });

        // Add Front Indicator (arrow/stripe)
        const frontGeo = new THREE.BoxGeometry(0.4, 0.22, 0.2);
        const frontMat = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        const front = new THREE.Mesh(frontGeo, frontMat);
        front.position.set(0, 0, 0.4);
        this.droneGroup.add(front);

        this.scene.add(this.droneGroup);
    }

    start() {
        if (!this.frameId) {
            this.lastTime = performance.now();
            // Force a resize check in case container was hidden during init
            this.onResize();
            this.loop();
        }
    }

    stop() {
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    loop() {
        this.frameId = requestAnimationFrame(() => this.loop());

        const now = performance.now();
        const dt = (now - this.lastTime) / 1000; // delta time in seconds
        this.lastTime = now;

        this.pollGamepadAndApplyRates(dt);
        this.renderer.render(this.scene, this.camera);
    }

    pollGamepadAndApplyRates(dt) {
        const gamepads = navigator.getGamepads();
        let activePad = null;

        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i] && gamepads[i].axes.length >= 4) {
                activePad = gamepads[i];
                break;
            }
        }

        if (!activePad) {
            if (this.overlay) this.overlay.classList.remove('hidden');
            return;
        }

        if (this.overlay) this.overlay.classList.add('hidden');

        // Map typical axes (Depends on radio/OS. Common layout: 0=Yaw, 1=Throttle, 2=Roll, 3=Pitch)
        // Adjust these indices based on generic gamepad mapping.
        // Usually: Left Stick X = 0 (Yaw), Left Stick Y = 1 (Throttle)
        //          Right Stick X = 2 (Roll), Right Stick Y = 3 (Pitch)
        // Y axes are usually inverted (negative is up).
        const rcYaw = activePad.axes[0] || 0;
        const rcRoll = activePad.axes[2] || 0;
        const rcPitch = -(activePad.axes[3] || 0); // Invert so stick forward = pitch down (positive rotation natively if not careful, we'll map correctly below)

        // Read current rate settings from UI
        const rates = this.getCurrentRates();

        // Calculate Setpoints (deg/sec) using Betaflight Actual Rates formula
        const rollDegSec = this.calculateActualRate(rcRoll, rates.roll);
        const pitchDegSec = this.calculateActualRate(rcPitch, rates.pitch);
        const yawDegSec = this.calculateActualRate(rcYaw, rates.yaw);

        // Convert to radians and apply over deltaTime
        // In Three.js: X is pitch (tilt forward/back), Y is yaw (spin left/right), Z is roll (tilt left/right)
        // Warning: Euler angles order usually 'XYZ'. We will apply local rotations.

        const radRoll = THREE.MathUtils.degToRad(-rollDegSec * dt); // negative because right stick tilts right (negative Z rotation)
        const radPitch = THREE.MathUtils.degToRad(pitchDegSec * dt); // Forward pitch (positive X rotation assuming Z is front)
        const radYaw = THREE.MathUtils.degToRad(-yawDegSec * dt); // negative because stick right = clockwise spin (negative Y)

        // Apply local rotations so they accumulate correctly relative to the drone's current orientation
        this.droneGroup.rotateX(radPitch);
        this.droneGroup.rotateY(radYaw);
        this.droneGroup.rotateZ(radRoll);
    }

    getCurrentRates() {
        return {
            roll: {
                rcRate: parseFloat(document.getElementById('pidRollRcRate')?.value || 0),
                superRate: parseFloat(document.getElementById('pidRollSuperRate')?.value || 0),
                expo: parseFloat(document.getElementById('pidRollExpo')?.value || 0)
            },
            pitch: {
                rcRate: parseFloat(document.getElementById('pidPitchRcRate')?.value || 0),
                superRate: parseFloat(document.getElementById('pidPitchSuperRate')?.value || 0),
                expo: parseFloat(document.getElementById('pidPitchExpo')?.value || 0)
            },
            yaw: {
                rcRate: parseFloat(document.getElementById('pidYawRcRate')?.value || 0),
                superRate: parseFloat(document.getElementById('pidYawSuperRate')?.value || 0),
                expo: parseFloat(document.getElementById('pidYawExpo')?.value || 0)
            }
        };
    }

    /**
     * Betaflight 'Actual Rates' Formula
     * Center = Center Sensitivity (deg/s)
     * Max = Max Rate (deg/s)
     * Expo = Curve stiffness [0, 1]
     */
    calculateActualRate(rcInput, rateProfile) {
        const rcCommand = Math.abs(rcInput); // 0 to 1
        const sign = Math.sign(rcInput);

        const center = rateProfile.rcRate * 10; // Actually 'Center Sensitivity' in Actual Rates is commonly represented directly, but if sliders use 0-3... wait, Actual uses 0-1000 typically. 
        // For BF 4.3+ Actual Rates:
        // Center Sensitivity is usually 10-500
        // Max Rate is usually 10-1999
        // Let's adapt based on standard inputs. Assuming standard Actual Rates:

        // The standard UI exposes inputs as: rcRate (center), superRate (max), expo
        // If they are mapped as standard 0-3 for Betaflight Legacy Rates, the formula is different.
        // Let's assume the UI currently holds legacy Betaflight Rates inputs for now given standard max="3" and max="1".

        // Betaflight Legacy Rates formula:
        if (rcCommand <= 0.01) return 0;
        const rcRate = rateProfile.rcRate;
        const superRate = rateProfile.superRate;
        const expo = rateProfile.expo;

        // Apply expo
        const rcCommandExpo = rcCommand * Math.pow(rcCommand, 3) * expo + rcCommand * (1 - expo);

        // Apply RC Rate
        let angleRate = 200 * rcRate * rcCommandExpo;

        // Apply Super Rate
        let superFactor = 1.0 - (rcCommand * superRate);
        if (superFactor < 0.01) superFactor = 0.01;

        angleRate = angleRate / superFactor;

        return angleRate * sign;
    }
}

// Global instance 
window.rates3DVisualizer = null;

function initRates3D() {
    if (!window.rates3DVisualizer) {
        window.rates3DVisualizer = new RatesVisualizer();
    }
    window.rates3DVisualizer.start();
}

function stopRates3D() {
    if (window.rates3DVisualizer) {
        window.rates3DVisualizer.stop();
    }
}

// Ensure the initial render works if the container size changes
window.addEventListener('resize', () => {
    if (window.rates3DVisualizer) {
        window.rates3DVisualizer.onResize();
    }
});
