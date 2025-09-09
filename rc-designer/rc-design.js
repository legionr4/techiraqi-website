// rc-design.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // 1. State and Global Variables
    // ==========================================================================
    let scene, camera, renderer, controls, airplaneGroup, cgMarker, clMarker;
    let liftChart, dragChart;
    let airflowParticles;
    let airflowVisible = false;
    let isPropellerSpinning = true;

    // A single object to hold all DOM element references
    const DOM = {};

    // ==========================================================================
    // 2. Geometry Creation Functions
    // ==========================================================================

    /**
     * Creates a wing geometry (rectangular, swept, tapered).
     * Standard Orientation: Chord along X-axis, Span along Z-axis.
     * @param {number} span - The wingspan.
     * @param {number} chord - The wing chord.
     * @param {string} airfoilType - 'semi-symmetrical', 'flat-bottom', 'symmetrical'.
     * @param {number} sweep_deg - The sweep angle in degrees.
     * @param {number} thicknessRatio - Thickness as a ratio of the chord.
     * @returns {THREE.ExtrudeGeometry}
     */
    function createRectangularWingGeometry(span, chord, airfoilType, sweep_deg = 0, thicknessRatio = 0.12) {
        const airfoilShape = new THREE.Shape();
        switch (airfoilType) {
            case 'flat-bottom':
                airfoilShape.moveTo(0, 0);
                airfoilShape.quadraticCurveTo(chord * 0.5, chord * thicknessRatio, chord, 0);
                airfoilShape.lineTo(0, 0);
                break;
            case 'symmetrical':
                airfoilShape.moveTo(0, 0);
                airfoilShape.quadraticCurveTo(chord * 0.5, chord * thicknessRatio * 0.75, chord, 0);
                airfoilShape.quadraticCurveTo(chord * 0.5, -chord * thicknessRatio * 0.75, 0, 0);
                break;
            case 'semi-symmetrical':
            default:
                airfoilShape.moveTo(0, 0);
                airfoilShape.quadraticCurveTo(chord * 0.5, chord * thicknessRatio, chord, 0);
                airfoilShape.quadraticCurveTo(chord * 0.5, -chord * thicknessRatio * 0.5, 0, 0);
                break;
        }

        const extrudeSettings = {
            steps: 1,
            depth: span,
            bevelEnabled: false,
        };

        const wingGeometry = new THREE.ExtrudeGeometry(airfoilShape, extrudeSettings);
        wingGeometry.rotateX(-Math.PI / 2); // Orient shape to XY plane

        // Apply sweep
        const sweep_rad = THREE.MathUtils.degToRad(sweep_deg);
        const positions = wingGeometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            const sweepOffset = z * Math.tan(sweep_rad);
            positions.setX(i, x + sweepOffset);
        }
        positions.needsUpdate = true;
        wingGeometry.computeVertexNormals();

        // Center the geometry
        wingGeometry.center();
        return wingGeometry;
    }

    /**
     * Creates a delta wing geometry.
     * @param {number} span - The wingspan.
     * @param {number} chord - The root chord (length from nose to trailing edge center).
     * @returns {THREE.BufferGeometry}
     */
    function createDeltaWingGeometry(span, chord) {
        const thickness = chord * 0.06;
        const vertices = new Float32Array([
            // Top face
            chord / 2, thickness / 2, 0, // v0 (nose)
            -chord / 2, thickness / 2, -span / 2, // v1 (left corner)
            -chord / 2, thickness / 2, span / 2, // v2 (right corner)
            // Bottom face
            chord / 2, -thickness / 2, 0, // v3 (nose)
            -chord / 2, -thickness / 2, span / 2, // v4 (right corner)
            -chord / 2, -thickness / 2, -span / 2, // v5 (left corner)
        ]);

        const indices = [
            0, 1, 2, // Top face
            3, 5, 4, // Bottom face
            0, 2, 4, 0, 4, 3, // Right edge
            0, 3, 5, 0, 5, 1, // Left edge
            1, 5, 4, 1, 4, 2 // Trailing edge (forms a quad)
        ];

        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(indices);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        return geometry;
    }

    /**
     * Creates a propeller model.
     * @returns {THREE.Group}
     */
    function createPropellerModel() {
        const propGroup = new THREE.Group();
        propGroup.name = "propeller";
        const propMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

        const propDiameter = parseFloat(DOM.propDiameterInput.value) * 0.0254;
        const bladeWidth = propDiameter * 0.1;
        const bladeThickness = 0.01;
        const numBlades = parseInt(DOM.propBladesInput.value, 10);

        const bladeLength = propDiameter / 2;
        const bladeGeometry = new THREE.BoxGeometry(bladeWidth, bladeLength, bladeThickness);
        bladeGeometry.translate(0, bladeLength / 2, 0);

        for (let i = 0; i < numBlades; i++) {
            const blade = new THREE.Mesh(bladeGeometry, propMaterial);
            blade.rotation.z = (i * Math.PI * 2) / numBlades; // Rotate around Z for forward axis
            propGroup.add(blade);
        }

        const hubGeometry = new THREE.CylinderGeometry(bladeWidth * 0.8, bladeWidth * 0.8, bladeWidth, 16);
        const hub = new THREE.Mesh(hubGeometry, propMaterial);
        hub.rotation.x = Math.PI / 2; // Align with Z-axis
        propGroup.add(hub);

        propGroup.rotation.y = Math.PI / 2; // Orient propeller to face forward (X-axis)
        return propGroup;
    }

    // ==========================================================================
    // 3. Main Model Creation and Update
    // ==========================================================================

    /**
     * Creates the entire airplane model based on current input values.
     * @returns {THREE.Group} The complete airplane model.
     */
    function createAirplaneModel() {
        const modelGroup = new THREE.Group();

        // Materials
        const wingMaterial = new THREE.MeshStandardMaterial({ color: DOM.wingColorInput.value, side: THREE.DoubleSide });
        const fuselageMaterial = new THREE.MeshStandardMaterial({ color: DOM.fuselageColorInput.value });
        const tailMaterial = new THREE.MeshStandardMaterial({ color: DOM.tailColorInput.value, side: THREE.DoubleSide });

        // Get dimensions
        const span = parseFloat(DOM.wingSpanInput.value) / 100;
        const chord = parseFloat(DOM.wingChordInput.value) / 100;
        const airfoilType = DOM.airfoilTypeInput.value;
        const sweep_deg = parseFloat(DOM.sweepAngleInput.value);
        const fuselageLength = parseFloat(DOM.fuselageLengthInput.value) / 100;
        const fuselageDiameter = parseFloat(DOM.fuselageDiameterInput.value) / 100;

        // --- Wing ---
        const wingGroup = new THREE.Group();
        wingGroup.name = "wingGroup";
        let wingGeometry;
        if (airfoilType === 'delta') {
            wingGeometry = createDeltaWingGeometry(span, chord);
        } else {
            wingGeometry = createRectangularWingGeometry(span, chord, airfoilType, sweep_deg);
        }

        if (airfoilType !== 'delta') {
            const taperRatio = parseFloat(DOM.taperRatioInput.value);
            if (taperRatio < 1.0) {
                const positions = wingGeometry.attributes.position;
                const span_half = span / 2;
                for (let i = 0; i < positions.count; i++) {
                    const z = positions.getZ(i);
                    const scale = 1.0 - (1.0 - taperRatio) * (Math.abs(z) / span_half);
                    positions.setX(i, positions.getX(i) * scale);
                    positions.setY(i, positions.getY(i) * scale);
                }
                positions.needsUpdate = true;
                wingGeometry.computeVertexNormals();
            }
        }
        const wingMesh = new THREE.Mesh(wingGeometry, wingMaterial);
        wingGroup.add(wingMesh);

        // --- Winglets ---
        const wingletType = DOM.wingletTypeInput.value;
        if (wingletType !== 'none' && airfoilType !== 'delta') {
            const wingletHeight = chord * 0.8;
            const wingletChord = chord * 0.4;
            const wingletGeo = createRectangularWingGeometry(wingletHeight, wingletChord, 'symmetrical', 10, 0.06);

            const rightWinglet = new THREE.Mesh(wingletGeo, wingMaterial);
            rightWinglet.position.z = span / 2;
            rightWinglet.rotation.set(0, THREE.MathUtils.degToRad(15), Math.PI / 2);
            wingGroup.add(rightWinglet);

            const leftWinglet = new THREE.Mesh(wingletGeo.clone(), wingMaterial);
            leftWinglet.position.z = -span / 2;
            leftWinglet.rotation.set(0, THREE.MathUtils.degToRad(-15), -Math.PI / 2);
            wingGroup.add(leftWinglet);
        }

        // --- Fuselage ---
        const fuselageShape = DOM.fuselageShapeInput.value;
        let fuselageGeometry;
        if (fuselageShape === 'square') {
            fuselageGeometry = new THREE.BoxGeometry(fuselageLength, fuselageDiameter, fuselageDiameter);
        } else {
            const fuselageProfile = new THREE.SplineCurve([
                new THREE.Vector2(0.01, -fuselageLength * 0.5),
                new THREE.Vector2(fuselageDiameter / 2 * 0.8, -fuselageLength * 0.4),
                new THREE.Vector2(fuselageDiameter / 2, fuselageLength * 0.1),
                new THREE.Vector2(fuselageDiameter / 2 * 0.85, fuselageLength * 0.4),
                new THREE.Vector2(0.01, fuselageLength * 0.5)
            ]);
            const points = fuselageProfile.getPoints(50);
            fuselageGeometry = new THREE.LatheGeometry(points, 32).rotateZ(-Math.PI / 2);
        }
        const fuselageMesh = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
        fuselageMesh.name = "fuselage";
        modelGroup.add(fuselageMesh);

        // --- Wing Position ---
        const wingPosition = DOM.wingPositionInput.value;
        let wingYOffset = 0;
        if (wingPosition === 'high') wingYOffset = fuselageDiameter / 2;
        else if (wingPosition === 'low') wingYOffset = -fuselageDiameter / 2;
        wingGroup.position.y = wingYOffset;
        modelGroup.add(wingGroup);

        // --- Tail (Empennage) ---
        const hStabSpan = parseFloat(DOM.hStabSpanInput.value) / 100;
        const hStabChord = parseFloat(DOM.hStabChordInput.value) / 100;
        const vStabHeight = parseFloat(DOM.vStabHeightInput.value) / 100;
        const tailType = DOM.tailTypeInput.value;

        const empennageGroup = new THREE.Group();
        empennageGroup.position.x = -(fuselageLength / 2) * 0.95;

        switch (tailType) {
            case 't-tail': {
                const vStabGeo = createRectangularWingGeometry(vStabHeight, hStabChord, 'symmetrical', 0, 0.08);
                const vStabMesh = new THREE.Mesh(vStabGeo, tailMaterial);
                vStabMesh.rotation.z = Math.PI / 2;
                vStabMesh.position.y = vStabHeight / 2;
                empennageGroup.add(vStabMesh);

                const hStabGeo = createRectangularWingGeometry(hStabSpan, hStabChord, 'symmetrical', 0.08);
                const hStabMesh = new THREE.Mesh(hStabGeo, tailMaterial);
                hStabMesh.position.y = vStabHeight;
                empennageGroup.add(hStabMesh);
                break;
            }
            case 'v-tail': {
                const vTailAngle = THREE.MathUtils.degToRad(40);
                const panelSpan = hStabSpan / (2 * Math.cos(vTailAngle));
                const vTailPanelGeo = createRectangularWingGeometry(panelSpan, hStabChord, 'symmetrical', 0, 0.08);

                const rightPanel = new THREE.Mesh(vTailPanelGeo, tailMaterial);
                rightPanel.rotation.x = -vTailAngle;
                empennageGroup.add(rightPanel);

                const leftPanel = new THREE.Mesh(vTailPanelGeo.clone(), tailMaterial);
                leftPanel.rotation.x = vTailAngle;
                empennageGroup.add(leftPanel);
                break;
            }
            case 'conventional':
            default: {
                const hStabGeo = createRectangularWingGeometry(hStabSpan, hStabChord, 'symmetrical', 0.08);
                const hStabMesh = new THREE.Mesh(hStabGeo, tailMaterial);
                empennageGroup.add(hStabMesh);

                const vStabGeo = createRectangularWingGeometry(vStabHeight, hStabChord, 'symmetrical', 0, 0.08);
                const vStabMesh = new THREE.Mesh(vStabGeo, tailMaterial);
                vStabMesh.rotation.z = Math.PI / 2;
                vStabMesh.position.y = vStabHeight / 2;
                empennageGroup.add(vStabMesh);
                break;
            }
        }
        modelGroup.add(empennageGroup);

        // --- Propeller ---
        const propellerGroup = createPropellerModel();
        propellerGroup.position.x = fuselageLength / 2;
        modelGroup.add(propellerGroup);

        return modelGroup;
    }

    /**
     * Removes the old model and adds the new one to the scene.
     */
    function updateAirplaneModel() {
        if (airplaneGroup) {
            scene.remove(airplaneGroup);
            airplaneGroup.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.isMaterial) {
                        child.material.dispose();
                    }
                }
            });
        }
        airplaneGroup = createAirplaneModel();
        scene.add(airplaneGroup);
    }

    // ==========================================================================
    // 4. UI and Visual Updates
    // ==========================================================================

    /**
     * Updates the airplane's rotation based on the Angle of Attack input.
     */
    function updateAngleOfAttack() {
        if (!airplaneGroup) return;
        const aoa_deg = parseFloat(DOM.angleOfAttackInput.value);
        airplaneGroup.rotation.z = THREE.MathUtils.degToRad(aoa_deg);
    }

    /**
     * Shows/hides wing controls based on the selected airfoil type.
     */
    function updateWingControls() {
        const airfoilType = DOM.airfoilTypeInput.value;
        if (airfoilType === 'delta') {
            DOM.sweepAngleGroup.style.display = 'none';
            DOM.taperRatioGroup.style.display = 'none';
            DOM.wingletGroup.style.display = 'none';
        } else {
            DOM.sweepAngleGroup.style.display = 'block';
            DOM.taperRatioGroup.style.display = 'block';
            DOM.wingletGroup.style.display = 'block';
        }
    }

    /**
     * Updates the position of the CG and CL markers.
     */
    function updateMarkers() {
        if (!cgMarker || !clMarker) return;

        const chord = parseFloat(DOM.wingChordInput.value) / 100;
        const cgPercent = parseFloat(DOM.cgPositionInput.value) / 100;

        // CL is at 25% of chord, CG is at user-defined percentage.
        // Wing geometry is centered, so leading edge is at -chord/2.
        const cl_x = -chord / 2 + (chord * 0.25);
        const cg_x = -chord / 2 + (chord * cgPercent);

        // Get wing's vertical position to place markers correctly
        const wingYOffset = airplaneGroup ? (airplaneGroup.getObjectByName("wingGroup")?.position.y || 0) : 0;

        clMarker.position.set(cl_x, wingYOffset + 0.05, 0);
        cgMarker.position.set(cg_x, wingYOffset - 0.05, 0);

        if (DOM.stabilityWarning) {
            if (cg_x > cl_x) {
                DOM.stabilityWarning.classList.remove('hidden');
            } else {
                DOM.stabilityWarning.classList.add('hidden');
            }
        }
    }

    // ==========================================================================
    // 5. Aerodynamic and Performance Calculations
    // ==========================================================================

    /**
     * Calculates the Wing's Lift Coefficient (Cl) based on Angle of Attack and airfoil type.
     */
    function getAeroCoefficients(aoa_deg, airfoilType) {
        let zero_lift_aoa_deg = 0;
        let stall_angle_deg = 15;
        const sweep_deg = (airfoilType === 'delta') ? 35 : parseFloat(DOM.sweepAngleInput.value);
        const sweep_rad = THREE.MathUtils.degToRad(sweep_deg);

        switch (airfoilType) {
            case 'flat-bottom':
                zero_lift_aoa_deg = -4.0;
                break;
            case 'semi-symmetrical':
                zero_lift_aoa_deg = -2.0;
                break;
            case 'symmetrical':
                zero_lift_aoa_deg = 0;
                break;
            case 'delta':
                zero_lift_aoa_deg = 0;
                stall_angle_deg = 25;
                break;
        }

        const effective_aoa_deg = aoa_deg - zero_lift_aoa_deg;
        const effective_aoa_rad = THREE.MathUtils.degToRad(effective_aoa_deg);
        let Cl = (2 * Math.PI * effective_aoa_rad) * Math.cos(sweep_rad);

        const Cl_max = 1.4;
        if (aoa_deg > stall_angle_deg) {
            Cl *= (1 - (aoa_deg - stall_angle_deg) / 10);
            Cl = Math.max(0, Cl);
        }
        Cl = Math.min(Cl, Cl_max);

        return { Cl };
    }

    /**
     * Calculates the total Drag Coefficient (Cd) for the entire aircraft.
     */
    function calculateTotalDragCoefficient(Cl, airfoilType, wingArea) {
        const Cd0_wing = 0.008;
        const Cd0_fuselage = 0.005;
        const Cd0_tail = 0.003;
        const Cd0_total = Cd0_wing + Cd0_fuselage + Cd0_tail;
        const span = parseFloat(DOM.wingSpanInput.value) / 100;
        const AR = (wingArea > 0) ? (span * span) / wingArea : 6;
        let oswaldEfficiency = 0.8;
        const wingletType = DOM.wingletTypeInput ? DOM.wingletTypeInput.value : 'none';
        if (wingletType === 'standard' && airfoilType !== 'delta') {
            oswaldEfficiency = 0.85;
        }

        const k = 1 / (Math.PI * AR * oswaldEfficiency);
        const Cd_induced = k * Math.pow(Cl, 2);
        return Cd0_total + Cd_induced;
    }

    /**
     * Calculates the wing area based on its geometry.
     */
    function calculateWingArea() {
        const span = parseFloat(DOM.wingSpanInput.value) / 100;
        const rootChord = parseFloat(DOM.wingChordInput.value) / 100;
        const airfoilType = DOM.airfoilTypeInput.value;

        if (airfoilType === 'delta') {
            return 0.5 * span * rootChord;
        } else {
            const taperRatio = parseFloat(DOM.taperRatioInput.value);
            const tipChord = rootChord * taperRatio;
            return span * (rootChord + tipChord) / 2;
        }
    }

    /**
     * Calculates air density based on the International Standard Atmosphere model.
     */
    function calculateAirDensity(temperatureC, altitudeM) {
        const T0 = 288.15;
        const P0 = 101325;
        const L = -0.0065;
        const R = 287.058;
        const g = 9.80665;

        const T_user_K = temperatureC + 273.15;
        const P = P0 * Math.pow(1 + (L * altitudeM) / T0, -g / (R * L));
        const density = P / (R * T_user_K);
        return density;
    }

    /**
     * Runs all performance calculations and updates the results panel.
     */
    function updateCalculations() {
        const speedKmh = parseFloat(DOM.airSpeedInput.value);
        const propDiameterIn = parseFloat(DOM.propDiameterInput.value);
        const propPitchIn = parseFloat(DOM.propPitchInput.value);
        const tempC = parseFloat(DOM.airTempInput.value);
        const altitudeM = parseFloat(DOM.altitudeInput.value);
        const aoa_deg = parseFloat(DOM.angleOfAttackInput.value);
        const airfoilType = DOM.airfoilTypeInput.value;
        const motorRpm = parseFloat(DOM.motorRpmInput.value);
        const totalWeightG = parseFloat(DOM.planeWeightInput.value);

        const area = calculateWingArea();
        const speedMps = speedKmh * (1000 / 3600);
        const airDensity = calculateAirDensity(tempC, altitudeM);
        const { Cl: liftCoefficient } = getAeroCoefficients(aoa_deg, airfoilType);
        const totalDragCoefficient = calculateTotalDragCoefficient(liftCoefficient, airfoilType, area);

        const liftForce = 0.5 * liftCoefficient * airDensity * Math.pow(speedMps, 2) * area;
        const dragForce = 0.5 * totalDragCoefficient * airDensity * Math.pow(speedMps, 2) * area;

        const propDiameterM = propDiameterIn * 0.0254;
        const propPitchM = propPitchIn * 0.0254;
        const revsPerSec = motorRpm / 60;
        const thrustConstant = 0.1;
        const staticThrust = thrustConstant * propPitchM * airDensity * Math.pow(revsPerSec, 2) * Math.pow(propDiameterM, 3);

        const planeMassKg = totalWeightG / 1000;
        const planeWeightN = planeMassKg * 9.81;
        let twrText = 'N/A';
        if (planeWeightN > 0) {
            const twr = staticThrust / planeWeightN;
            twrText = `${twr.toFixed(2)}:1`;
        }

        DOM.densityResult.textContent = `${airDensity.toFixed(4)} kg/m³`;
        DOM.clResult.textContent = liftCoefficient.toFixed(3);
        DOM.cdResult.textContent = totalDragCoefficient.toFixed(3);
        DOM.areaResult.textContent = `${area.toFixed(2)} م²`;
        DOM.liftResult.textContent = `${liftForce.toFixed(2)} نيوتن`;
        DOM.dragResult.textContent = `${dragForce.toFixed(2)} نيوتن`;
        DOM.thrustResult.textContent = `${staticThrust.toFixed(2)} نيوتن`;
        DOM.twrResult.textContent = twrText;
    }

    // ==========================================================================
    // 6. Visualizations (Airflow, Charts)
    // ==========================================================================

    /**
     * Creates the particle system for airflow visualization.
     */
    function createAirflow() {
        const particleCount = 5000;
        const particles = new Float32Array(particleCount * 3);
        const flowVolume = { width: 5, height: 2, depth: 4 };

        for (let i = 0; i < particleCount; i++) {
            particles[i * 3] = (Math.random() - 0.5) * flowVolume.width;
            particles[i * 3 + 1] = (Math.random() - 0.5) * flowVolume.height;
            particles[i * 3 + 2] = (Math.random() - 0.5) * flowVolume.depth;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(particles, 3));
        const material = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 0.015,
            transparent: true,
            opacity: 0.7
        });
        airflowParticles = new THREE.Points(geometry, material);
        airflowParticles.visible = false;
        scene.add(airflowParticles);
    }

    /**
     * Updates the position of airflow particles in the animation loop.
     */
    function updateAirflow() {
        if (!airflowVisible || !airflowParticles) return;

        const positions = airflowParticles.geometry.attributes.position.array;
        const flowSpeed = 0.03;
        const flowVolume = { width: 5, height: 2, depth: 4 };
        const wing_chord = parseFloat(DOM.wingChordInput.value) / 100;
        const airfoilType = DOM.airfoilTypeInput.value;

        for (let i = 0; i < positions.length; i += 3) {
            positions[i] += flowSpeed;

            if (Math.abs(positions[i]) < wing_chord / 2) {
                const normalized_x = positions[i] / (wing_chord / 2);
                let camber_effect = 0;
                if (airfoilType === 'flat-bottom') camber_effect = 0.003;
                else if (airfoilType === 'semi-symmetrical') camber_effect = 0.0015;
                const deflection = camber_effect * (1 - Math.pow(normalized_x, 2));
                if (deflection > 0) positions[i + 1] += deflection;
            }

            if (positions[i] > flowVolume.width / 2) {
                positions[i] = -flowVolume.width / 2;
                positions[i + 1] = (Math.random() - 0.5) * flowVolume.height;
                positions[i + 2] = (Math.random() - 0.5) * flowVolume.depth;
            }
        }
        airflowParticles.geometry.attributes.position.needsUpdate = true;
    }

    /**
     * Creates and configures a new performance chart.
     */
    function createPerformanceChart(canvasId, label, yAxisLabel, borderColor, backgroundColor, xAxisLabel) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const isDarkMode = document.body.classList.contains('dark-mode');
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDarkMode ? '#e4e6eb' : '#343a40';

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: label,
                    data: [],
                    borderColor: borderColor,
                    backgroundColor: backgroundColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: xAxisLabel, color: textColor },
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        title: { display: true, text: yAxisLabel, color: textColor },
                        beginAtZero: true,
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    /**
     * Recalculates and updates the data for the performance charts.
     */
    function updatePerformanceCharts() {
        if (!liftChart && !dragChart) return;

        const airfoilType = DOM.airfoilTypeInput.value;
        const area = calculateWingArea();
        const tempC = parseFloat(DOM.airTempInput.value);
        const altitudeM = parseFloat(DOM.altitudeInput.value);
        const airDensity = calculateAirDensity(tempC, altitudeM);
        const speedKmh = parseFloat(DOM.airSpeedInput.value);
        const speedMps = speedKmh * (1000 / 3600);

        const aoaLabels = [];
        const liftData = [];
        const dragData = [];
        const minAoa = -10;
        const maxAoa = 20;
        const step = 1;

        for (let aoa_deg = minAoa; aoa_deg <= maxAoa; aoa_deg += step) {
            aoaLabels.push(aoa_deg);
            const { Cl } = getAeroCoefficients(aoa_deg, airfoilType);
            const Cd = calculateTotalDragCoefficient(Cl, airfoilType, area);

            const liftForce = 0.5 * Cl * airDensity * Math.pow(speedMps, 2) * area;
            liftData.push(liftForce.toFixed(2));

            const dragForce = 0.5 * Cd * airDensity * Math.pow(speedMps, 2) * area;
            dragData.push(dragForce.toFixed(2));
        }

        if (liftChart) {
            liftChart.data.labels = aoaLabels;
            liftChart.data.datasets[0].data = liftData;
            liftChart.update();
        }

        if (dragChart) {
            dragChart.data.labels = aoaLabels;
            dragChart.data.datasets[0].data = dragData;
            dragChart.update();
        }
    }

    // ==========================================================================
    // 7. Event Handling and Main Loop
    // ==========================================================================

    /**
     * The single, unified update function called on any input change.
     */
    function handleUpdate() {
        updateAirplaneModel();
        updateAngleOfAttack();
        updateMarkers();
        updateCalculations();
        updatePerformanceCharts();
    }

    /**
     * Sets up all event listeners for the application.
     */
    function setupEventListeners() {
        const allInputs = document.querySelectorAll('.controls-panel input, .controls-panel select');
        allInputs.forEach(input => {
            const eventType = (input.type === 'range') ? 'input' : 'change';
            input.addEventListener(eventType, () => {
                // Handle immediate UI feedback for sliders
                if (input.id === 'sweep-angle') DOM.sweepAngleValueSpan.textContent = input.value;
                if (input.id === 'taper-ratio') DOM.taperRatioValueSpan.textContent = parseFloat(input.value).toFixed(2);
                if (input.id === 'angle-of-attack') DOM.aoaValueSpan.textContent = parseFloat(input.value).toFixed(1);

                // Handle UI visibility
                if (input.id === 'airfoil-type') updateWingControls();

                // Handle direct state changes
                if (input.id === 'toggle-airflow') {
                    airflowVisible = input.checked;
                    if (airflowParticles) airflowParticles.visible = airflowVisible;
                }
                if (input.id === 'toggle-prop-anim') {
                    isPropellerSpinning = input.checked;
                }

                // For major changes, trigger the full update cycle
                handleUpdate();
            });
        });

        const themeObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const charts = [liftChart, dragChart].filter(c => c);
                    if (charts.length === 0) return;

                    const isDarkMode = document.body.classList.contains('dark-mode');
                    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                    const textColor = isDarkMode ? '#e4e6eb' : '#343a40';

                    charts.forEach(chart => {
                        chart.options.scales.x.ticks.color = textColor;
                        chart.options.scales.y.ticks.color = textColor;
                        chart.options.scales.x.grid.color = gridColor;
                        chart.options.scales.y.grid.color = gridColor;
                        chart.options.scales.x.title.color = textColor;
                        chart.options.scales.y.title.color = textColor;
                        chart.update();
                    });

                    if (scene) {
                        scene.background.set(getComputedStyle(document.body).getPropertyValue('--card-bg-color').trim());
                    }
                }
            }
        });
        themeObserver.observe(document.body, { attributes: true });

        window.addEventListener('resize', () => {
            if (!camera || !renderer) return;
            camera.aspect = DOM.viewerContainer.clientWidth / DOM.viewerContainer.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(DOM.viewerContainer.clientWidth, DOM.viewerContainer.clientHeight);
        });
    }

    /**
     * The main animation loop, called every frame.
     */
    function animate() {
        requestAnimationFrame(animate);

        if (airflowVisible) updateAirflow();

        if (isPropellerSpinning && airplaneGroup) {
            const propellerGroup = airplaneGroup.getObjectByName("propeller");
            if (propellerGroup) {
                propellerGroup.rotation.z += 0.4;
            }
        }

        controls.update();
        renderer.render(scene, camera);
    }

    // ==========================================================================
    // 8. Initialization
    // ==========================================================================

    /**
     * The main entry point for the application.
     */
    function init() {
        // Cache all DOM elements
        const ids = [
            'wing-span', 'wing-chord', 'airfoil-type', 'wing-position', 'h-stab-span',
            'h-stab-chord', 'v-stab-height', 'tail-type', 'prop-diameter', 'prop-pitch',
            'plane-weight', 'aoa-value', 'sweep-angle', 'sweep-angle-value', 'sweep-angle-group',
            'fuselage-length', 'fuselage-diameter', 'fuselage-shape', 'prop-blades',
            'taper-ratio', 'taper-ratio-value', 'taper-ratio-group', 'toggle-prop-anim',
            'winglet-type', 'wing-color', 'fuselage-color', 'tail-color', 'result-area',
            'result-lift', 'result-drag', 'result-thrust', 'result-twr', 'result-cl',
            'result-cd', 'result-density', 'angle-of-attack', 'cg-position', 'air-temp',
            'altitude', 'winglet-group', 'motor-rpm', 'toggle-airflow', 'stability-warning',
            'viewer-container', 'air-speed'
        ];
        ids.forEach(id => DOM[id.replace(/-(\w)/g, (m, g) => g.toUpperCase())] = document.getElementById(id));

        // Setup Three.js scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--card-bg-color').trim());

        camera = new THREE.PerspectiveCamera(75, DOM.viewerContainer.clientWidth / DOM.viewerContainer.clientHeight, 0.1, 1000);
        camera.position.set(1.5, 1, 2.5);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(DOM.viewerContainer.clientWidth, DOM.viewerContainer.clientHeight);
        DOM.viewerContainer.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        const axesHelper = new THREE.AxesHelper(2);
        scene.add(axesHelper);

        const markerGeo = new THREE.SphereGeometry(0.025, 16, 16);
        cgMarker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        clMarker = new THREE.Mesh(markerGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
        scene.add(cgMarker, clMarker);

        // Setup visualizations and UI
        createAirflow();
        const xAxisLabel = 'زاوية الهجوم (درجة)';
        liftChart = createPerformanceChart('lift-chart', 'قوة الرفع', 'قوة الرفع (نيوتن)', 'rgba(0, 123, 255, 1)', 'rgba(0, 123, 255, 0.2)', xAxisLabel);
        dragChart = createPerformanceChart('drag-chart', 'قوة السحب', 'قوة السحب (نيوتن)', 'rgba(220, 53, 69, 1)', 'rgba(220, 53, 69, 0.2)', xAxisLabel);

        // Initial setup and first run
        updateWingControls();
        handleUpdate();
        setupEventListeners();
        animate();
    }

    init(); // Start the application
});
