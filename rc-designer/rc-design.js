// rc-design.js

// =============================================================================
//  RC Plane Designer v2.1 - Rebuilt for Stability
// =============================================================================
//  This version uses simplified and robust geometry to ensure rendering.
// =============================================================================

import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. State and Global Variables ---
    let scene, camera, renderer, controls, airplaneGroup;
    let cgMarker, clMarker;
    let liftChart, dragChart;
    let isPropellerSpinning = true;

    // A single object to hold all DOM element references for cleaner access
    const DOM = {};

    // --- 2. Main Initialization Function ---
    function init() {
        cacheDOMElements();
        setupScene();
        setupEventListeners();

        // Initial update to build the model and run calculations
        handleUpdate();

        animate();
    }

    // --- 3. Caching DOM Elements ---
    function cacheDOMElements() {
        const ids = [
            'wing-span', 'wing-chord', 'airfoil-type', 'wing-position', 'sweep-angle',
            'taper-ratio', 'winglet-type', 'fuselage-length', 'fuselage-diameter',
            'fuselage-shape', 'tail-type', 'h-stab-span', 'h-stab-chord', 'v-stab-height',
            'prop-diameter', 'prop-pitch', 'motor-rpm', 'prop-blades', 'plane-weight',
            'cg-position', 'angle-of-attack', 'air-speed', 'air-temp', 'altitude',
            'wing-color', 'fuselage-color', 'tail-color', 'toggle-prop-anim',
            'viewer-container', 'result-density', 'result-cl', 'result-cd', 'result-area',
            'result-lift', 'result-drag', 'result-thrust', 'result-twr', 'stability-warning',
            'aoa-value', 'sweep-angle-value', 'taper-ratio-value', 'sweep-angle-group',
            'taper-ratio-group', 'winglet-group'
        ];
        ids.forEach(id => {
            // Convert kebab-case to camelCase for easier access (e.g., 'wing-span' -> 'wingSpan')
            const camelCaseId = id.replace(/-(\w)/g, (m, g) => g.toUpperCase());
            DOM[camelCaseId] = document.getElementById(id);
        });
    }

    // --- 4. Three.js Scene Setup ---
    function setupScene() {
        const container = DOM.viewerContainer;
        if (!container || container.clientWidth === 0) {
            console.error("Viewer container not found or has no dimensions.");
            return;
        }

        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--card-bg-color').trim());

        // Camera
        camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(1.5, 1, 2.5);

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(5, 10, 7.5);
        scene.add(dirLight);

        // Controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // Helpers
        scene.add(new THREE.AxesHelper(2));

        // Markers
        const markerGeo = new THREE.SphereGeometry(0.025, 16, 16);
        cgMarker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        clMarker = new THREE.Mesh(markerGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
        scene.add(cgMarker, clMarker);

        // Charts
        const xAxisLabel = 'زاوية الهجوم (درجة)';
        liftChart = createChart('lift-chart', 'قوة الرفع (نيوتن)', 'rgba(0, 123, 255, 1)', xAxisLabel);
        dragChart = createChart('drag-chart', 'قوة السحب (نيوتن)', 'rgba(220, 53, 69, 1)', xAxisLabel);
    }

    // --- 5. Model Creation ---
    // This is the core function that builds the entire airplane from scratch
    function createAirplaneModel() {
        const modelGroup = new THREE.Group();

        // Materials
        const wingMat = new THREE.MeshStandardMaterial({ color: DOM.wingColor.value, side: THREE.DoubleSide });
        const fuselageMat = new THREE.MeshStandardMaterial({ color: DOM.fuselageColor.value });
        const tailMat = new THREE.MeshStandardMaterial({ color: DOM.tailColor.value, side: THREE.DoubleSide });

        // Get dimensions (and convert cm to m)
        const span = parseFloat(DOM.wingSpan.value) / 100;
        const chord = parseFloat(DOM.wingChord.value) / 100;
        const fuselageLength = parseFloat(DOM.fuselageLength.value) / 100;
        const fuselageDiameter = parseFloat(DOM.fuselageDiameter.value) / 100;

        // --- Fuselage ---
        let fuselageGeo;
        if (DOM.fuselageShape.value === 'square') {
            fuselageGeo = new THREE.BoxGeometry(fuselageLength, fuselageDiameter, fuselageDiameter);
        } else {
            fuselageGeo = new THREE.CylinderGeometry(fuselageDiameter / 2, fuselageDiameter / 2, fuselageLength, 32);
        }
        const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
        fuselage.rotation.z = Math.PI / 2; // Align with X-axis
        fuselage.name = "fuselage";
        modelGroup.add(fuselage);

        // --- Wing (Simplified and Robust) ---
        const wingGroup = new THREE.Group();
        wingGroup.name = "wingGroup";
        const wingThickness = chord * 0.12; // 12% thickness is a common average

        // Use simple BoxGeometry for all wing types to ensure rendering
        const wingGeo = new THREE.BoxGeometry(chord, wingThickness, span);

        if (DOM.airfoilType.value !== 'delta') {
            // Apply Taper
            const taperRatio = parseFloat(DOM.taperRatio.value);
            const positions = wingGeo.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const z = positions.getZ(i); // Span position
                const scale = 1.0 - (1.0 - taperRatio) * (Math.abs(z) / (span / 2));
                positions.setX(i, positions.getX(i) * scale);
            }

            // Apply Sweep
            const sweepRad = THREE.MathUtils.degToRad(parseFloat(DOM.sweepAngle.value));
            for (let i = 0; i < positions.count; i++) {
                const z = positions.getZ(i);
                const sweepOffset = Math.abs(z) * Math.tan(sweepRad);
                positions.setX(i, positions.getX(i) - sweepOffset);
            }
            wingGeo.attributes.position.needsUpdate = true;
            wingGeo.computeVertexNormals();
        }
        
        const wingMesh = new THREE.Mesh(wingGeo, wingMat);
        wingGroup.add(wingMesh);

        // Wing Position
        const wingPosition = DOM.wingPosition.value;
        if (wingPosition === 'high') wingGroup.position.y = fuselageDiameter / 2;
        else if (wingPosition === 'low') wingGroup.position.y = -fuselageDiameter / 2;
        modelGroup.add(wingGroup);

        // --- Tail ---
        const hStabSpan = parseFloat(DOM.hStabSpan.value) / 100;
        const hStabChord = parseFloat(DOM.hStabChord.value) / 100;
        const vStabHeight = parseFloat(DOM.vStabHeight.value) / 100;
        const tailThickness = hStabChord * 0.08;

        const empennageGroup = new THREE.Group();
        empennageGroup.position.x = -fuselageLength / 2;

        const hStabGeo = new THREE.BoxGeometry(hStabChord, tailThickness, hStabSpan);
        const vStabGeo = new THREE.BoxGeometry(hStabChord, tailThickness, vStabHeight);

        switch (DOM.tailType.value) {
            case 't-tail': {
                const vStab = new THREE.Mesh(vStabGeo, tailMat);
                vStab.rotation.x = Math.PI / 2;
                vStab.position.y = vStabHeight / 2;
                empennageGroup.add(vStab);
                const hStab = new THREE.Mesh(hStabGeo, tailMat);
                hStab.position.y = vStabHeight;
                empennageGroup.add(hStab);
                break;
            }
            case 'v-tail': {
                const vTailAngle = THREE.MathUtils.degToRad(40);
                const panelGeo = new THREE.BoxGeometry(hStabChord, tailThickness, hStabSpan / 2);
                const rightPanel = new THREE.Mesh(panelGeo, tailMat);
                rightPanel.position.z = hStabSpan / 4;
                rightPanel.rotation.x = -vTailAngle;
                empennageGroup.add(rightPanel);
                const leftPanel = new THREE.Mesh(panelGeo, tailMat);
                leftPanel.position.z = -hStabSpan / 4;
                leftPanel.rotation.x = vTailAngle;
                empennageGroup.add(leftPanel);
                break;
            }
            default: { // Conventional
                const hStab = new THREE.Mesh(hStabGeo, tailMat);
                empennageGroup.add(hStab);
                const vStab = new THREE.Mesh(vStabGeo, tailMat);
                vStab.rotation.x = Math.PI / 2;
                vStab.position.y = vStabHeight / 2;
                empennageGroup.add(vStab);
                break;
            }
        }
        modelGroup.add(empennageGroup);

        // --- Propeller ---
        const propGroup = new THREE.Group();
        propGroup.name = "propeller";
        const propMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const propDiameter = parseFloat(DOM.propDiameter.value) * 0.0254;
        const numBlades = parseInt(DOM.propBlades.value, 10);
        const bladeGeo = new THREE.BoxGeometry(propDiameter * 0.1, propDiameter / 2, 0.01);
        bladeGeo.translate(0, propDiameter / 4, 0);
        for (let i = 0; i < numBlades; i++) {
            const blade = new THREE.Mesh(bladeGeo, propMat);
            blade.rotation.z = (i * Math.PI * 2) / numBlades;
            propGroup.add(blade);
        }
        propGroup.position.x = fuselageLength / 2;
        modelGroup.add(propGroup);

        return modelGroup;
    }

    // --- 6. Update Logic ---
    // This is the single function called whenever an input changes.
    function handleUpdate() {
        // Update 3D Model
        if (airplaneGroup) {
            scene.remove(airplaneGroup);
            // Basic disposal
            airplaneGroup.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        }
        airplaneGroup = createAirplaneModel();
        scene.add(airplaneGroup);

        // Update other parts of the UI
        updateAngleOfAttack();
        updateCalculations();
        updateMarkers();
        updateCharts();
        updateUIControls();
    }

    function updateAngleOfAttack() {
        if (!airplaneGroup) return;
        const aoa_deg = parseFloat(DOM.angleOfAttack.value);
        airplaneGroup.rotation.z = THREE.MathUtils.degToRad(aoa_deg);
    }

    function updateMarkers() {
        if (!cgMarker || !clMarker || !airplaneGroup) return;

        const chord = parseFloat(DOM.wingChord.value) / 100;
        const cgPercent = parseFloat(DOM.cgPosition.value) / 100;
        const wingGroup = airplaneGroup.getObjectByName("wingGroup");
        const wingYOffset = wingGroup ? wingGroup.position.y : 0;

        // Wing is centered, so leading edge is at -chord/2
        const cl_x = -chord / 2 + (chord * 0.25);
        const cg_x = -chord / 2 + (chord * cgPercent);

        clMarker.position.set(cl_x, wingYOffset + 0.05, 0);
        cgMarker.position.set(cg_x, wingYOffset - 0.05, 0);

        // Stability Warning
        if (cg_x > cl_x) {
            DOM.stabilityWarning.classList.remove('hidden');
        } else {
            DOM.stabilityWarning.classList.add('hidden');
        }
    }

    function updateUIControls() {
        const isDelta = DOM.airfoilType.value === 'delta';
        DOM.sweepAngleGroup.style.display = isDelta ? 'none' : 'block';
        DOM.taperRatioGroup.style.display = isDelta ? 'none' : 'block';
        DOM.wingletGroup.style.display = 'none'; // Winglets not implemented in this simple version
    }

    // --- 7. Aerodynamic Calculations ---
    function calculateWingArea() {
        const span = parseFloat(DOM.wingSpan.value) / 100;
        const rootChord = parseFloat(DOM.wingChord.value) / 100;
        if (DOM.airfoilType.value === 'delta') {
            return 0.5 * span * rootChord;
        } else {
            const taperRatio = parseFloat(DOM.taperRatio.value);
            const tipChord = rootChord * taperRatio;
            return span * (rootChord + tipChord) / 2;
        }
    }

    function calculateAirDensity(tempC, altitudeM) {
        const T0 = 288.15, P0 = 101325, L = -0.0065, R = 287.058, g = 9.80665;
        const T_user_K = tempC + 273.15;
        const P = P0 * Math.pow(1 + (L * altitudeM) / T0, -g / (R * L));
        return P / (R * T_user_K);
    }

    function getLiftCoefficient(aoa_deg) {
        const effective_aoa_rad = THREE.MathUtils.degToRad(aoa_deg);
        // Simplified linear lift curve
        let Cl = 2 * Math.PI * effective_aoa_rad;
        // Simple stall model
        if (aoa_deg > 15) {
            Cl = 2 * Math.PI * THREE.MathUtils.degToRad(15);
        } else if (aoa_deg < -15) {
            Cl = 2 * Math.PI * THREE.MathUtils.degToRad(-15);
        }
        return Cl;
    }

    function getDragCoefficient(Cl, wingArea) {
        const span = parseFloat(DOM.wingSpan.value) / 100;
        const AR = (wingArea > 0) ? (span * span) / wingArea : 6;
        const oswaldEfficiency = 0.8;
        const k = 1 / (Math.PI * AR * oswaldEfficiency);
        
        const Cd_parasitic = 0.025; // Simplified constant for the whole plane
        const Cd_induced = k * Math.pow(Cl, 2);
        
        return Cd_parasitic + Cd_induced;
    }

    function updateCalculations() {
        const speedKmh = parseFloat(DOM.airSpeed.value);
        const tempC = parseFloat(DOM.airTemp.value);
        const altitudeM = parseFloat(DOM.altitude.value);
        const aoa_deg = parseFloat(DOM.angleOfAttack.value);
        const totalWeightG = parseFloat(DOM.planeWeight.value);
        const motorRpm = parseFloat(DOM.motorRpm.value);
        const propDiameterIn = parseFloat(DOM.propDiameter.value);
        const propPitchIn = parseFloat(DOM.propPitch.value);

        const area = calculateWingArea();
        const speedMps = speedKmh * (1000 / 3600);
        const airDensity = calculateAirDensity(tempC, altitudeM);
        const Cl = getLiftCoefficient(aoa_deg);
        const Cd = getDragCoefficient(Cl, area);

        const liftForce = 0.5 * Cl * airDensity * Math.pow(speedMps, 2) * area;
        const dragForce = 0.5 * Cd * airDensity * Math.pow(speedMps, 2) * area;

        // Simplified thrust
        const propDiameterM = propDiameterIn * 0.0254;
        const propPitchM = propPitchIn * 0.0254;
        const revsPerSec = motorRpm / 60;
        const staticThrust = 0.1 * propPitchM * airDensity * Math.pow(revsPerSec, 2) * Math.pow(propDiameterM, 3);

        const planeWeightN = (totalWeightG / 1000) * 9.81;
        const twr = planeWeightN > 0 ? (staticThrust / planeWeightN) : 0;

        // Update UI
        DOM.resultDensity.textContent = `${airDensity.toFixed(4)} kg/m³`;
        DOM.resultCl.textContent = Cl.toFixed(3);
        DOM.resultCd.textContent = Cd.toFixed(3);
        DOM.resultArea.textContent = `${area.toFixed(2)} م²`;
        DOM.resultLift.textContent = `${liftForce.toFixed(2)} نيوتن`;
        DOM.resultDrag.textContent = `${dragForce.toFixed(2)} نيوتن`;
        DOM.resultThrust.textContent = `${staticThrust.toFixed(2)} نيوتن`;
        DOM.resultTwr.textContent = `${twr.toFixed(2)}:1`;
    }

    // --- 8. Charts ---
    function createChart(canvasId, yAxisLabel, color, xAxisLabel) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        const isDarkMode = document.body.classList.contains('dark-mode');
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDarkMode ? '#e4e6eb' : '#343a40';

        return new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [{ data: [], borderColor: color, borderWidth: 2, tension: 0.4 }] },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: xAxisLabel, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { title: { display: true, text: yAxisLabel, color: textColor }, beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } }
                }
            }
        });
    }

    function updateCharts() {
        if (!liftChart || !dragChart) return;

        const area = calculateWingArea();
        const airDensity = calculateAirDensity(parseFloat(DOM.airTemp.value), parseFloat(DOM.altitude.value));
        const speedMps = parseFloat(DOM.airSpeed.value) * (1000 / 3600);

        const aoaLabels = [], liftData = [], dragData = [];
        for (let aoa = -10; aoa <= 20; aoa++) {
            aoaLabels.push(aoa);
            const Cl = getLiftCoefficient(aoa);
            const Cd = getDragCoefficient(Cl, area);
            liftData.push(0.5 * Cl * airDensity * Math.pow(speedMps, 2) * area);
            dragData.push(0.5 * Cd * airDensity * Math.pow(speedMps, 2) * area);
        }

        liftChart.data.labels = aoaLabels;
        liftChart.data.datasets[0].data = liftData;
        liftChart.update('none');

        dragChart.data.labels = aoaLabels;
        dragChart.data.datasets[0].data = dragData;
        dragChart.update('none');
    }

    // --- 9. Event Listeners ---
    function setupEventListeners() {
        // Listen to all inputs in the control panel
        const controlsPanel = document.querySelector('.controls-panel');
        if (!controlsPanel) {
            console.error("Fatal Error: The '.controls-panel' element was not found. UI will not be interactive.");
            return; // Exit if the main panel is missing
        }

        controlsPanel.addEventListener('input', (event) => {
            // Update slider value displays immediately
            if (event.target.id === 'sweep-angle') DOM.sweepAngleValue.textContent = event.target.value;
            if (event.target.id === 'taper-ratio') DOM.taperRatioValue.textContent = parseFloat(event.target.value).toFixed(2);
            if (event.target.id === 'angle-of-attack') DOM.aoaValue.textContent = parseFloat(event.target.value).toFixed(1);
            
            // For propeller animation toggle, no need to rebuild the whole model
            if (event.target.id === 'toggle-prop-anim') {
                isPropellerSpinning = event.target.checked;
                return; // Exit early
            }

            // For all other changes, trigger the full update
            handleUpdate();
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (!camera || !renderer) return;
            camera.aspect = DOM.viewerContainer.clientWidth / DOM.viewerContainer.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(DOM.viewerContainer.clientWidth, DOM.viewerContainer.clientHeight);
        });

        // Handle theme change for charts and scene background
        new MutationObserver(() => {
            const isDarkMode = document.body.classList.contains('dark-mode');
            const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            const textColor = isDarkMode ? '#e4e6eb' : '#343a40';
            [liftChart, dragChart].forEach(chart => {
                if(chart) {
                    chart.options.scales.x.ticks.color = textColor;
                    chart.options.scales.y.ticks.color = textColor;
                    chart.options.scales.x.grid.color = gridColor;
                    chart.options.scales.y.grid.color = gridColor;
                    chart.options.scales.x.title.color = textColor;
                    chart.options.scales.y.title.color = textColor;
                    chart.update('none');
                }
            });
            if (scene) {
                scene.background.set(getComputedStyle(document.body).getPropertyValue('--card-bg-color').trim());
            }
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // --- 10. Animation Loop ---
    function animate() {
        requestAnimationFrame(animate);

        if (isPropellerSpinning && airplaneGroup) {
            const propeller = airplaneGroup.getObjectByName("propeller");
            if (propeller) {
                propeller.rotation.x += 0.5; // Spin around its forward axis
            }
        }

        controls.update();
        renderer.render(scene, camera);
    }

    // --- Start the application ---
    init();
});
