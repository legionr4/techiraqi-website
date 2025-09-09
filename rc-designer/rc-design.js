// --- إعداد المشهد ثلاثي الأبعاد ---
const canvas = document.getElementById('viewer-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);
const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
camera.position.set(1.5, 1, 2);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(canvas.clientWidth, canvas.clientHeight);

// --- إضافة عناصر التحكم بالكاميرا ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // يضيف تأثير القصور الذاتي للحركة
controls.dampingFactor = 0.1;

// --- إضافة إضاءة ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// --- إضافة محاور XYZ ---
const axesHelper = new THREE.AxesHelper( 2 ); // الرقم 2 يحدد حجم المحاور
scene.add( axesHelper );

// --- إنشاء أجزاء الطائرة ---
const planeGroup = new THREE.Group();
const fuselageMaterial = new THREE.MeshStandardMaterial({ color: 0x0056b3, side: THREE.DoubleSide });
const wingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide });
const aileronMaterial = new THREE.MeshStandardMaterial({ color: 0xffc107, side: THREE.DoubleSide });

// جسم الطائرة
const fuselageGeom = new THREE.BoxGeometry(1, 0.15, 0.15);
const fuselage = new THREE.Mesh(fuselageGeom, fuselageMaterial);
planeGroup.add(fuselage);

// مجموعة الجناح (سيتم إنشاؤها ديناميكيًا)
const wingGroup = new THREE.Group();
planeGroup.add(wingGroup);

// مجموعة الذيل (سيتم إنشاؤها ديناميكيًا)
const tailGroup = new THREE.Group();
planeGroup.add(tailGroup);

// مجموعة أسطح التحكم في الذيل
const tailControlsGroup = new THREE.Group();
planeGroup.add(tailControlsGroup);


// المروحة
const propellerGroup = new THREE.Group();
const propBladeGeom = new THREE.BoxGeometry(0.02, 0.25, 0.01);
const propMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

propellerGroup.position.x = 0.55;
planeGroup.add(propellerGroup);

scene.add(planeGroup);

// --- دوال التحديث والحساب ---

/**
 * يقرأ قيمة رقمية من حقل الإدخال، ويتحقق من صحتها (ضد القيم غير الرقمية، والحد الأدنى/الأقصى)،
 * ويقدم ملاحظات مرئية للمدخلات غير الصحيحة.
 * @param {HTMLInputElement} inputElement عنصر الإدخال المراد تحليله.
 * @returns {number} الرقم الصحيح الذي تم تحليله أو قيمته الافتراضية.
 */
function getValidNumber(inputElement) {
    // إعادة تعيين لون الحدود أولاً
    inputElement.style.borderColor = ''; // العودة إلى الافتراضي من ورقة الأنماط

    const value = parseFloat(inputElement.value);
    const min = parseFloat(inputElement.min);
    const max = parseFloat(inputElement.max);

    let isValid = !isNaN(value);

    if (isValid && !isNaN(min)) {
        isValid = value >= min;
    }
    if (isValid && !isNaN(max)) {
        isValid = value <= max;
    }
    
    // معظم أبعادنا المادية لا ينبغي أن تكون سلبية
    if (inputElement.type === 'number' && inputElement.id !== 'angle-of-attack' && value < 0) {
        isValid = false;
    }

    if (isValid) {
        return value;
    } else {
        inputElement.style.borderColor = '#dc3545'; // لون الخطر
        // الرجوع إلى القيمة الافتراضية المحددة في سمة `value` في HTML
        return parseFloat(inputElement.defaultValue) || 0;
    }
}

/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const form = document.getElementById('plane-form');
const allControls = form.querySelectorAll('input, select');

// قاموس معاملات التحويل إلى المتر
const UNIT_CONVERSIONS = {
    'm': 1.0,
    'cm': 0.01,
    'mm': 0.001,
    'in': 0.0254
};

// قاموس كثافة المواد (كجم/م³)
const MATERIAL_DENSITIES = {
    'foam': 45,   // متوسط كثافة فوم EPO
    'balsa': 160, // خشب البلسا
    'plastic': 1050 // بلاستيك ABS
};

// تخزين عناصر الإدخال والنتائج لتحسين الأداء
const unitSelector = document.getElementById('unit-selector');
const wingSpanInput = document.getElementById('wing-span');
const wingChordInput = document.getElementById('wing-chord');
const tailSpanInput = document.getElementById('tail-span');

const tailChordInput = document.getElementById('tail-chord');
const tailTypeInput = document.getElementById('tail-type');
const vStabHeightInput = document.getElementById('v-stab-height');
const vStabChordInput = document.getElementById('v-stab-chord');
const vTailAngleInput = document.getElementById('v-tail-angle');
const hasElevatorInput = document.getElementById('has-elevator');
const elevatorControls = document.getElementById('elevator-controls');
const elevatorWidthInput = document.getElementById('elevator-width');
const hasRudderInput = document.getElementById('has-rudder');
const rudderControls = document.getElementById('rudder-controls');
const rudderWidthInput = document.getElementById('rudder-width');
const tailSweepAngleInput = document.getElementById('tail-sweep-angle');
const tailTaperRatioInput = document.getElementById('tail-taper-ratio');
const tailAirfoilTypeInput = document.getElementById('tail-airfoil-type');

const vStabGroup = document.getElementById('v-stab-group');
const vStabChordGroup = document.getElementById('v-stab-chord-group');
const vTailAngleGroup = document.getElementById('v-tail-angle-group');
const wingThicknessInput = document.getElementById('wing-thickness');
const wingPositionInput = document.getElementById('wing-position');
const airfoilTypeInput = document.getElementById('airfoil-type');
const sweepAngleInput = document.getElementById('sweep-angle');
const taperRatioInput = document.getElementById('taper-ratio');

