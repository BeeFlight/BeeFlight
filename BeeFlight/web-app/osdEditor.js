// =========================================================
// osdEditor.js — OSD Drag-and-Drop Canvas Editor
// Decodes/encodes Betaflight OSD position integers
// =========================================================

const OsdEditor = {
    gridCols: 30,
    gridRows: 16,
    videoSystem: null,   // 'analog' or 'hd'
    elements: [],        // Array of { key, label, row, col, visible, posInt }
    pendingCommands: [],  // Array of CLI commands to apply

    // Common OSD element definitions
    OSD_ELEMENTS: {
        'osd_avg_cell_voltage_pos': { label: '🔋 Cell Avg', icon: '🔋' },
        'osd_main_batt_voltage_pos': { label: '🔋 Battery', icon: '🔋' },
        'osd_rssi_pos': { label: '📶 RSSI', icon: '📶' },
        'osd_craft_name_pos': { label: '✈️ Name', icon: '✈️' },
        'osd_flymode_pos': { label: '🎮 Mode', icon: '🎮' },
        'osd_current_pos': { label: '⚡ Amps', icon: '⚡' },
        'osd_mah_drawn_pos': { label: '🔌 mAh', icon: '🔌' },
        'osd_gps_speed_pos': { label: '🏎️ Speed', icon: '🏎️' },
        'osd_gps_sats_pos': { label: '🛰️ Sats', icon: '🛰️' },
        'osd_altitude_pos': { label: '📏 Alt', icon: '📏' },
        'osd_timer_1_pos': { label: '⏱️ Timer 1', icon: '⏱️' },
        'osd_timer_2_pos': { label: '⏱️ Timer 2', icon: '⏱️' },
        'osd_warnings_pos': { label: '⚠️ Warnings', icon: '⚠️' },
        'osd_throttle_pos_pos': { label: '🎚️ Throttle', icon: '🎚️' },
        'osd_vtx_channel_pos': { label: '📺 VTX', icon: '📺' },
        'osd_crosshairs_pos': { label: '⊕ Crosshair', icon: '⊕' },
        'osd_horizon_sidebars_pos': { label: '▬ Horizon', icon: '▬' },
        'osd_link_quality_pos': { label: '📡 LQ', icon: '📡' }
    },

    /**
     * Decode a Betaflight osd_pos integer into row, col, and visibility.
     * Bit layout: bit 11 = visible, bits 5-10 = row (6 bits), bits 0-4 = col (5 bits)
     * For HD: bits 0-5 = col (6 bits), bits 6-10 = row (5 bits), bit 11 = visible
     */
    decodePosition(posInt) {
        const visible = !!(posInt & 0x800);  // bit 11
        if (this.videoSystem === 'hd') {
            const col = posInt & 0x3F;           // bits 0-5 (6 bits)
            const row = (posInt >> 6) & 0x1F;    // bits 6-10 (5 bits)
            return { row, col, visible };
        } else {
            const col = posInt & 0x1F;           // bits 0-4 (5 bits)
            const row = (posInt >> 5) & 0x3F;    // bits 5-10 (6 bits)
            return { row, col, visible };
        }
    },

    /**
     * Encode row, col, visible back into a Betaflight osd_pos integer.
     */
    encodePosition(row, col, visible) {
        let posInt = 0;
        if (this.videoSystem === 'hd') {
            posInt = (col & 0x3F) | ((row & 0x1F) << 6);
        } else {
            posInt = (col & 0x1F) | ((row & 0x3F) << 5);
        }
        if (visible) posInt |= 0x800;
        return posInt;
    },

    /**
     * Set the video system and grid size.
     */
    setVideoSystem(system) {
        this.videoSystem = system;
        if (system === 'hd') {
            this.gridCols = 50;
            this.gridRows = 18;
        } else {
            this.gridCols = 30;
            this.gridRows = 16;
        }
    },

    /**
     * Parse all osd_..._pos entries from the CLI diff text.
     */
    parseFromCli(cliText) {
        if (!cliText) return [];

        this.elements = [];
        const lines = cliText.split('\n');

        lines.forEach(line => {
            const cleanLine = line.trim();
            // Match: set osd_xxx_pos = NNNN
            if (cleanLine.startsWith('set osd_') && cleanLine.includes('_pos')) {
                const eqIdx = cleanLine.indexOf('=');
                if (eqIdx === -1) return;

                const key = cleanLine.substring(4, eqIdx).trim(); // e.g. "osd_main_batt_voltage_pos"
                const val = parseInt(cleanLine.substring(eqIdx + 1).trim(), 10);
                if (isNaN(val)) return;

                const decoded = this.decodePosition(val);
                const elemDef = this.OSD_ELEMENTS[key];

                this.elements.push({
                    key,
                    label: elemDef ? elemDef.label : key.replace('osd_', '').replace('_pos', '').replace(/_/g, ' '),
                    icon: elemDef ? elemDef.icon : '▪',
                    row: decoded.row,
                    col: decoded.col,
                    visible: decoded.visible,
                    posInt: val
                });
            }
        });

        return this.elements;
    },

    /**
     * Render the Elements Drawer (inactive elements).
     */
    renderDrawer() {
        const drawer = document.getElementById('osdElementsBank');
        if (!drawer) return;

        drawer.innerHTML = '';
        const inactiveElements = this.elements.filter(e => !e.visible);

        inactiveElements.forEach((elem, originalIndex) => {
            const div = document.createElement('div');
            div.className = 'osd-drawer-item';
            div.draggable = true;
            div.dataset.index = this.elements.indexOf(elem); // use global index

            const iconSpan = document.createElement('span');
            iconSpan.className = 'osd-drawer-icon';
            iconSpan.textContent = elem.icon;

            const labelSpan = document.createElement('span');
            labelSpan.className = 'osd-drawer-label';
            labelSpan.textContent = elem.label;

            div.appendChild(iconSpan);
            div.appendChild(labelSpan);

            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', div.dataset.index);
                div.classList.add('dragging');
            });

            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
            });

            drawer.appendChild(div);
        });

        // Drawer drop zone to deactivate elements
        drawer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        drawer.addEventListener('drop', (e) => {
            e.preventDefault();
            const index = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (isNaN(index)) return;

            const elem = this.elements[index];
            if (!elem.visible) return; // already inactive

            elem.visible = false;
            const newPosInt = this.encodePosition(elem.row, elem.col, false);

            const cmd = `set ${elem.key} = ${newPosInt}`;
            this.pendingCommands = this.pendingCommands.filter(c => !c.startsWith(`set ${elem.key} =`));
            this.pendingCommands.push(cmd);

            this.renderCanvas(); // updates both canvas and drawer
            this._updatePendingUI();
        });
    },

    /**
     * Render OSD elements onto the canvas as draggable divs.
     */
    renderCanvas() {
        const canvas = document.getElementById('osdCanvas');
        if (!canvas) return;

        canvas.innerHTML = '';
        canvas.style.setProperty('--osd-cols', this.gridCols);
        canvas.style.setProperty('--osd-rows', this.gridRows);

        this.elements.forEach((elem, index) => {
            if (!elem.visible) return;

            const div = document.createElement('div');
            div.className = 'osd-element';
            div.draggable = true;
            div.dataset.index = index;
            div.textContent = elem.label;
            div.title = `${elem.key} (Row: ${elem.row}, Col: ${elem.col})`;

            // Position as percentage of canvas
            const leftPct = (elem.col / this.gridCols) * 100;
            const topPct = (elem.row / this.gridRows) * 100;
            div.style.left = leftPct + '%';
            div.style.top = topPct + '%';

            // Drag events
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                div.classList.add('dragging');
            });

            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
            });

            canvas.appendChild(div);
        });

        // Ensure drop listeners are only added once
        if (!canvas.dataset.dropWired) {
            canvas.dataset.dropWired = 'true';
            canvas.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            canvas.addEventListener('drop', (e) => {
                e.preventDefault();
                const index = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (isNaN(index)) return;

                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Calculate new grid position
                const newCol = Math.round((x / rect.width) * this.gridCols);
                const newRow = Math.round((y / rect.height) * this.gridRows);

                // Clamp
                const clampedCol = Math.max(0, Math.min(this.gridCols - 1, newCol));
                const clampedRow = Math.max(0, Math.min(this.gridRows - 1, newRow));

                // Update element
                const elem = this.elements[index];
                elem.row = clampedRow;
                elem.col = clampedCol;
                elem.visible = true; // Activating element if it came from drawer
                const newPosInt = this.encodePosition(clampedRow, clampedCol, true);

                // Generate CLI command
                const cmd = `set ${elem.key} = ${newPosInt}`;
                // Remove existing pending command for this key
                this.pendingCommands = this.pendingCommands.filter(c => !c.startsWith(`set ${elem.key} =`));
                this.pendingCommands.push(cmd);

                // Re-render
                this.renderCanvas();
                this._updatePendingUI();
            });
        }

        this.renderDrawer();
    },

    /**
     * Update the pending changes bar UI.
     */
    _updatePendingUI() {
        const bar = document.getElementById('osdPendingBar');
        const countEl = document.getElementById('osdPendingCount');
        if (!bar || !countEl) return;

        if (this.pendingCommands.length > 0) {
            bar.classList.remove('hidden');
            countEl.textContent = `${this.pendingCommands.length} pending change${this.pendingCommands.length > 1 ? 's' : ''}`;
        } else {
            bar.classList.add('hidden');
        }
    },

    /**
     * Get the pending CLI commands as a copyable block.
     */
    getPendingBlock() {
        return this.pendingCommands.join('\n') + '\nsave';
    },

    /**
     * Clear pending commands.
     */
    clearPending() {
        this.pendingCommands = [];
        this._updatePendingUI();
    }
};

// Export for browser
window.OsdEditor = OsdEditor;
