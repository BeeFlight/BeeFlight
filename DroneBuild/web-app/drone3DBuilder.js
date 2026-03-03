// =========================================================
// drone3DBuilder.js — Procedural Three.js Drone Visualizer
// Generates a quad drone model from parsed mixer/motor config
// =========================================================

const Drone3D = {
    scene: null,
    camera: null,
    renderer: null,
    propellers: [],       // Array of { mesh, direction } for animation
    animationId: null,
    rpms: [0, 0, 0, 0],  // Live RPM data from MSP_MOTOR_TELEMETRY

    /**
     * Initialize the 3D scene inside the given container element.
     * @param {HTMLElement} container - The DOM element to mount the canvas
     * @param {Object} motorConfig - Parsed motor config from cliParser
     */
    init(container, motorConfig) {
        if (!container) {
            console.warn('No container provided for 3D visualizer.');
            return;
        }
        if (typeof THREE === 'undefined') {
            console.warn('Three.js not available for 3D visualizer.');
            // Graceful fallback: show a simple placeholder message instead of a blank area
            const msg = document.createElement('div');
            msg.textContent = '3D motor visualizer unavailable (Three.js failed to load).';
            msg.style.padding = '16px';
            msg.style.textAlign = 'center';
            msg.style.color = '#9CA3AF';
            msg.style.fontSize = '0.9rem';
            container.innerHTML = '';
            container.appendChild(msg);
            return;
        }

        // Clean up any existing renderer
        if (this.renderer) {
            this.dispose();
        }

        const width = container.clientWidth;
        const height = container.clientHeight || 400;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d1117);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.camera.position.set(0, 5, 7);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(5, 10, 7);
        this.scene.add(directional);
        const pointLight = new THREE.PointLight(0x00f0ff, 0.5, 20);
        pointLight.position.set(0, 3, 0);
        this.scene.add(pointLight);

        // Build the drone
        this._buildDrone(motorConfig);

        // Grid helper
        const grid = new THREE.GridHelper(10, 20, 0x1a2332, 0x1a2332);
        this.scene.add(grid);

        // Start animation
        this._animate();

        // Handle resize
        this._resizeHandler = () => {
            const w = container.clientWidth;
            const h = container.clientHeight || 400;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        };
        window.addEventListener('resize', this._resizeHandler);
    },

    /**
     * Build the procedural drone geometry.
     */
    _buildDrone(motorConfig) {
        const yawReversed = motorConfig && motorConfig.yawReversed === 'ON';

        // Hub (central body)
        const hubGeom = new THREE.BoxGeometry(0.8, 0.2, 0.8);
        const hubMat = new THREE.MeshPhongMaterial({ color: 0x2d333b, emissive: 0x0a0f14 });
        const hub = new THREE.Mesh(hubGeom, hubMat);
        hub.position.y = 0.3;
        this.scene.add(hub);

        // Camera nub (front indicator)
        const camGeom = new THREE.BoxGeometry(0.15, 0.15, 0.25);
        const camMat = new THREE.MeshPhongMaterial({ color: 0xef4444 });
        const cam = new THREE.Mesh(camGeom, camMat);
        cam.position.set(0, 0.35, -0.5);
        this.scene.add(cam);

        // Front direction arrow
        const arrowGeom = new THREE.ConeGeometry(0.08, 0.2, 8);
        const arrowMat = new THREE.MeshPhongMaterial({ color: 0xef4444 });
        const arrow = new THREE.Mesh(arrowGeom, arrowMat);
        arrow.position.set(0, 0.35, -0.75);
        arrow.rotation.x = Math.PI / 2;
        this.scene.add(arrow);

        // Motor positions for QUADX layout (viewed from top, front = -Z)
        // Motor 1: Front-Right, Motor 2: Front-Left
        // Motor 3: Back-Right,  Motor 4: Back-Left
        const armLength = 2.0;
        const positions = [
            { x: armLength * 0.7, z: -armLength * 0.7 }, // M1: FR
            { x: -armLength * 0.7, z: -armLength * 0.7 }, // M2: FL
            { x: armLength * 0.7, z: armLength * 0.7 }, // M3: BR
            { x: -armLength * 0.7, z: armLength * 0.7 }, // M4: BL
        ];

        // Standard QUADX: Props In (default) = M1 CW, M2 CCW, M3 CCW, M4 CW
        // yaw_motors_reversed = ON (Props Out) reverses all
        const defaultDirs = [1, -1, -1, 1]; // 1 = CW, -1 = CCW
        const directions = yawReversed
            ? defaultDirs.map(d => -d)
            : defaultDirs;

        const motorColors = [0x00f0ff, 0x10b981, 0xf59e0b, 0x8b5cf6]; // Cyan, Green, Amber, Purple

        this.propellers = [];

        positions.forEach((pos, i) => {
            // Arm
            const armGeom = new THREE.CylinderGeometry(0.04, 0.04, armLength, 8);
            const armMat = new THREE.MeshPhongMaterial({ color: 0x3d444d });
            const arm = new THREE.Mesh(armGeom, armMat);
            arm.rotation.z = Math.PI / 2;
            // Calculate arm angle and position
            const midX = pos.x / 2;
            const midZ = pos.z / 2;
            arm.position.set(midX, 0.3, midZ);
            arm.lookAt(pos.x, 0.3, pos.z);
            arm.rotateX(Math.PI / 2);
            this.scene.add(arm);

            // Motor bell (cylinder on top)
            const bellGeom = new THREE.CylinderGeometry(0.12, 0.15, 0.15, 12);
            const bellMat = new THREE.MeshPhongMaterial({ color: 0x4a5568 });
            const bell = new THREE.Mesh(bellGeom, bellMat);
            bell.position.set(pos.x, 0.45, pos.z);
            this.scene.add(bell);

            // Propeller disc (semi-transparent)
            const propGeom = new THREE.CircleGeometry(0.55, 32);
            const propMat = new THREE.MeshPhongMaterial({
                color: motorColors[i],
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                emissive: motorColors[i],
                emissiveIntensity: 0.2
            });
            const prop = new THREE.Mesh(propGeom, propMat);
            prop.rotation.x = -Math.PI / 2;
            prop.position.set(pos.x, 0.55, pos.z);
            this.scene.add(prop);

            // Motor number label — small sphere with color
            const labelGeom = new THREE.SphereGeometry(0.06, 8, 8);
            const labelMat = new THREE.MeshPhongMaterial({ color: motorColors[i], emissive: motorColors[i], emissiveIntensity: 0.5 });
            const label = new THREE.Mesh(labelGeom, labelMat);
            label.position.set(pos.x, 0.7, pos.z);
            this.scene.add(label);

            this.propellers.push({
                mesh: prop,
                direction: directions[i]
            });
        });
    },

    /**
     * Animation loop — spins propellers based on live RPM data.
     */
    _animate() {
        this.animationId = requestAnimationFrame(() => this._animate());

        // Update propeller rotations based on RPM
        this.propellers.forEach((prop, i) => {
            const rpm = this.rpms[i] || 0;
            // Map RPM to radians/frame: at 30000 RPM, spin ~0.3 rad/frame
            const speed = (rpm / 100000) * prop.direction;
            prop.mesh.rotation.z += speed;

            // Adjust opacity based on RPM (faster = more visible disc)
            const intensity = Math.min(0.7, 0.15 + (rpm / 50000));
            prop.mesh.material.opacity = intensity;
            prop.mesh.material.emissiveIntensity = Math.min(0.8, rpm / 30000);
        });

        // Slow auto-rotate the scene for visual appeal
        if (this.scene) {
            this.scene.rotation.y += 0.002;
        }

        this.renderer.render(this.scene, this.camera);
    },

    /**
     * Update RPM values from live telemetry.
     * @param {number[]} rpms - Array of 4 RPM values
     */
    updateRPMs(rpms) {
        if (rpms && rpms.length >= 4) {
            this.rpms = rpms;
        }
    },

    /**
     * Clean up Three.js resources.
     */
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer = null;
        }
        this.scene = null;
        this.camera = null;
        this.propellers = [];
    }
};

// Export for browser
window.Drone3D = Drone3D;