const hasWingtipInput = document.getElementById('has-wingtip');
const wingtipLengthInput = document.getElementById('wingtip-length');
const wingtipWidthInput = document.getElementById('wingtip-width');
const wingtipThicknessInput = document.getElementById('wingtip-thickness');
const wingtipPositionInput = document.getElementById('wingtip-position');
const wingtipAngleInput = document.getElementById('wingtip-angle');
const wingtipControls =  document.getElementById('wingtip-controls');

const hasAileronInput = document.getElementById('has-aileron');
const aileronLengthInput = document.getElementById('aileron-length');
const aileronWidthInput = document.getElementById('aileron-width');
const aileronThicknessInput = document.getElementById('aileron-thickness');
const aileronPositionInput = document.getElementById('aileron-position');
const elevatorLengthInput = document.getElementById('elevator-length');
const rudderLengthInput = document.getElementById('rudder-length');
const aileronControls = document.getElementById('aileron-controls');


const fuselageLengthInput = document.getElementById('fuselage-length');
const structureMaterialInput = document.getElementById('structure-material');
const propDiameterInput = document.getElementById('prop-diameter');
const propBladesInput = document.getElementById('prop-blades');
const propPitchInput = document.getElementById('prop-pitch');
const propRpmInput = document.getElementById('prop-rpm');
const angleOfAttackInput = document.getElementById('angle-of-attack');
const airSpeedInput = document.getElementById('air-speed');
const airDensityInput = document.getElementById('air-density');
const planeWeightInput = document.getElementById('plane-weight');
const fuselageColorInput = document.getElementById('fuselage-color');
const wingColorInput = document.getElementById('wing-color');
const tailColorInput = document.getElementById('tail-color');
const aileronColorInput = document.getElementById('aileron-color');

// عناصر عرض قيم شريط التمرير
const sweepValueEl = document.getElementById('sweep-value');
const taperValueEl = document.getElementById('taper-value');
const tailSweepValueEl = document.getElementById('tail-sweep-value');
const tailTaperValueEl = document.getElementById('tail-taper-value');
const unitLabels = document.querySelectorAll('.unit-label');



const liftResultEl = document.getElementById('lift-result');
const dragResultEl = document.getElementById('drag-result');
const thrustResultEl = document.getElementById('thrust-result');
const twrResultEl = document.getElementById('twr-result');
const wingAreaResultEl = document.getElementById('wing-area-result');
const wingWeightResultEl = document.getElementById('wing-weight-result');
const tailAreaResultEl = document.getElementById('tail-area-result');
const tailWeightResultEl = document.getElementById('tail-weight-result');
const totalWeightResultEl = document.getElementById('total-weight-result');

let liftChart, dragChart;

/**
 * Generates points for various airfoil shapes.
 * @param {number} chord The chord length.
 * @param {number} thickness The maximum thickness.
 * @param {string} airfoilType The type of airfoil ('symmetrical', 'flat-bottom', etc.).
 * @param {number} numPoints The number of points to generate for the top surface.
 * @returns {THREE.Vector2[]} An array of Vector2 points defining the airfoil outline.
 */
function generateAirfoil(chord, thickness, airfoilType, numPoints = 15) {
    const points = [];
    const halfThickness = thickness / 2;
    // معادلة محسنة لشكل المقطع الهوائي تعطي حافة أمامية مستديرة وحافة خلفية حادة
    const airfoilCurve = (x) => 0.594689181 * (0.298222773 * Math.sqrt(x) - 0.127125232 * x - 0.357907906 * Math.pow(x, 2) + 0.291984971 * Math.pow(x, 3) - 0.105174606 * Math.pow(x, 4));

    if (airfoilType === 'rectangular') {
        // Top side
        for (let i = 0; i <= numPoints; i++) {
            const x_norm = i / numPoints;
            points.push(new THREE.Vector2(x_norm * chord, halfThickness)); // Simple rectangle
        }
        // Bottom side
        for (let i = numPoints - 1; i >= 1; i--) {
            const x_norm = i / numPoints;
            points.push(new THREE.Vector2(x_norm * chord, -halfThickness));
        }
        // Center horizontally and flip
        points.forEach(p => { p.x = (chord / 2) - p.x; });
    } else if (airfoilType === 'flat-bottom') {
        // Top surface
        for (let i = 0; i <= numPoints; i++) {
            const x_norm = i / numPoints;
            points.push(new THREE.Vector2(x_norm * chord, thickness * airfoilCurve(x_norm) - (thickness / 2)));
        }
        // Bottom surface (flat)
        for (let i = numPoints - 1; i >= 1; i--) {
            const x_norm = i / numPoints;
            points.push(new THREE.Vector2(x_norm * chord, -thickness / 2));
        }

        // Center horizontally and flip
        points.forEach(p => { p.x = (chord / 2) - p.x; });
    } else { // Symmetrical and Semi-symmetrical
        let bottomFactor = (airfoilType === 'semi-symmetrical') ? 0.6 : 1.0;
        // Top surface
        for (let i = 0; i <= numPoints; i++) {
            const x_norm = i / numPoints;
            points.push(new THREE.Vector2(x_norm * chord, thickness * airfoilCurve(x_norm)));
        }
        // Bottom surface
        for (let i = numPoints - 1; i >= 1; i--) {
            const x_norm = i / numPoints;
            points.push(new THREE.Vector2(x_norm * chord, -bottomFactor * thickness * airfoilCurve(x_norm)));
        }
        // Center vertically
        points.forEach(p => p.y -= (thickness - bottomFactor * thickness) / 2);
        // Center horizontally and flip
        points.forEach(p => { p.x = (chord / 2) - p.x; });
    }

    return points;
}

