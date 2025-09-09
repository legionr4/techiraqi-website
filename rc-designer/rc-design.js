// rc-design.js

// استيراد المكتبات الأساسية من Three.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. إعداد العناصر الأساسية ---

    // عناصر التحكم في الواجهة
    const wingSpanInput = document.getElementById('wing-span');
    const wingChordInput = document.getElementById('wing-chord');
    const airfoilTypeInput = document.getElementById('airfoil-type');
    const wingPositionInput = document.getElementById('wing-position');
    const hStabSpanInput = document.getElementById('h-stab-span');
    const hStabChordInput = document.getElementById('h-stab-chord');
    const vStabHeightInput = document.getElementById('v-stab-height');
    const tailTypeInput = document.getElementById('tail-type');
    const propDiameterInput = document.getElementById('prop-diameter');
    const propPitchInput = document.getElementById('prop-pitch');
    const planeWeightInput = document.getElementById('plane-weight');
    const aoaValueSpan = document.getElementById('aoa-value');
    const sweepAngleInput = document.getElementById('sweep-angle');
    const sweepAngleValueSpan = document.getElementById('sweep-angle-value');
    const sweepAngleGroup = document.getElementById('sweep-angle-group');
    const fuselageLengthInput = document.getElementById('fuselage-length');
    const fuselageDiameterInput = document.getElementById('fuselage-diameter');
    const propBladesInput = document.getElementById('prop-blades');
    const taperRatioInput = document.getElementById('taper-ratio');
    const taperRatioValueSpan = document.getElementById('taper-ratio-value');
    const taperRatioGroup = document.getElementById('taper-ratio-group');
    const togglePropAnimInput = document.getElementById('toggle-prop-anim');

    // عناصر التحكم في الألوان
    const wingColorInput = document.getElementById('wing-color');
    const fuselageColorInput = document.getElementById('fuselage-color');
    const tailColorInput = document.getElementById('tail-color');

    // عناصر عرض النتائج
    const areaResult = document.getElementById('result-area');
    const liftResult = document.getElementById('result-lift');
    const dragResult = document.getElementById('result-drag');
    const thrustResult = document.getElementById('result-thrust');
    const twrResult = document.getElementById('result-twr');
    const clResult = document.getElementById('result-cl');
    const cdResult = document.getElementById('result-cd');
    const densityResult = document.getElementById('result-density');

    // Re-get all other elements that might have been removed in the previous diff
    const angleOfAttackInput = document.getElementById('angle-of-attack');
    const cgPositionInput = document.getElementById('cg-position');
    const airTempInput = document.getElementById('air-temp');
    const altitudeInput = document.getElementById('altitude');
    const wingletGroup = document.getElementById('winglet-group');
    const motorRpmInput = document.getElementById('motor-rpm');
    const toggleAirflowInput = document.getElementById('toggle-airflow');

    // These elements are not in the new HTML, so we should handle them gracefully
    // by checking if they exist before using them. Or, if they are essential,
    // they need to be added back to the HTML. For now, we'll assume they are not essential
    // for the 3D view to render.
    const saveDesignBtn = document.getElementById('save-design-btn');
    const loadDesignBtn = document.getElementById('load-design-btn');
    const loadDesignInput = document.getElementById('load-design-input');
    const stabilityWarning = document.getElementById('stability-warning');



    // حاوية العرض ثلاثي الأبعاد
    const viewerContainer = document.getElementById('viewer-container');

    // --- 2. إعداد المشهد ثلاثي الأبعاد (Three.js) ---

    let scene, camera, renderer, controls;
    let airplaneGroup, cgMarker, clMarker; // مجموعة الطائرة والعلامات
    let wingMaterial, fuselageMaterial, tailMaterial; // متغيرات للاحتفاظ بالمواد
    let liftChart, dragChart; // متغيرات الرسوم البيانية
    let airflowParticles; // For airflow visualization
    let airflowVisible = false;
    let isPropellerSpinning = true;

    /**
     * Creates a realistic rectangular/swept wing geometry using ExtrudeGeometry.
     * The airfoil shape is a simplified representation.
     * @param {number} span - The wingspan.
     * @param {number} chord - The wing chord.
     * @param {string} airfoilType - The type of airfoil ('semi-symmetrical', 'flat-bottom', 'symmetrical').
     * @param {number} sweep_deg - The sweep angle in degrees.
     * @param {number} thicknessRatio - The thickness of the wing as a ratio of the chord.
     * @returns {THREE.ExtrudeGeometry}
     */
    function createRectangularWingGeometry(span, chord, airfoilType, sweep_deg = 0, thicknessRatio = 0.12) {
        // 1. Create the 2D airfoil shape in the XY plane (where X is chord, Y is thickness)
        const airfoilShape = new THREE.Shape();

        switch (airfoilType) {
            case 'flat-bottom':
                // شكل مسطح من الأسفل (مثل Clark-Y)، جيد للرفع العالي والاستقرار
                airfoilShape.moveTo(chord, 0); // الحافة الخلفية
                // المنحنى العلوي
                airfoilShape.quadraticCurveTo(chord * 0.4, chord * thicknessRatio, 0, 0);
                // الجزء السفلي عبارة عن خط مستقيم
                airfoilShape.lineTo(chord, 0);
                break;

            case 'symmetrical':
                // شكل متماثل (مثل NACA 0012)، جيد للاستعراض الجوي والطيران المقلوب
                airfoilShape.moveTo(chord, 0); // الحافة الخلفية
                // المنحنى العلوي
                airfoilShape.quadraticCurveTo(chord * 0.5, chord * thicknessRatio * 0.75, 0, 0);
                // المنحنى السفلي (متماثل)
                airfoilShape.quadraticCurveTo(chord * 0.5, -chord * thicknessRatio * 0.75, chord, 0);
                break;

            case 'semi-symmetrical':
            default:
                // الشكل الأصلي شبه المتماثل، جيد للأغراض العامة
                airfoilShape.moveTo(chord, 0); // الحافة الخلفية
                airfoilShape.quadraticCurveTo(chord * 0.4, chord * thicknessRatio, 0, 0);
                airfoilShape.quadraticCurveTo(chord * 0.4, -chord * thicknessRatio * 0.5, chord, 0);
                break;
        }

        // 2. Define extrusion settings
        const extrudeSettings = {
            steps: 1,
            depth: span, // Extrude along the Z-axis by the length of the span
            bevelEnabled: false,
        };

        // 3. Create the 3D geometry by extruding the shape
        const wingGeometry = new THREE.ExtrudeGeometry(airfoilShape, extrudeSettings);

        // 4. Apply sweep transformation
        const sweep_rad = THREE.MathUtils.degToRad(sweep_deg);
        const positions = wingGeometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {
            // The extruded geometry has: x -> along the chord, y -> thickness, z -> along the span
            const x = positions.getX(i);
            const z = positions.getZ(i);
            // The amount of sweep is proportional to the distance from the center (z)
            // We shift the x position (chord-wise) based on the span-wise position
            const sweepOffset = z * Math.tan(sweep_rad);
            positions.setX(i, x - sweepOffset);
        }
        positions.needsUpdate = true;
        wingGeometry.computeVertexNormals(); // Recalculate normals after vertex manipulation

        // 5. Center the wing on its span
        wingGeometry.translate(0, 0, -span / 2);

        return wingGeometry;
    }

    /**
     * Creates a simple delta wing geometry using BufferGeometry.
     * @param {number} span - The wingspan.
     * @param {number} chord - The root chord (length from nose to trailing edge center).
     * @returns {THREE.BufferGeometry}
     */
    function createDeltaWingGeometry(span, chord) {
        const thickness = chord * 0.06; // Delta wings are relatively thin
        const vertices = new Float32Array([
            // Top face
            0, thickness / 2, 0, // v0 (nose)
            -span / 2, thickness / 2, -chord, // v1 (left corner)
            span / 2, thickness / 2, -chord, // v2 (right corner)
            // Bottom face
            0, -thickness / 2, 0, // v3 (nose)
            span / 2, -thickness / 2, -chord, // v4 (right corner)
            -span / 2, -thickness / 2, -chord, // v5 (left corner)
        ]);

        const indices = [
            0, 1, 2, // Top face
            3, 5, 4, // Bottom face
            0, 2, 4, 0, 4, 3, // Right edge
            0, 3, 5, 0, 5, 1, // Left edge
            1, 5, 4, 1, 4, 2  // Trailing edge
        ];

        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(indices);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.computeVertexNormals(); // for correct lighting
        return geometry;
    }

    /**
     * Creates a simple propeller model.
     * @returns {THREE.Group}
     */
    function createPropellerModel() {
        const propGroup = new THREE.Group();
        propGroup.name = "propeller"; // Name the group for easy selection
        const propMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

        const propDiameter = parseFloat(propDiameterInput.value) * 0.0254; // inches to meters
        const bladeWidth = propDiameter * 0.1;
        const bladeThickness = 0.01;
        const numBlades = parseInt(propBladesInput.value, 10);

        const bladeLength = propDiameter / 2;
        const bladeGeometry = new THREE.BoxGeometry(bladeWidth, bladeLength, bladeThickness);
        // Move the pivot point of the blade to its base
        bladeGeometry.translate(0, bladeLength / 2, 0);

        for (let i = 0; i < numBlades; i++) {
            const blade = new THREE.Mesh(bladeGeometry, propMaterial);
            // Rotate the blade around the hub's center (X-axis)
            blade.rotation.x = (i * Math.PI * 2) / numBlades;
            propGroup.add(blade);
        }

        // Create a central hub, aligned with the X-axis
        const hubGeometry = new THREE.CylinderGeometry(bladeWidth * 0.8, bladeWidth * 0.8, bladeWidth, 16);
        const hub = new THREE.Mesh(hubGeometry, propMaterial);
        hub.rotation.z = Math.PI / 2;

        propGroup.add(hub);

        return propGroup;
    }

    /**
     * Creates the landing gear model based on user selection.
     * @param {string} gearType - 'tricycle' or 'taildragger'.
     * @param {number} fuselageLength - The length of the fuselage.
     * @param {number} fuselageDiameter - The diameter of the fuselage.
     * @param {number} wingYOffset - The vertical offset of the wing.
     * @returns {THREE.Group|null}
     */
    function createLandingGear(gearType, fuselageLength, fuselageDiameter, wingYOffset) {
        if (gearType === 'none') {
            return null;
        }

        const gearGroup = new THREE.Group();
        gearGroup.name = "landingGear";

        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
        const strutMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.5, roughness: 0.5 });

        const mainWheelRadius = fuselageDiameter * 0.35;
        const mainWheelThickness = mainWheelRadius * 0.4;
        const smallWheelRadius = mainWheelRadius * 0.6;
        const smallWheelThickness = smallWheelRadius * 0.5;
        const strutRadius = mainWheelRadius * 0.15;

        // Using Torus for a better wheel look
        const mainWheelGeom = new THREE.TorusGeometry(mainWheelRadius, mainWheelThickness, 16, 32).rotateX(Math.PI / 2);
        const smallWheelGeom = new THREE.TorusGeometry(smallWheelRadius, smallWheelThickness, 12, 24).rotateX(Math.PI / 2);

        const fuselageBottomY = -fuselageDiameter / 2;

        if (gearType === 'tricycle') {
            // 1. Nose Gear
            const noseStrutHeight = fuselageDiameter * 0.6;
            const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(strutRadius, strutRadius, noseStrutHeight, 8), strutMaterial);
            noseStrut.position.set(fuselageLength * 0.4, fuselageBottomY - noseStrutHeight / 2, 0);
            const noseWheel = new THREE.Mesh(smallWheelGeom, wheelMaterial);
            noseWheel.position.set(fuselageLength * 0.4, fuselageBottomY - noseStrutHeight, 0);
            gearGroup.add(noseStrut, noseWheel);

            // 2. Main Gears (under the wing)
            const mainStrutHeight = fuselageDiameter * 0.5;
            const mainGearX = 0; // Positioned near CG
            const mainGearZ = fuselageDiameter * 0.8;
            const strutStartPoint = wingYOffset !== 0 ? wingYOffset - mainWheelRadius : fuselageBottomY;

            const rightStrut = new THREE.Mesh(new THREE.CylinderGeometry(strutRadius, strutRadius, mainStrutHeight, 8), strutMaterial);
            rightStrut.position.set(mainGearX, strutStartPoint - mainStrutHeight / 2, mainGearZ);
            const rightWheel = new THREE.Mesh(mainWheelGeom, wheelMaterial);
            rightWheel.position.set(mainGearX, strutStartPoint - mainStrutHeight, mainGearZ);
            gearGroup.add(rightStrut, rightWheel);

            const leftStrut = rightStrut.clone();
            leftStrut.position.z *= -1;
            const leftWheel = rightWheel.clone();
            leftWheel.position.z *= -1;
            gearGroup.add(leftStrut, leftWheel);

        } else if (gearType === 'taildragger') {
            // 1. Main Gears (forward of CG)
            const mainStrutHeight = fuselageDiameter * 0.6;
            const mainGearX = fuselageLength * 0.15;
            const mainGearZ = fuselageDiameter * 0.9;
            const rightStrut = new THREE.Mesh(new THREE.CylinderGeometry(strutRadius, strutRadius, mainStrutHeight, 8), strutMaterial);
            rightStrut.position.set(mainGearX, fuselageBottomY - mainStrutHeight / 2, mainGearZ);
            const rightWheel = new THREE.Mesh(mainWheelGeom, wheelMaterial);
            rightWheel.position.set(mainGearX, fuselageBottomY - mainStrutHeight, mainGearZ);
            gearGroup.add(rightStrut, rightWheel);
            gearGroup.add(rightStrut.clone().translateX(-mainGearZ * 2), rightWheel.clone().translateX(-mainGearZ * 2)); // Simplified cloning

            // 2. Tail Wheel
            const tailWheel = new THREE.Mesh(smallWheelGeom, wheelMaterial);
            tailWheel.position.set(-fuselageLength * 0.48, fuselageBottomY - smallWheelRadius, 0);
            gearGroup.add(tailWheel);
        }

        return gearGroup;
    }

    function init() {
        // إنشاء المشهد
        scene = new THREE.Scene();
        scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--background-color').trim());

        // إنشاء الكاميرا
        camera = new THREE.PerspectiveCamera(75, viewerContainer.clientWidth / viewerContainer.clientHeight, 0.1, 1000);
        camera.position.set(1, 1, 2); // وضع الكاميرا

        // إنشاء عارض الرسوميات
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
        viewerContainer.appendChild(renderer.domElement);

        // إضافة إضاءة للمشهد
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        // إضافة متحكمات الماوس (لتحريك المشهد)
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // إنشاء علامات مركز الثقل والرفع مرة واحدة هنا
        const markerGeo = new THREE.SphereGeometry(0.025, 16, 16);

        // علامة مركز الثقل (CG) - باللون الأحمر
        const cgMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 });
        cgMarker = new THREE.Mesh(markerGeo, cgMaterial);
        cgMarker.name = "CG_Marker";
        scene.add(cgMarker);

        // علامة مركز الرفع (CL) - باللون الأزرق
        const clMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.8 });
        clMarker = new THREE.Mesh(markerGeo.clone(), clMaterial); // Use clone for geometry
        clMarker.name = "CL_Marker";
        scene.add(clMarker);

        // إضافة محاور XYZ ونقطة الأصل
        const axesHelper = new THREE.AxesHelper(2); // الرقم 2 هو حجم المحاور
        scene.add(axesHelper);

        // إنشاء نموذج الطائرة الأولي
        createAirplaneModel();
        createAirflow(); // Create the particles

        // بدء حلقة الرسوم المتحركة
        animate();

        // ربط الأحداث
        setupEventListeners();

        // حساب وتحديث الواجهة لأول مرة
        updateCalculations();
        // إعداد الرسوم البيانية
        const xAxisLabel = 'زاوية الهجوم (درجة)';
        liftChart = createPerformanceChart('lift-chart', 'قوة الرفع', 'قوة الرفع (نيوتن)', 'rgba(0, 123, 255, 1)', 'rgba(0, 123, 255, 0.2)', xAxisLabel);
        dragChart = createPerformanceChart('drag-chart', 'قوة السحب', 'قوة السحب (نيوتن)', 'rgba(220, 53, 69, 1)', 'rgba(220, 53, 69, 0.2)', xAxisLabel);

        // تحديث زاوية الهجوم الأولية
        updateAngleOfAttack();
        updateMarkers(); // استدعاء لتحديث العلامات عند التحميل الأولي
        updatePerformanceCharts(); // تعبئة الرسوم البيانية بالبيانات الأولية
    }

    // --- 3. إنشاء وتحديث نموذج الطائرة ---

    function createAirplaneModel() {
        // إنشاء مجموعة لتضم كل أجزاء الطائرة
        airplaneGroup = new THREE.Group();

        // إنشاء مجموعة خاصة بالجناح ومكوناته (لتسهيل تحريكه كوحدة واحدة)
        const wingGroup = new THREE.Group();
        wingGroup.name = "wingGroup";

        // المواد المستخدمة في النموذج
        wingMaterial = new THREE.MeshStandardMaterial({ color: wingColorInput.value, side: THREE.DoubleSide });
        tailMaterial = new THREE.MeshStandardMaterial({ color: tailColorInput.value, side: THREE.DoubleSide });
        fuselageMaterial = new THREE.MeshStandardMaterial({ color: fuselageColorInput.value });

        // --- إنشاء الجناح ---
        // الأبعاد الأولية من المدخلات
        const span = parseFloat(wingSpanInput.value) / 100; // تحويل من سم إلى متر
        const chord = parseFloat(wingChordInput.value) / 100;
        const airfoilType = airfoilTypeInput.value;
        const sweep_deg = parseFloat(sweepAngleInput.value);

        let wingGeometry;
        let wingMesh;

        if (airfoilType === 'delta') {
            wingGeometry = createDeltaWingGeometry(span, chord);
            wingMesh = new THREE.Mesh(wingGeometry, wingMaterial);
            // No rotation needed for delta wing as it's created in the correct orientation
        } else {
            wingGeometry = createRectangularWingGeometry(span, chord, airfoilType, sweep_deg);
            wingMesh = new THREE.Mesh(wingGeometry, wingMaterial);
            // Rotate the rectangular wing to align it correctly
            wingMesh.rotation.y = -Math.PI / 2;
        }

        // Apply Taper Ratio for non-delta wings
        if (airfoilType !== 'delta') {
            const taperRatio = parseFloat(taperRatioInput.value);
            if (taperRatio < 1.0) {
                const positions = wingGeometry.attributes.position;
                const span_half = span / 2;

                for (let i = 0; i < positions.count; i++) {
                    // The extruded geometry has: x -> along the chord, y -> thickness, z -> along the span
                    const z = positions.getZ(i); // Span-wise position

                    // It's linear from 1.0 at the root (z=0) to taperRatio at the tip (z = +/- span_half)
                    const scale = 1.0 - (1.0 - taperRatio) * (Math.abs(z) / span_half);

                    // Scale the chord (x) and thickness (y)
                    positions.setX(i, positions.getX(i) * scale);
                    positions.setY(i, positions.getY(i) * scale);
                }
                positions.needsUpdate = true;
                wingGeometry.computeVertexNormals();
            }
        }
        wingGroup.add(wingMesh);

        // --- إنشاء أطراف الجناح (Winglets) ---
        const wingletType = wingletTypeInput.value;
        if (wingletType !== 'none' && airfoilType !== 'delta') {
            const wingletHeight = chord * 0.8;
            const wingletChord = chord * 0.4;
            // Use the existing geometry function to create a simple winglet shape
            const wingletGeo = createRectangularWingGeometry(wingletHeight, wingletChord, 'symmetrical', 10, 0.06);

            // Right Winglet
            const rightWinglet = new THREE.Mesh(wingletGeo, wingMaterial);
            rightWinglet.rotation.set(Math.PI / 2, -Math.PI / 2, THREE.MathUtils.degToRad(-15));
            rightWinglet.position.set(span / 2, 0, -chord / 2);
            wingGroup.add(rightWinglet);

            // Left Winglet (clone geometry and material)
            const leftWinglet = new THREE.Mesh(wingletGeo.clone(), wingMaterial);
            leftWinglet.rotation.copy(rightWinglet.rotation);
            leftWinglet.rotation.z *= -1; // Invert cant angle for the other side
            leftWinglet.position.set(-span / 2, 0, -chord / 2);
            wingGroup.add(leftWinglet);
        }

        // --- إنشاء جسم الطائرة (Fuselage) ---
        // هذا مجرد مثال، يمكنك تعديل الأبعاد
        const fuselageLength = parseFloat(fuselageLengthInput.value) / 100;
        const fuselageDiameter = parseFloat(fuselageDiameterInput.value) / 100; // cm to m
        const radiusTop = fuselageDiameter / 2;


        // --- استخدام LatheGeometry لشكل انسيابي (شكل قطرة الماء) ---
        // 1. تحديد نقاط المقطع العرضي لجسم الطائرة من الذيل إلى المقدمة
        const fuselageProfile = new THREE.SplineCurve([
            new THREE.Vector2(0.01, -fuselageLength * 0.5),      // طرف الذيل (أكبر من صفر بقليل لتجنب المشاكل الهندسية)
            new THREE.Vector2(radiusTop * 0.8, -fuselageLength * 0.4), // بداية استدقاق الذيل
            new THREE.Vector2(radiusTop, fuselageLength * 0.1),  // أعرض نقطة، متقدمة عن المنتصف
            new THREE.Vector2(radiusTop * 0.85, fuselageLength * 0.4), // بداية منحنى المقدمة
            new THREE.Vector2(0.01, fuselageLength * 0.5)       // طرف المقدمة
        ]);

        // 2. الحصول على مجموعة من النقاط السلسة من المنحنى
        const points = fuselageProfile.getPoints(50);

        // 3. إنشاء الشكل ثلاثي الأبعاد عن طريق تدوير المقطع العرضي حول المحور
        const fuselageGeometry = new THREE.LatheGeometry(points, 32).rotateZ(-Math.PI / 2);

        const fuselageMesh = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
        fuselageMesh.name = "fuselage"; // إعطاء اسم لتسهيل العثور عليه
        airplaneGroup.add(fuselageMesh);

        /*
        // --- إنشاء قمرة القيادة (Canopy) ---
        const canopyType = canopyTypeInput.value;
        if (canopyType !== 'none') {
            // استخدام مادة فيزيائية لإعطاء تأثير زجاجي واقعي
            const canopyMaterial = new THREE.MeshPhysicalMaterial({
                color: 0xadd8e6, // لون أزرق فاتح شفاف
                transmission: 0.9, // شفافية بنسبة 90%
                roughness: 0.1,
                metalness: 0.1,
                thickness: 0.05, // مطلوب لتأثير الانكسار
                ior: 1.5, // معامل الانكسار (مثل الزجاج)
                transparent: true,
                opacity: 0.5 // شفافية احتياطية للمتصفحات التي لا تدعم Transmission
            });

            let canopyMesh;

            switch (canopyType) {
                case 'bubble': {
                    // إنشاء نصف كرة وتغيير أبعادها لتبدو بيضاوية
                    const bubbleGeo = new THREE.SphereGeometry(radiusTop * 0.9, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
                    bubbleGeo.scale(0.8, 0.7, 1.2); // تغيير الأبعاد: أقل عرضًا، أقل ارتفاعًا، وأكثر طولًا
                    canopyMesh = new THREE.Mesh(bubbleGeo, canopyMaterial);
                    canopyMesh.position.set(fuselageLength * 0.2, radiusTop * 0.95, 0);
                    break;
                }
                case 'tandem': {
                    // استخدام شكل الكبسولة للحصول على شكل طويل ومستدير
                    const tandemGeo = new THREE.CapsuleGeometry(radiusTop * 0.5, fuselageLength * 0.3, 16, 32);
                    tandemGeo.rotateZ(Math.PI / 2); // محاذاتها مع جسم الطائرة
                    canopyMesh = new THREE.Mesh(tandemGeo, canopyMaterial);
                    canopyMesh.position.set(fuselageLength * 0.1, radiusTop, 0);
                    break;
                }
            }
            if (canopyMesh) airplaneGroup.add(canopyMesh);
        }
        */

        // --- تحديد موضع الجناح بناءً على اختيار المستخدم ---
        const wingPosition = wingPositionInput.value;
        let wingYOffset = 0;
        if (wingPosition === 'high') {
            // ليكون الجناح علويًا، نرفعه بمقدار نصف قطر جسم الطائرة
            wingYOffset = fuselageDiameter / 2;
        } else if (wingPosition === 'low') {
            // ليكون الجناح سفليًا، نخفضه بمقدار نصف قطر جسم الطائرة
            wingYOffset = -fuselageDiameter / 2;
        }
        // (إذا كان متوسطًا، سيبقى عند الصفر)
        wingGroup.position.y = wingYOffset;
        airplaneGroup.add(wingGroup);

        // --- إنشاء الذيل (Empennage) ---
        const hStabSpan = parseFloat(hStabSpanInput.value) / 100;
        const hStabChord = parseFloat(hStabChordInput.value) / 100;
        const vStabHeight = parseFloat(vStabHeightInput.value) / 100;
        const tailType = tailTypeInput.value;

        // مجموعة لتجميع أجزاء الذيل
        const empennageGroup = new THREE.Group();
        empennageGroup.position.x = -(fuselageLength / 2) * 0.95;

        switch (tailType) {
            case 't-tail': {
                // 1. المثبت العمودي (Vertical Stabilizer)
                const vStabGeo = createRectangularWingGeometry(vStabHeight, hStabChord, 'symmetrical', 0, 0.08);
                const vStabMesh = new THREE.Mesh(vStabGeo, tailMaterial);
                vStabMesh.rotation.x = Math.PI / 2;
                vStabMesh.position.y = vStabHeight / 2; // رفعه من القاعدة
                empennageGroup.add(vStabMesh);

                // 2. المثبت الأفقي (Horizontal Stabilizer) - فوق العمودي
                const hStabGeo = createRectangularWingGeometry(hStabSpan, hStabChord, 'symmetrical', 0.08);
                const hStabMesh = new THREE.Mesh(hStabGeo, tailMaterial);
                hStabMesh.rotation.y = -Math.PI / 2;
                hStabMesh.position.y = vStabHeight; // وضعه فوق المثبت العمودي
                empennageGroup.add(hStabMesh);
                break;
            }
            case 'v-tail': {
                const vTailAngle = THREE.MathUtils.degToRad(40); // زاوية 40 درجة من الأفقي
                const panelSpan = hStabSpan / (2 * Math.cos(vTailAngle)); // حساب طول اللوح المائل

                // إنشاء هندسة لوح واحد
                const vTailPanelGeo = createRectangularWingGeometry(panelSpan, hStabChord, 'symmetrical', 0, 0.08);

                // اللوح الأيمن
                const rightPanel = new THREE.Mesh(vTailPanelGeo, tailMaterial);
                rightPanel.rotation.y = -Math.PI / 2;
                rightPanel.rotation.z = -vTailAngle; // تدوير للأعلى
                rightPanel.position.x = (panelSpan / 2) * Math.sin(vTailAngle);
                empennageGroup.add(rightPanel);

                // اللوح الأيسر
                const leftPanel = new THREE.Mesh(vTailPanelGeo.clone(), tailMaterial);
                leftPanel.rotation.y = -Math.PI / 2;
                leftPanel.rotation.z = vTailAngle; // تدوير للأعلى في الاتجاه المعاكس
                leftPanel.position.x = -(panelSpan / 2) * Math.sin(vTailAngle);
                empennageGroup.add(leftPanel);
                break;
            }
            case 'conventional':
            default: {
                // 1. المثبت الأفقي (Horizontal Stabilizer)
                const hStabGeo = createRectangularWingGeometry(hStabSpan, hStabChord, 'symmetrical', 0.08);
                const hStabMesh = new THREE.Mesh(hStabGeo, tailMaterial);
                hStabMesh.rotation.y = -Math.PI / 2;
                hStabMesh.position.y = 0; // في منتصف جسم الطائرة
                empennageGroup.add(hStabMesh);

                // 2. المثبت العمودي (Vertical Stabilizer)
                const vStabGeo = createRectangularWingGeometry(vStabHeight, hStabChord, 'symmetrical', 0, 0.08);
                const vStabMesh = new THREE.Mesh(vStabGeo, tailMaterial);
                vStabMesh.rotation.x = Math.PI / 2;
                vStabMesh.position.y = vStabHeight / 2; // رفعه فوق المحور
                empennageGroup.add(vStabMesh);
                break;
            }
        }
        airplaneGroup.add(empennageGroup);

        // --- إنشاء المروحة (Propeller) ---
        const propellerGroup = createPropellerModel();
        // Position at the front of the fuselage
        propellerGroup.position.x = fuselageLength / 2; // Position at the nose
        propellerGroup.position.y = 0; // يبقى في المنتصف
        airplaneGroup.add(propellerGroup);

        /*
        // --- إنشاء معدات الهبوط (Landing Gear) ---
        const gearType = landingGearTypeInput.value;
        const landingGearGroup = createLandingGear(gearType, fuselageLength, fuselageDiameter, wingYOffset);
        if (landingGearGroup) airplaneGroup.add(landingGearGroup);
        */

        // إضافة المجموعة الكاملة إلى المشهد
        scene.add(airplaneGroup);
    }

    function updateAirplaneModel() {
        // Instead of rebuilding everything, we just update geometries and materials
        // This is more complex, so for now we will rebuild the group.
        if (airplaneGroup) {
            scene.remove(airplaneGroup);
            // Properly dispose of geometries and materials to avoid memory leaks
            airplaneGroup.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    // Material is reused, so no need to dispose unless it changes
                }
            });
        }

        // Re-create the entire model group
        createAirplaneModel();

        // Update rotation based on current AoA
        updateAngleOfAttack();
        updateMarkers(); // تحديث مواضع العلامات عند تغيير أبعاد النموذج
    }

    /*
    function updateTailControls() {
        const tailType = tailTypeInput.value;
        const hStabSpanGroup = document.getElementById('h-stab-span-group');
        const hStabChordGroup = document.getElementById('h-stab-chord-group');
        const vStabHeightGroup = document.getElementById('v-stab-height-group');

        // إظهار جميع الحقول بشكل افتراضي
        hStabSpanGroup.style.display = 'block';
        hStabChordGroup.style.display = 'block';
        vStabHeightGroup.style.display = 'block';

        if (tailType === 'v-tail') {
            // في حالة الذيل V، نخفي حقل ارتفاع المثبت العمودي
            vStabHeightGroup.style.display = 'none';
            // يمكن تغيير تسمية الحقول الأخرى لتكون أوضح
            hStabSpanGroup.querySelector('label').textContent = 'طول الذيل V (من الحافة للحافة)';
        } else {
            hStabSpanGroup.querySelector('label').textContent = 'طول الذيل الأفقي (سم)';
        }
    }
    */

    function updateAngleOfAttack() {
        if (!airplaneGroup) return;
        const aoa_deg = parseFloat(angleOfAttackInput.value);
        aoaValueSpan.textContent = aoa_deg.toFixed(1);
        // To pitch the nose up (positive AoA), we rotate around the Z-axis (right-wing axis)
        airplaneGroup.rotation.z = THREE.MathUtils.degToRad(aoa_deg);
    }

    function updateWingControls() {
        const airfoilType = airfoilTypeInput.value;
        if (airfoilType === 'delta') {
            sweepAngleGroup.style.display = 'none';
            taperRatioGroup.style.display = 'none';
            wingletGroup.style.display = 'none';
        } else {
            sweepAngleGroup.style.display = 'block';
            taperRatioGroup.style.display = 'block';
            wingletGroup.style.display = 'block';
        }
    }

    // --- 3.5. تحديث علامات مركز الثقل والرفع ---
    function updateMarkers() {
        if (!cgMarker || !clMarker) return;

        const chord = parseFloat(wingChordInput.value) / 100; // متر
        const cgPercent = parseFloat(cgPositionInput.value) / 100;

        // نحصل على الموضع الرأسي لمجموعة الجناح
        /*
        // Note: wingGroup.position.y is the vertical offset of the wing relative to the fuselage center.
        // The CG/CL markers are positioned relative to the wing's own coordinate system (where its Y=0).
        // So, wingYOffset is not directly needed for the Z (X-axis) position of the markers.
        // The Z-axis of the wing geometry is aligned with the aircraft's X-axis (length).
        // The X-axis of the wing geometry is aligned with the aircraft's Z-axis (span).
        // So, 'z' positions for markers correspond to 'x' positions on the aircraft.

        // --- حساب مركز الثقل (CG) المحسوب (الموضع X) ---
        */

        // --- مركز الثقل المرغوب (من إدخال المستخدم) للعرض المرئي للعلامة ---
        // The wing's local Z-axis corresponds to the aircraft's X-axis (length).
        // The wing's local X-axis corresponds to the aircraft's Z-axis (span).
        // So, cg_z and cl_z are actually X-coordinates on the aircraft.
        // بعد تدوير الجناح، الحافة الأمامية تكون عند z=0 والحافة الخلفية عند z=-chord
        // مركز الرفع (CL) يكون عادة عند 25% من عرض الجناح من الحافة الأمامية
        const cl_z = -chord * 0.25;
        // مركز الثقل (CG) يتم تحديده من قبل المستخدم كنسبة مئوية من الحافة الأمامية
        const cg_z = -chord * cgPercent;

        // Update marker positions based on the DESIRED CG (from user input)
        // Y-offset is for visual separation from the fuselage/wing
        clMarker.position.set(0, 0.05, cl_z); // CL marker is above the wing
        cgMarker.position.set(0, -0.05, cg_z); // CG marker is below the wing

        // --- التحقق من الاستقرار ---
        if (stabilityWarning) {
            // إذا كان مركز الثقل (cg_z) خلف مركز الرفع (cl_z)
            // (قيم z سالبة، لذا القيمة الأصغر تعني أبعد للخلف)
            // نستخدم مركز الثقل المحسوب للتحقق من الاستقرار.
            // If calculated_cg_x_m (which is an X-coordinate) is less than cl_z (which is also an X-coordinate),
            // it means CG is behind CL, which is unstable.
            // For now, we use the user-defined CG for the warning
            if (cg_z < cl_z) { // CG is behind CL
                stabilityWarning.classList.remove('hidden');
            } else {
                stabilityWarning.classList.add('hidden');
            }
        }
    }

    // --- 4. الحسابات الديناميكية الهوائية (مبسطة) ---

    /**
     * Calculates the Wing's Lift Coefficient (Cl) based on Angle of Attack and airfoil type.
     * @param {number} aoa_deg - Angle of Attack in degrees.
     * @param {string} airfoilType - The type of airfoil.
     * @returns {{Cl: number, Cd: number}}
     */
    function getAeroCoefficients(aoa_deg, airfoilType) {
        let zero_lift_aoa_deg = 0;
        let stall_angle_deg = 15;
        const sweep_deg = (airfoilType === 'delta') ? 35 : parseFloat(sweepAngleInput.value); // Assume 35 deg sweep for delta for aero calcs
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
                stall_angle_deg = 25; // Delta wings stall at higher AoA
                break;
        }

        const effective_aoa_deg = aoa_deg - zero_lift_aoa_deg;
        const effective_aoa_rad = THREE.MathUtils.degToRad(effective_aoa_deg);

        // --- تحسينات مقترحة لـ Cl ---
        // 1. استخدام منحنى رفع خطي مع تصحيح للميلان (الحالي)
        // في نموذج أكثر تقدمًا، يمكن استبدال هذا بجداول بحث (Lookup Tables) لبيانات الجنيح الحقيقية.
        let Cl = (2 * Math.PI * effective_aoa_rad) * Math.cos(sweep_rad);

        // 2. نموذج توقف (Stall Model) أكثر دقة باستخدام Cl_max
        const Cl_max = 1.4; // قيمة تقديرية لـ Cl الأقصى قبل التوقف
        if (aoa_deg > stall_angle_deg) {
            // بعد التوقف، ينخفض الرفع. هذا تقريب بسيط.
            Cl *= (1 - (aoa_deg - stall_angle_deg) / 10);
            Cl = Math.max(0, Cl); // منع الرفع من أن يصبح سالبًا
        }
        Cl = Math.min(Cl, Cl_max); // التأكد من أن الرفع لا يتجاوز القيمة القصوى

        // تم نقل حساب السحب إلى دالة منفصلة لتحسين الدقة
        return { Cl };
    }

    /**
     * Calculates the total Drag Coefficient (Cd) for the entire aircraft.
     * This function combines parasitic drag from all components and induced drag.
     * @param {number} Cl - Lift Coefficient of the wing.
     * @param {string} airfoilType - The type of airfoil.
     * @param {number} wingArea - The wing reference area.
     * @returns {number} Total Drag Coefficient.
     */
    function calculateTotalDragCoefficient(Cl, airfoilType, wingArea) {
        const wingletTypeInput = document.getElementById('winglet-type');
        // --- 1. السحب الطفيلي (Parasitic Drag - Cd0) ---
        // هذا هو مجموع السحب من جميع المكونات غير المنتجة للرفع.
        // هذه القيم هي تقديرات تقريبية.
        const Cd0_wing = 0.008;      // سحب احتكاك وشكل الجناح
        const Cd0_fuselage = 0.005;  // سحب جسم الطائرة
        const Cd0_tail = 0.003;      // سحب مجموعة الذيل
        let Cd0_landingGear = 0;     // سحب معدات الهبوط (يبدأ من الصفر)
        const Cd0_canopy = 0;          // سحب قمرة القيادة (يبدأ من الصفر)


        const Cd0_total = Cd0_wing + Cd0_fuselage + Cd0_tail + Cd0_landingGear + Cd0_canopy;

        // --- 2. السحب المستحث (Induced Drag) ---
        // حساب نسبة الأبعاد (Aspect Ratio)
        const span = parseFloat(wingSpanInput.value) / 100;
        const AR = (wingArea > 0) ? (span * span) / wingArea : 6; // قيمة افتراضية 6 لتجنب القسمة على صفر

        // عامل كفاءة أوزوالد (e). يتراوح بين 0.7 و 0.95. الجنيحات تحسنه.
        let oswaldEfficiency = 0.8;
        const wingletType = wingletTypeInput ? wingletTypeInput.value : 'none';
        if (wingletType === 'standard' && airfoilType !== 'delta') {
            oswaldEfficiency = 0.85; // تحسين بسيط للكفاءة مع الجنيحات
        }

        const k = 1 / (Math.PI * AR * oswaldEfficiency);
        const Cd_induced = k * Math.pow(Cl, 2);

        // --- 3. السحب الكلي ---
        const Cd_total = Cd0_total + Cd_induced;

        return Cd_total;
    }

    /**
     * Calculates the wing area based on its geometry.
     * @returns {number} Wing area in m².
     */
    function calculateWingArea() {
        const span = parseFloat(wingSpanInput.value) / 100;
        const rootChord = parseFloat(wingChordInput.value) / 100;
        const airfoilType = airfoilTypeInput.value;

        if (airfoilType === 'delta') {
            // Area of a triangle
            return 0.5 * span * rootChord;
        } else {
            // Area of a trapezoid (or rectangle if taper is 1.0)
            const taperRatio = parseFloat(taperRatioInput.value);
            const tipChord = rootChord * taperRatio;
            return span * (rootChord + tipChord) / 2;
        }
    }

    /**
     * Calculates air density based on the International Standard Atmosphere model.
     * @param {number} temperatureC - Temperature in Celsius.
     * @param {number} altitudeM - Altitude in meters.
     * @returns {number} Air density in kg/m³.
     */
    function calculateAirDensity(temperatureC, altitudeM) {
        const T0 = 288.15; // Standard sea-level temperature (15°C) in Kelvin
        const P0 = 101325; // Standard sea-level pressure in Pascals
        const L = -0.0065; // Temperature lapse rate in K/m
        const R = 287.058; // Specific gas constant for dry air in J/(kg·K)
        const g = 9.80665; // Gravitational acceleration in m/s²

        // Temperature in Kelvin from user input
        const T_user_K = temperatureC + 273.15;

        // Pressure at altitude (using standard atmosphere model)
        const P = P0 * Math.pow(1 + (L * altitudeM) / T0, -g / (R * L));

        // Density using the ideal gas law with user-provided temperature
        const density = P / (R * T_user_K);

        return density;
    }

    function updateCalculations() {
        // الحصول على القيم من المدخلات
        const span = parseFloat(wingSpanInput.value) / 100; // متر
        const chord = parseFloat(wingChordInput.value) / 100; // متر
        const speedKmh = parseFloat(document.getElementById('air-speed').value); // كم/ساعة
        const propDiameterIn = parseFloat(propDiameterInput.value); // inches
        const propPitchIn = parseFloat(propPitchInput.value); // inches
        const tempC = parseFloat(document.getElementById('air-temp').value);
        const altitudeM = parseFloat(document.getElementById('altitude').value);
        const aoa_deg = parseFloat(document.getElementById('angle-of-attack').value);
        const airfoilType = airfoilTypeInput.value;
        const motorRpm = parseFloat(document.getElementById('motor-rpm').value);

        const totalWeightG = parseFloat(planeWeightInput.value);

        // --- حسابات أساسية ---
        const area = calculateWingArea();
        const speedMps = speedKmh * (1000 / 3600); // تحويل إلى متر/ثانية

        // --- حسابات ديناميكا الهواء (تقديرية) ---
        // كثافة الهواء الآن ديناميكية
        const airDensity = calculateAirDensity(tempC, altitudeM);
        // 1. حساب معامل الرفع للجناح
        const { Cl: liftCoefficient } = getAeroCoefficients(aoa_deg, airfoilType);
        // 2. حساب معامل السحب الكلي للطائرة
        const totalDragCoefficient = calculateTotalDragCoefficient(liftCoefficient, airfoilType, area);

        // معادلة الرفع: L = 0.5 * Cl * ρ * v² * A
        const liftForce = 0.5 * liftCoefficient * airDensity * Math.pow(speedMps, 2) * area;

        // معادلة السحب: D = 0.5 * Cd * ρ * v² * A
        const dragForce = 0.5 * totalDragCoefficient * airDensity * Math.pow(speedMps, 2) * area;

        // Simplified thrust calculation
        const propDiameterM = propDiameterIn * 0.0254; // تحويل من بوصة إلى متر
        const propPitchM = propPitchIn * 0.0254; // تحويل من بوصة إلى متر
        const revsPerSec = motorRpm / 60;
        const thrustConstant = 0.1; // ثابت تجريبي تقديري

        const staticThrust = thrustConstant * propPitchM * airDensity * Math.pow(revsPerSec, 2) * Math.pow(propDiameterM, 3);



        // --- حساب نسبة الدفع إلى الوزن (TWR) ---
        const planeMassKg = totalWeightG / 1000; // تحويل جرام إلى كجم
        const planeWeightN = planeMassKg * 9.81; // تحويل الكتلة (كجم) إلى وزن (نيوتن)

        let twrText = 'N/A';
        if (planeWeightN > 0) {
            const twr = staticThrust / planeWeightN;
            twrText = `${twr.toFixed(2)}:1`;
        }

        // --- تحديث واجهة المستخدم بالنتائج ---
        densityResult.textContent = `${airDensity.toFixed(4)} kg/m³`;
        clResult.textContent = liftCoefficient.toFixed(3);
        cdResult.textContent = totalDragCoefficient.toFixed(3); // استخدام السحب الكلي المحسوب
        areaResult.textContent = `${area.toFixed(2)} م²`;
        liftResult.textContent = `${liftForce.toFixed(2)} نيوتن`;
        dragResult.textContent = `${dragForce.toFixed(2)} نيوتن`;
        thrustResult.textContent = `${staticThrust.toFixed(2)} نيوتن`; // تحديث قيمة الدفع
        twrResult.textContent = twrText;
    }

    // --- 4.6. Airflow Visualization ---

    function createAirflow() {
        const particleCount = 5000;
        const particles = new Float32Array(particleCount * 3);
        const flowVolume = { width: 5, height: 2, depth: 4 };

        for (let i = 0; i < particleCount; i++) {
            particles[i * 3] = (Math.random() - 0.5) * flowVolume.width; // x
            particles[i * 3 + 1] = (Math.random() - 0.5) * flowVolume.height; // y
            particles[i * 3 + 2] = (Math.random() - 0.5) * flowVolume.depth; // z
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
        airflowParticles.visible = false; // Initially hidden
        scene.add(airflowParticles);
    }

    function updateAirflow() {
        if (!airflowVisible || !airflowParticles) return;

        const positions = airflowParticles.geometry.attributes.position.array;
        const flowSpeed = 0.03;
        const flowVolume = { width: 5, height: 2, depth: 4 };

        const wing_chord = parseFloat(wingChordInput.value) / 100;
        const wing_span = parseFloat(wingSpanInput.value) / 100;
        const airfoilType = airfoilTypeInput.value;

        for (let i = 0; i < positions.length; i += 3) {
            positions[i] += flowSpeed; // Move particle along X-axis

            // Check if particle is roughly where the wing is
            if (positions[i] > -wing_span / 2 && positions[i] < wing_span / 2 && Math.abs(positions[i + 2]) < wing_chord) {
                const normalized_z = positions[i + 2] / wing_chord;
                let camber_effect = 0;
                if (airfoilType === 'flat-bottom') camber_effect = 0.003;
                else if (airfoilType === 'semi-symmetrical') camber_effect = 0.0015;
                // No camber effect for symmetrical or delta wings in this simple model
                const deflection = camber_effect * (1 - Math.pow(2 * normalized_z, 2));
                if (deflection > 0) positions[i + 1] += deflection;
            }

            // Reset particle if it goes past the view
            if (positions[i] > flowVolume.width / 2) {
                positions[i] = -flowVolume.width / 2;
                positions[i + 1] = (Math.random() - 0.5) * flowVolume.height;
                positions[i + 2] = (Math.random() - 0.5) * flowVolume.depth;
            }
        }
        airflowParticles.geometry.attributes.position.needsUpdate = true;
    }

    // --- 4.5. الرسوم البيانية ---

    /**
     * Creates and configures a new performance chart.
     * @param {string} canvasId - The ID of the canvas element.
     * @param {string} label - The label for the dataset.
     * @param {string} yAxisLabel - The label for the Y-axis.
     * @param {string} borderColor - The color of the line.
     * @param {string} backgroundColor - The color of the area under the line.
     * @param {string} xAxisLabel - The label for the X-axis.
     * @returns {Chart|null} The new Chart.js instance or null if canvas not found.
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
                    tension: 0.4 // يجعل الخط منحنياً
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
                    legend: { display: false } // We have a title, so legend is redundant
                }
            }
        });
    }

    function updatePerformanceCharts() {
        if (!liftChart && !dragChart) return;

        const span = parseFloat(wingSpanInput.value) / 100;
        const chord = parseFloat(wingChordInput.value) / 100;
        const airfoilType = airfoilTypeInput.value;
        const area = calculateWingArea();
        const tempC = parseFloat(airTempInput.value);
        const altitudeM = parseFloat(altitudeInput.value);
        const airDensity = calculateAirDensity(tempC, altitudeM);
        const speedKmh = parseFloat(document.getElementById('air-speed').value);
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

    // --- 5. ربط الأحداث ودورة الحياة ---

    function setupEventListeners() {
        // Initial UI setup
        updateWingControls();
        // Initial update for calculated CG display
        updateMarkers();

        // Update wing controls visibility when airfoil type changes
        airfoilTypeInput.addEventListener('input', updateWingControls);

        // Listener for the airflow toggle
        toggleAirflowInput.addEventListener('change', () => {
            airflowVisible = toggleAirflowInput.checked;
            if (airflowParticles) {
                airflowParticles.visible = airflowVisible;
            }
        });

        togglePropAnimInput.addEventListener('change', () => {
            isPropellerSpinning = togglePropAnimInput.checked;
        });

        // ربط أحداث تغيير اللون
        wingColorInput.addEventListener('input', (event) => {
            if (wingMaterial) wingMaterial.color.set(event.target.value);
        });

        fuselageColorInput.addEventListener('input', (event) => {
            if (airplaneGroup) {
                const fuselage = airplaneGroup.getObjectByName('fuselage');
                if (fuselage) fuselage.material.color.set(event.target.value);
            }
        });

        tailColorInput.addEventListener('input', (event) => {
            if (tailMaterial) tailMaterial.color.set(event.target.value);
        });

        // Simplified event listeners for all inputs
        const allInputs = document.querySelectorAll('.controls-panel input, .controls-panel select');
        allInputs.forEach(input => {
            // Use 'input' for range sliders and 'change' for others for better performance
            const eventType = (input.type === 'range') ? 'input' : 'change';
            input.addEventListener(eventType, () => {
                // Update text spans for range sliders immediately
                if (input.id === 'sweep-angle') {
                    sweepAngleValueSpan.textContent = input.value;
                }
                if (input.id === 'taper-ratio') {
                    taperRatioValueSpan.textContent = parseFloat(input.value).toFixed(2);
                }
                if (input.id === 'angle-of-attack') {
                    aoaValueSpan.textContent = parseFloat(input.value).toFixed(1);
                }

                updateAirplaneModel(); // This also calls updateAngleOfAttack and updateMarkers
                updateCalculations();
                updatePerformanceCharts();
            });
        });


        // مراقبة تغيير الوضع الليلي لتحديث ألوان الرسم البياني
        const themeObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const charts = [liftChart, dragChart].filter(c => c); // Get existing charts
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
                }
            }
        });
        themeObserver.observe(document.body, { attributes: true });

        // تحديث حجم العارض عند تغيير حجم النافذة
        window.addEventListener('resize', () => {
            camera.aspect = viewerContainer.clientWidth / viewerContainer.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
        });
    }

    // دالة حلقة الرسوم المتحركة (يتم استدعاؤها في كل إطار)
    function animate() {
        requestAnimationFrame(animate);

        if (airflowVisible) updateAirflow(); // Update airflow only if visible

        // Spin the propeller (which is inside the airplaneGroup)
        if (isPropellerSpinning && airplaneGroup) {
            const propellerGroup = airplaneGroup.getObjectByName("propeller");
            if (propellerGroup) {
                // The propeller spins around its own forward axis (X-axis of the propeller model)
                propellerGroup.rotation.x += 0.4;
            }
        }

        // تحديث متحكمات الماوس
        controls.update();

        // عرض المشهد
        renderer.render(scene, camera);
    }

    // --- 6. التشغيل ---
    init();
});