function updatePlaneModel() {
    const conversionFactor = UNIT_CONVERSIONS[unitSelector.value];

    // قراءة قيم الجناح
    const wingSpan = getValidNumber(wingSpanInput) * conversionFactor;
    const wingChord = getValidNumber(wingChordInput) * conversionFactor;
    const wingThickness = getValidNumber(wingThicknessInput) * conversionFactor;
    const wingPosition = wingPositionInput.value;
    const airfoilType = airfoilTypeInput.value;
    const sweepAngle = getValidNumber(sweepAngleInput);
    const taperRatio = getValidNumber(taperRatioInput);


    // قراءة القيم الأخرى
    const tailSpan = getValidNumber(tailSpanInput) * conversionFactor;
    const tailChord = getValidNumber(tailChordInput) * conversionFactor;
    const fuselageLength = getValidNumber(fuselageLengthInput) * conversionFactor;
    const tailType = tailTypeInput.value;
    const vStabHeight = getValidNumber(vStabHeightInput) * conversionFactor;
    const vStabChord = getValidNumber(vStabChordInput) * conversionFactor;
    const vTailAngle = getValidNumber(vTailAngleInput);
    const tailSweepAngle = getValidNumber(tailSweepAngleInput);
    const tailAirfoilType = tailAirfoilTypeInput.value;
    const tailTaperRatio = getValidNumber(tailTaperRatioInput);
    
    // قيم المروحة تبقى بالبوصة كما هي متعارف عليها
    const propDiameter = getValidNumber(propDiameterInput) * 0.0254; // to meters
    const propBlades = parseInt(getValidNumber(propBladesInput));
    const fuselageColor = fuselageColorInput.value;
    const wingColor = wingColorInput.value;
    const tailColor = tailColorInput.value;

    // تحديث الألوان
    fuselageMaterial.color.set(fuselageColor);
    wingMaterial.color.set(wingColor);
    tailMaterial.color.set(tailColor);
    aileronMaterial.color.set(aileronColorInput.value);

     // Wingtip Controls visibility
    if(hasWingtipInput.checked){
        wingtipControls.style.display = 'block';
    }else{
         wingtipControls.style.display = 'none';
    }

    // Aileron Controls visibility
    if (hasAileronInput.checked) {
        aileronControls.style.display = 'block';
    } else {
        aileronControls.style.display = 'none';
    }

    // Tail Controls visibility
    vTailAngleGroup.style.display = tailType === 'v-tail' ? 'flex' : 'none';
    vStabGroup.style.display = tailType !== 'v-tail' ? 'flex' : 'none';
    vStabChordGroup.style.display = tailType !== 'v-tail' ? 'flex' : 'none';

    elevatorControls.style.display = hasElevatorInput.checked ? 'block' : 'none';
    if (hasRudderInput.checked && tailType !== 'v-tail') {
        rudderControls.style.display = 'block';
    } else if (hasRudderInput.checked && tailType === 'v-tail') {
        rudderControls.style.display = 'block';
        rudderControls.querySelector('label').textContent = 'عرض سطح التحكم (Ruddervator)';
    } else {
        rudderControls.style.display = 'none';
    }






    // --- تحديث أبعاد الجناح (باستخدام شكل مقطع هوائي حقيقي) ---
    while(wingGroup.children.length > 0){ 
        wingGroup.remove(wingGroup.children[0]); 
    }

    const halfSpan = wingSpan / 2;
    const rootChord = wingChord;
    const sweepRad = sweepAngle * Math.PI / 180;

    // إنشاء بنية هندسية مخصصة للجناح
    const wingGeometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const segments = 10; // عدد المقاطع على طول الجناح لزيادة الدقة
    const pointsPerSection = (15 * 2); // 15 نقطة للسطح العلوي و 15 للسفلي

    // إنشاء نقاط لكل مقطع على طول الجناح
    const aileronActive = hasAileronInput.checked;
    const aileronLength = getValidNumber(aileronLengthInput) * conversionFactor;
    const aileronWidth = getValidNumber(aileronWidthInput) * conversionFactor;
    const aileronPosition = getValidNumber(aileronPositionInput) * conversionFactor;
    const aileronZStart = halfSpan - aileronPosition - aileronLength;
    const aileronZEnd = halfSpan - aileronPosition;


    for (let i = 0; i <= segments; i++) {
        const spanProgress = i / segments;
        const currentZ = spanProgress * halfSpan;
        const currentChord = rootChord + (rootChord * taperRatio - rootChord) * spanProgress;
        const currentSweep = currentZ * Math.tan(sweepRad);
        const airfoilPoints = generateAirfoil(currentChord, wingThickness, airfoilType, 15);

        airfoilPoints.forEach(p => {
            vertices.push(p.x + currentSweep, p.y, currentZ);
        });
    }

    // إنشاء الأوجه (المثلثات) التي تربط النقاط ببعضها
    for (let i = 0; i < segments; i++) {
        const z_start = (i / segments) * halfSpan;

        for (let j = 0; j < pointsPerSection; j++) {
            // Check if this face is part of the aileron cutout
            const isAileronZone = aileronActive && z_start >= aileronZStart && z_start < aileronZEnd;
            const p1_vertex_index = (i * pointsPerSection + j) * 3;
            const p1_x = vertices[p1_vertex_index];
            const currentChord = rootChord + (rootChord * taperRatio - rootChord) * (z_start / halfSpan);
            const sweepAtZ = z_start * Math.tan(sweepRad);
            // The wing is flipped, so leading edge is at +x, trailing edge is at -x.
            const isTrailingEdgeFace = (p1_x - sweepAtZ) < (-currentChord / 2) + aileronWidth;

            if (isAileronZone && isTrailingEdgeFace) {
                continue; // Skip creating this face, effectively creating a hole
            }

            const p1 = i * pointsPerSection + j;
            const p2 = i * pointsPerSection + ((j + 1) % pointsPerSection);
            const p3 = (i + 1) * pointsPerSection + j;
            const p4 = (i + 1) * pointsPerSection + ((j + 1) % pointsPerSection);
            indices.push(p1, p3, p4, p1, p4, p2);
        }
    }

    // إضافة غطاء لنهاية الجناح (wing tip) لسد الفتحة
    const tipStartIndex = segments * pointsPerSection;
    for (let j = 1; j < pointsPerSection - 1; j++) {
        // The vertices should be wound counter-clockwise to face outwards
        indices.push(tipStartIndex, tipStartIndex + j + 1, tipStartIndex + j);
    }

    wingGeometry.setIndex(indices);
    wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    wingGeometry.computeVertexNormals(); // لحساب الإضاءة بشكل صحيح

    // إزاحة الجناح ليبدأ من جانب جسم الطائرة بدلاً من المركز
    wingGeometry.translate(0, 0, fuselage.geometry.parameters.depth / 2);

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    const leftWing = rightWing.clone();
    leftWing.scale.z = -1; // عكس الجناح الأيسر

    wingGroup.add(rightWing, leftWing);
     // Wingtip
    if (hasWingtipInput.checked) {
        const wingtipLength = getValidNumber(wingtipLengthInput) * conversionFactor;
        const wingtipWidth = getValidNumber(wingtipWidthInput) * conversionFactor;
        const wingtipThickness = getValidNumber(wingtipThicknessInput) * conversionFactor;
        const wingtipPosition = getValidNumber(wingtipPositionInput) * conversionFactor;
        const wingtipAngle = getValidNumber(wingtipAngleInput) * Math.PI / 180; // Convert to radians

        const wingtipShape = new THREE.Shape();
        wingtipShape.moveTo(-wingtipWidth / 2, 0);
        wingtipShape.lineTo(wingtipWidth / 2, 0);
        wingtipShape.lineTo(wingtipWidth / 2, wingtipLength);
        wingtipShape.lineTo(-wingtipWidth / 2, wingtipLength);
        wingtipShape.closePath();

        const extrudeSettings = {
            depth: wingtipThickness,
            bevelEnabled: false,
        };

        const wingtipGeometry = new THREE.ExtrudeGeometry(wingtipShape, extrudeSettings);
        const wingtipMaterial = new THREE.MeshStandardMaterial({ color: wingMaterial.color, side: THREE.DoubleSide });
        const rightWingtip = new THREE.Mesh(wingtipGeometry, wingtipMaterial);

        // Position the wingtip at the end of the main wing
        const tipSection = wingGeometry.attributes.position.array.slice(tipStartIndex * 3, (tipStartIndex + pointsPerSection) * 3);
        const tipCentroid = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < tipSection.length; i += 3) {
            tipCentroid.x += tipSection[i];
            tipCentroid.y += tipSection[i + 1];
            tipCentroid.z += tipSection[i + 2]; // Corrected: Added Z coordinate to the calculation
        }
        tipCentroid.divideScalar(pointsPerSection);
        rightWingtip.position.copy(tipCentroid);

        // Apply the cant angle (up/down rotation)
        rightWingtip.rotation.x = wingtipAngle;

        const leftWingtip = rightWingtip.clone();
        leftWingtip.rotation.x = wingtipAngle; // Corrected: Both should have the same angle

        rightWing.add(rightWingtip);
        leftWing.add(leftWingtip);

    }

    // Ailerons (Added after wingtips to ensure correct positioning relative to the final wing)
    if (hasAileronInput.checked) {
        const aileronLength = getValidNumber(aileronLengthInput) * conversionFactor;
        const aileronWidth = getValidNumber(aileronWidthInput) * conversionFactor;
        const aileronThickness = getValidNumber(aileronThicknessInput) * conversionFactor;
        const aileronPosition = getValidNumber(aileronPositionInput) * conversionFactor;

        // Aileron geometry is a simple box. We translate it so its origin (pivot point) is at the center of its leading edge.
        const aileronGeom = new THREE.BoxGeometry(aileronWidth, aileronThickness, aileronLength);
        aileronGeom.translate(-aileronWidth / 2, 0, 0); // Move the geometry so the hinge is at x=0 and it extends backwards

        // Create the aileron meshes
        const rightAileron = new THREE.Mesh(aileronGeom, aileronMaterial);
        rightAileron.name = 'rightAileron'; // Name for raycasting

        const leftAileron = new THREE.Mesh(aileronGeom, aileronMaterial);
        leftAileron.name = 'leftAileron';

        // Create pivot groups to handle positioning, sweep, and rotation
        const rightAileronPivot = new THREE.Group();
        rightAileronPivot.add(rightAileron);
        const leftAileronPivot = new THREE.Group();
        leftAileronPivot.add(leftAileron);

        // Calculate the position for the pivot (the hinge line)
        const aileronAvgZ = halfSpan - aileronPosition - (aileronLength / 2);
        const chordAtHinge = rootChord + (rootChord * taperRatio - rootChord) * (aileronAvgZ / halfSpan);
        const sweepAtHinge = (aileronAvgZ > 0 ? aileronAvgZ : 0) * Math.tan(sweepRad);
        // The wing's new trailing edge (the hinge line) is at the original trailing edge position, moved forward by the aileron width.
        const hingeX = sweepAtHinge - (chordAtHinge / 2) + aileronWidth;

        // Position and rotate the PIVOTS
        rightAileronPivot.position.set(hingeX, 0, aileronAvgZ);
        rightAileronPivot.rotation.y = sweepRad;

        leftAileronPivot.position.set(hingeX, 0, aileronAvgZ);
        leftAileronPivot.rotation.y = sweepRad;

        // Add pivots to the wings
        rightWing.add(rightAileronPivot);
        leftWing.add(leftAileronPivot);
    }




    // تحديث موضع الجناح (علوي/متوسط/سفلي)
    const fuselageHeight = fuselage.geometry.parameters.height;
    if (wingPosition === 'high') wingGroup.position.y = fuselageHeight / 2;
    else if (wingPosition === 'mid') wingGroup.position.y = 0;
    else if (wingPosition === 'low') wingGroup.position.y = -fuselageHeight / 2;

    // --- تحديث الأبعاد الأخرى ---
    // --- إعادة بناء الذيل بالكامل ---
    while (tailGroup.children.length > 0) tailGroup.remove(tailGroup.children[0]);
    while (tailControlsGroup.children.length > 0) tailControlsGroup.remove(tailControlsGroup.children[0]);

    const tailThickness = wingThickness * 0.75; // Tail is usually thinner
    const hasElevator = hasElevatorInput.checked;
    const elevatorWidth = getValidNumber(elevatorWidthInput) * conversionFactor;
    const hasRudder = hasRudderInput.checked;
    const rudderWidth = getValidNumber(rudderWidthInput) * conversionFactor;

    const createSurface = (span, rootChord, taperRatio, sweepAngle, thickness, airfoil, isVertical = false) => {
        const effectiveSpan = isVertical ? span : span / 2; // الأسطح العمودية تمتد بطولها الكامل من القاعدة
        const sweepRad = sweepAngle * Math.PI / 180;
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        const segments = 5; // Fewer segments for tail is fine
        const pointsPerSection = (15 * 2);

        for (let i = 0; i <= segments; i++) {
            const spanProgress = i / segments;
            const currentY = spanProgress * effectiveSpan;
            const currentChord = rootChord + (rootChord * taperRatio - rootChord) * spanProgress;
            const currentSweep = currentY * Math.tan(sweepRad);
            const airfoilPoints = generateAirfoil(currentChord, thickness, airfoil, 15);

            airfoilPoints.forEach(p => {
                if (isVertical) {
                    vertices.push(p.x + currentSweep, currentY, p.y); // Swap Y and Z for vertical stabilizer
                } else {
                    vertices.push(p.x + currentSweep, p.y, currentY);
                }
            });
        }

        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < pointsPerSection; j++) {
                const p1 = i * pointsPerSection + j;
                const p2 = i * pointsPerSection + ((j + 1) % pointsPerSection);
                const p3 = (i + 1) * pointsPerSection + j;
                const p4 = (i + 1) * pointsPerSection + ((j + 1) % pointsPerSection);
                indices.push(p1, p3, p4, p1, p4, p2);
            }
        }

        const tipStartIndex = segments * pointsPerSection;
        for (let j = 1; j < pointsPerSection - 1; j++) {
            indices.push(tipStartIndex, tipStartIndex + j + 1, tipStartIndex + j);
        }

        geometry.setIndex(indices);
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        return geometry;
    };

    // --- Tail Assembly ---
    if (tailType === 'conventional') {
        const hStabChordEffective = hasElevator ? tailChord - elevatorWidth : tailChord;
        const vStabChordEffective = hasRudder ? vStabChord - rudderWidth : vStabChord;

        // Create right half of the horizontal stabilizer
        const hStabGeom = createSurface(tailSpan, hStabChordEffective, tailTaperRatio, tailSweepAngle, tailThickness, tailAirfoilType, false);
        // إزاحة المثبت الأفقي ليبدأ من جانب جسم الطائرة
        hStabGeom.translate(0, 0, fuselage.geometry.parameters.depth / 2);
        const rightHStab = new THREE.Mesh(hStabGeom, tailMaterial);
        rightHStab.position.x = -fuselageLength / 2 - hStabChordEffective / 2;

        // Clone and mirror for the left half
        const leftHStab = rightHStab.clone();
        leftHStab.scale.z = -1;

        const vStabGeom = createSurface(vStabHeight, vStabChordEffective, tailTaperRatio, tailSweepAngle, tailThickness, tailAirfoilType, true);
        const vStab = new THREE.Mesh(vStabGeom, fuselageMaterial);
        vStab.position.x = -fuselageLength / 2 - vStabChordEffective / 2;
        // رفع المثبت العمودي ليجلس فوق جسم الطائرة
        vStab.position.y = fuselage.geometry.parameters.height / 2;

        tailGroup.add(rightHStab, leftHStab, vStab);
    } else if (tailType === 't-tail') {
        const hStabChordEffective = hasElevator ? tailChord - elevatorWidth : tailChord;
        const vStabChordEffective = hasRudder ? vStabChord - rudderWidth : vStabChord;

        // Create right half of the horizontal stabilizer
        const hStabGeom = createSurface(tailSpan, hStabChordEffective, tailTaperRatio, tailSweepAngle, tailThickness, tailAirfoilType, false);
        const rightHStab = new THREE.Mesh(hStabGeom, tailMaterial);
        // رفع المثبت الأفقي ليجلس فوق المثبت العمودي
        rightHStab.position.set(-fuselageLength / 2 - hStabChordEffective / 2, vStabHeight + fuselage.geometry.parameters.height / 2, 0);

        // Clone and mirror for the left half
        const leftHStab = rightHStab.clone();
        leftHStab.scale.z = -1;

        const vStabGeom = createSurface(vStabHeight, vStabChordEffective, tailTaperRatio, tailSweepAngle, tailThickness, tailAirfoilType, true);
        const vStab = new THREE.Mesh(vStabGeom, fuselageMaterial);
        vStab.position.x = -fuselageLength / 2 - vStabChordEffective / 2;
        // رفع المثبت العمودي ليجلس فوق جسم الطائرة
        vStab.position.y = fuselage.geometry.parameters.height / 2;

        tailGroup.add(rightHStab, leftHStab, vStab);
    } else if (tailType === 'v-tail') {
        const vStabChordEffective = hasRudder ? vStabChord - rudderWidth : vStabChord;
        const angleRad = vTailAngle * Math.PI / 180;
        const vTailPanelGeom = createSurface(vStabHeight, vStabChordEffective, tailTaperRatio, tailSweepAngle, tailThickness, tailAirfoilType, true);

        const rightVPanel = new THREE.Mesh(vTailPanelGeom, tailMaterial);
        // إزاحة اللوحة اليمنى إلى جانب جسم الطائرة
        rightVPanel.position.z = fuselage.geometry.parameters.depth / 2;
        rightVPanel.rotation.x = -angleRad; // تدوير حول المحور X للحصول على شكل V

        const leftVPanel = rightVPanel.clone();
        // إزاحة اللوحة اليسرى إلى الجانب الآخر
        leftVPanel.position.z = -fuselage.geometry.parameters.depth / 2;
        leftVPanel.rotation.x = angleRad; // تدوير معاكس للجهة الأخرى

        const vTailAssembly = new THREE.Group();
        vTailAssembly.add(rightVPanel, leftVPanel);
        vTailAssembly.position.x = -fuselageLength / 2 - vStabChordEffective / 2;
        // رفع مجموعة الذيل لتجلس فوق جسم الطائرة
        vTailAssembly.position.y = fuselage.geometry.parameters.height / 2;
        tailGroup.add(vTailAssembly);
    }

    // --- Tail Control Surfaces ---
    if (hasElevator && tailType !== 'v-tail') {
        // إنشاء سطح مائل ومستدق لنصف الرافع
        const elevatorLength = getValidNumber(elevatorLengthInput) * conversionFactor;
        const elevatorHalfGeom = createSurface(elevatorLength * 2, elevatorWidth, tailTaperRatio, tailSweepAngle, tailThickness, 'rectangular');
        // ننقل الشكل الهندسي بحيث تكون حافته الخلفية عند x=0، مما يجعل الحافة الأمامية (المفصل) عند x=-elevatorWidth
        elevatorHalfGeom.translate(elevatorWidth / 2, 0, 0);

        // الرافع الأيمن
        const rightElevator = new THREE.Mesh(elevatorHalfGeom, aileronMaterial);
        rightElevator.name = 'rightElevator';
        const rightElevatorPivot = new THREE.Group();
        rightElevatorPivot.add(rightElevator);

        // الرافع الأيسر (استنساخ وعكس)
        const leftElevatorPivot = rightElevatorPivot.clone();
        leftElevatorPivot.scale.z = -1;
        leftElevatorPivot.children[0].name = 'leftElevator';

        // نضع المحور عند الحافة الخلفية للذيل بأكمله، وسوف يتم رسم الرافع للأمام من هذه النقطة
        const pivotX = -fuselageLength / 2 - tailChord;
        const elevatorY = (tailType === 't-tail' ? vStabHeight + fuselage.geometry.parameters.height / 2 : 0);
        
        rightElevatorPivot.position.set(pivotX, elevatorY, 0);
        leftElevatorPivot.position.set(pivotX, elevatorY, 0);

        tailControlsGroup.add(rightElevatorPivot, leftElevatorPivot);
    }

    if (hasRudder && tailType !== 'v-tail') {
        // إنشاء سطح مائل ومستدق للدفة
        const rudderLength = getValidNumber(rudderLengthInput) * conversionFactor;
        const rudderGeom = createSurface(rudderLength, rudderWidth, tailTaperRatio, tailSweepAngle, tailThickness, 'rectangular', true);
        // ننقل الشكل الهندسي بحيث تكون حافته الخلفية عند x=0
        rudderGeom.translate(rudderWidth / 2, 0, 0);

        const rudder = new THREE.Mesh(rudderGeom, aileronMaterial);
        rudder.name = 'rudder';
        const rudderPivot = new THREE.Group();
        rudderPivot.add(rudder);
        // نضع المحور عند الحافة الخلفية للذيل العمودي بأكمله
        const pivotX = -fuselageLength / 2 - vStabChord;
        
        rudderPivot.position.set(pivotX, fuselage.geometry.parameters.height / 2, 0); // تبدأ الهندسة من y=0، لذا نرفعها

        tailControlsGroup.add(rudderPivot);
    } else if (hasRudderInput.checked && tailType === 'v-tail') {
        // This part is complex and can be added in a future step to ensure stability
    }


    fuselage.scale.x = fuselageLength;

    // تحديث المواقع
    propellerGroup.position.x = fuselageLength / 2 + 0.05;

    // تحديث المروحة
    while(propellerGroup.children.length) propellerGroup.remove(propellerGroup.children[0]);
    for (let i = 0; i < propBlades; i++) {
        const blade = new THREE.Mesh(propBladeGeom, propMaterial);
        blade.scale.y = propDiameter / 0.25;
        const angle = (i / propBlades) * Math.PI * 2;
        blade.rotation.x = angle;
        propellerGroup.add(blade);
    }
}

function calculateAerodynamics() {
    // قراءة القيم
    const conversionFactor = UNIT_CONVERSIONS[unitSelector.value];

    // قراءة القيم
    const wingSpan = getValidNumber(wingSpanInput) * conversionFactor;
    const wingChord = getValidNumber(wingChordInput) * conversionFactor;
    const wingThickness = getValidNumber(wingThicknessInput) * conversionFactor;
    const taperRatio = getValidNumber(taperRatioInput);
    const airfoilType = airfoilTypeInput.value;
    const angleOfAttack = getValidNumber(angleOfAttackInput);
    const airSpeed = getValidNumber(airSpeedInput);
    const airDensity = getValidNumber(airDensityInput);
    const propDiameter = getValidNumber(propDiameterInput) * 0.0254; // to meters
    const propPitch = getValidNumber(propPitchInput); // inches
    const propRpm = getValidNumber(propRpmInput);
    const planeComponentsWeightGrams = getValidNumber(planeWeightInput);
    const structureMaterial = structureMaterialInput.value;

    // --- حسابات محدثة ---
    const tipChord = wingChord * taperRatio;
    const wingArea = wingSpan * (wingChord + tipChord) / 2; // Area of a trapezoid
    const alphaRad = angleOfAttack * (Math.PI / 180);

    // نستخدم مساحة الجناح الكلية للحسابات. أسطح التحكم هي جزء من الجناح وتساهم في الرفع والوزن.
    const mainWingArea = wingArea;
    // --- Tail Area Calculation ---
    const tailSpan = getValidNumber(tailSpanInput) * conversionFactor;
    const tailChord = getValidNumber(tailChordInput) * conversionFactor;
    const vStabHeight = getValidNumber(vStabHeightInput) * conversionFactor;
    const vStabChord = getValidNumber(vStabChordInput) * conversionFactor;
    const tailType = tailTypeInput.value;
    let totalTailArea = 0;

    if (tailType === 'conventional' || tailType === 't-tail') {
        const hStabArea = tailSpan * tailChord;
        const vStabArea = vStabHeight * vStabChord;
        totalTailArea = hStabArea + vStabArea;
    } else if (tailType === 'v-tail') {
        totalTailArea = 2 * (vStabHeight * vStabChord);
    }

    // 1. قوة الرفع (Lift)
    // L = 0.5 * Cl * rho * V^2 * A
    // Cl (معامل الرفع) ≈ 2 * PI * alpha (تقريب لنظرية الجنيح الرقيق)
    let airfoilLiftFactor = 1.0;
    if (airfoilType === 'flat-bottom') { // عامل رفع أعلى قليلاً
        airfoilLiftFactor = 1.1; // عامل رفع أعلى قليلاً
    } else if (airfoilType === 'symmetrical') { // عامل رفع أقل قليلاً عند زوايا الهجوم الصغيرة
        airfoilLiftFactor = 0.95; // عامل رفع أقل قليلاً عند زوايا الهجوم الصغيرة
    } else if (airfoilType === 'rectangular') {
        airfoilLiftFactor = 0.85; // أقل كفاءة
    }
    const cl = airfoilLiftFactor * 2 * Math.PI * alphaRad;
    const lift = 0.5 * cl * airDensity * Math.pow(airSpeed, 2) * mainWingArea;

    // 2. قوة السحب (Drag)
    // D = 0.5 * Cd * rho * V^2 * A
    // Cd = Cdp + Cdi (سحب طفيلي + سحب مستحث)
    const aspectRatio = Math.pow(wingSpan, 2) / wingArea;
    const oswaldEfficiency = 0.8; // كفاءة أوزوالد (قيمة مفترضة)
    const cdi = Math.pow(cl, 2) / (Math.PI * aspectRatio * oswaldEfficiency);
    const cdp = 0.025; // معامل سحب طفيلي مفترض (لجسم الطائرة والذيل وغيرها)
    const cd = cdp + cdi;
    const drag = 0.5 * cd * airDensity * Math.pow(airSpeed, 2) * mainWingArea;

    // 3. قوة الدفع (Thrust)
    // صيغة تجريبية مبسطة جداً للدفع الساكن (Static Thrust)
    // لا تعكس الواقع بدقة ولكن تعطي فكرة عن علاقة المتغيرات
    const n_rps = propRpm / 60; // revolutions per second
    const thrust = 4.392399 * Math.pow(10, -8) * propRpm * Math.pow(propDiameter / 0.0254, 3.5) / Math.sqrt(propPitch) * (4.23333 * Math.pow(10, -4) * propRpm * propPitch - airSpeed * 0.5144);

    // 4. حساب الوزن (Weight Calculation)
    const wingVolume = mainWingArea * wingThickness; // Volume in m³
    const structureMaterialDensity = MATERIAL_DENSITIES[structureMaterial]; // Density in kg/m³
    const wingWeightKg = wingVolume * structureMaterialDensity; // Weight in kg

    const tailThickness = wingThickness * 0.75; // Tail is usually thinner
    const tailVolume = totalTailArea * tailThickness;
    const tailWeightKg = tailVolume * structureMaterialDensity;

    const planeComponentsWeightKg = planeComponentsWeightGrams / 1000;
    const totalWeightKg = wingWeightKg + tailWeightKg + planeComponentsWeightKg;

    // 5. نسبة الدفع إلى الوزن (Thrust-to-Weight Ratio)
    const weightInNewtons = totalWeightKg * 9.81;
    const twr = weightInNewtons > 0 ? (thrust / weightInNewtons) : 0;

    // عرض النتائج
    liftResultEl.textContent = lift > 0 ? lift.toFixed(2) : '0.00';
    dragResultEl.textContent = drag > 0 ? drag.toFixed(2) : '0.00';
    thrustResultEl.textContent = thrust > 0 ? thrust.toFixed(2) : '0.00';
    wingAreaResultEl.textContent = mainWingArea > 0 ? `${mainWingArea.toFixed(2)}` : '0.00';
    wingWeightResultEl.textContent = (wingWeightKg * 1000).toFixed(0);
    tailAreaResultEl.textContent = totalTailArea > 0 ? totalTailArea.toFixed(2) : '0.00';
    tailWeightResultEl.textContent = (tailWeightKg * 1000).toFixed(0);
    totalWeightResultEl.textContent = (totalWeightKg * 1000).toFixed(0);
    twrResultEl.textContent = twr > 0 ? twr.toFixed(2) : '0.00';
}

function initCharts() {
    const liftChartCanvas = document.getElementById('lift-chart');
    const dragChartCanvas = document.getElementById('drag-chart');

    const commonOptions = {

        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'سرعة الهواء (م/ث)'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'القوة (نيوتن)'
                },
                beginAtZero: true
            }
        },
        plugins: {
            legend: {
                display: false
            }
        }
    };

    liftChart = new Chart(liftChartCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'قوة الرفع',
                data: [],
                borderColor: 'rgba(0, 123, 255, 1)',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                fill: true,
                tension: 0.1
            }]
        },
        options: { ...commonOptions }
    });

    dragChart = new Chart(dragChartCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'قوة السحب',
                data: [],
                borderColor: 'rgba(220, 53, 69, 1)',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                fill: true,
                tension: 0.1
            }]
        },
        options: { ...commonOptions }
    });
}

function updateCharts() {
    const conversionFactor = UNIT_CONVERSIONS[unitSelector.value];
    const wingSpan = getValidNumber(wingSpanInput) * conversionFactor;
    const wingChord = getValidNumber(wingChordInput) * conversionFactor;
    const taperRatio = getValidNumber(taperRatioInput);
    const airfoilType = airfoilTypeInput.value;
    const angleOfAttack = getValidNumber(angleOfAttackInput);
    const airDensity = getValidNumber(airDensityInput);

    const tipChord = wingChord * taperRatio;
    const wingArea = wingSpan * (wingChord + tipChord) / 2;
    if (wingArea <= 0) return;

    const alphaRad = angleOfAttack * (Math.PI / 180);
    let airfoilLiftFactor = 1.0;
    if (airfoilType === 'flat-bottom') airfoilLiftFactor = 1.1;
    else if (airfoilType === 'symmetrical') airfoilLiftFactor = 0.95;
    const cl = airfoilLiftFactor * 2 * Math.PI * alphaRad;
    const aspectRatio = Math.pow(wingSpan, 2) / wingArea;
    const cdi = Math.pow(cl, 2) / (Math.PI * aspectRatio * 0.8);
    const cd = 0.025 + cdi;

    const speedPoints = [], liftPoints = [], dragPoints = [];
    for (let i = 0; i <= 25; i++) {
        const speed = i * 2; // from 0 to 50 m/s
        speedPoints.push(speed);
        const dynamicPressure = 0.5 * airDensity * Math.pow(speed, 2);
        liftPoints.push(dynamicPressure * wingArea * cl);
        dragPoints.push(dynamicPressure * wingArea * cd);
    }

    liftChart.data.labels = speedPoints;
    liftChart.data.datasets[0].data = liftPoints;
    liftChart.update();

    dragChart.data.labels = speedPoints;
    dragChart.data.datasets[0].data = dragPoints;
    dragChart.update();
}

function updateAll() {
    updatePlaneModel();
    calculateAerodynamics();
    if (liftChart && dragChart) {
        updateCharts();
    }
}

function updateUnitLabels() {
    const selectedUnitLabel = unitSelector.options[unitSelector.selectedIndex].dataset.label;
    unitLabels.forEach(label => {
        label.textContent = selectedUnitLabel;
    });
}

// --- ربط الأحداث ---
const debouncedUpdate = debounce(updateAll, 150); // تأخير 150ms لتحسين الأداء

allControls.forEach(control => {
    // استخدام دالة debounced للمدخلات التي تتغير بسرعة (مثل range و number)
    if (control.type === 'range' || control.type === 'number') {
        control.addEventListener('input', debouncedUpdate);
    } else { // للمدخلات الأخرى (مثل select و color)، التحديث فوري عند التغيير
        control.addEventListener('change', updateAll);
    }
});

hasAileronInput.addEventListener('change', updateAll);
hasWingtipInput.addEventListener('change', updateAll);
tailTypeInput.addEventListener('change', updateAll);
hasElevatorInput.addEventListener('change', updateAll);
hasRudderInput.addEventListener('change', updateAll);



// تحديث عرض قيم شريط التمرير
sweepAngleInput.addEventListener('input', () => sweepValueEl.textContent = sweepAngleInput.value);
taperRatioInput.addEventListener('input', () => taperValueEl.textContent = parseFloat(taperRatioInput.value).toFixed(2));
tailSweepAngleInput.addEventListener('input', () => tailSweepValueEl.textContent = tailSweepAngleInput.value);
tailTaperRatioInput.addEventListener('input', () => tailTaperValueEl.textContent = parseFloat(tailTaperRatioInput.value).toFixed(2));
unitSelector.addEventListener('change', updateUnitLabels);

// --- تفاعل الماوس مع الجنيحات ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseClick(event) {
    // حساب إحداثيات الماوس في الفضاء الطبيعي (-1 إلى +1)
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // البحث عن الجنيحات في المشهد
    const rightAileron = scene.getObjectByName('rightAileron');
    const leftAileron = scene.getObjectByName('leftAileron');
    const rightElevator = scene.getObjectByName('rightElevator');
    const leftElevator = scene.getObjectByName('leftElevator');
    const rudder = scene.getObjectByName('rudder');
    const rightRuddervator = scene.getObjectByName('rightRuddervator');
    const leftRuddervator = scene.getObjectByName('leftRuddervator');
    
    const objectsToIntersect = [];
    if (rightAileron) objectsToIntersect.push(rightAileron);
    if (leftAileron) objectsToIntersect.push(leftAileron);
    if (rightElevator) objectsToIntersect.push(rightElevator);
    if (leftElevator) objectsToIntersect.push(leftElevator);
    if (rudder) objectsToIntersect.push(rudder);
    if (rightRuddervator) objectsToIntersect.push(rightRuddervator);
    if (leftRuddervator) objectsToIntersect.push(leftRuddervator);

    if (objectsToIntersect.length === 0) return;

    const intersects = raycaster.intersectObjects(objectsToIntersect, true);

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        if (clickedObject.name === 'rightElevator' || clickedObject.name === 'leftElevator') {
            // يجب أن يتحرك نصفي الرافع معًا (للتحكم في الانحدار)
            if (rightElevator) rightElevator.parent.rotation.z += 0.2;
            if (leftElevator) leftElevator.parent.rotation.z += 0.2;
        }
        if (clickedObject.name === 'rudder') clickedObject.parent.rotation.y += 0.2; // الدفة تتحكم في الانعراج
        if (clickedObject.name === 'rightRuddervator' || clickedObject.name === 'leftRuddervator') clickedObject.parent.rotation.z += 0.2;

        // تحريك الجنيحات بشكل معاكس عند النقر
        if (rightAileron && leftAileron) {
            if (clickedObject.name === 'rightAileron' || clickedObject.name === 'leftAileron') {
                rightAileron.parent.rotation.z += 0.2; // Rotate the PIVOT, not the aileron itself
                leftAileron.parent.rotation.z -= 0.2;
            }
        }
    }
}
window.addEventListener('click', onMouseClick, false);

// --- حلقة العرض ---
function animate() {
    requestAnimationFrame(animate);

    controls.update(); // ضروري إذا تم تفعيل enableDamping

    renderer.render(scene, camera);
}

// --- التشغيل الأولي ---
initCharts();
updateUnitLabels();
updateAll();
animate();

// --- التعامل مع تغيير حجم النافذة ---
window.addEventListener('resize', () => {
    const viewerDiv = document.querySelector('.viewer');
    camera.aspect = viewerDiv.clientWidth / viewerDiv.clientHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(viewerDiv.clientWidth, viewerDiv.clientHeight);
});
