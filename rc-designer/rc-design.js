// --- إعداد المشهد ثلاثي الأبعاد ---
const canvas = document.getElementById('viewer-canvas');
const viewerDiv = document.querySelector('.viewer'); // الحصول على الحاوية الرئيسية للعرض
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);
const camera = new THREE.PerspectiveCamera(75, viewerDiv.clientWidth / viewerDiv.clientHeight, 0.1, 1000);
const clock = new THREE.Clock(); // لتتبع الوقت بين الإطارات
camera.position.set(1.5, 1, 2);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
// استخدام أبعاد الحاوية لضمان حجم صحيح عند التحميل
renderer.setSize(viewerDiv.clientWidth, viewerDiv.clientHeight);

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
const axesHelper = new THREE.AxesHelper(2); // الرقم 2 يحدد حجم المحاور
scene.add(axesHelper);

// --- إنشاء أجزاء الطائرة ---
const planeGroup = new THREE.Group();
const fuselageMaterial = new THREE.MeshStandardMaterial({
    color: 0x0056b3,
    side: THREE.DoubleSide,
    transparent: true // تفعيل الشفافية
});
const wingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide });
const aileronMaterial = new THREE.MeshStandardMaterial({ color: 0xffc107, side: THREE.DoubleSide });
const cockpitMaterial = new THREE.MeshStandardMaterial({
    color: 0x6ab0de,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
});

// مجموعة المحرك
const engineGroup = new THREE.Group();
planeGroup.add(engineGroup);
const engineMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 }); // A metallic grey

// مجموعة عجلات الهبوط
const landingGearGroup = new THREE.Group();
planeGroup.add(landingGearGroup);
const strutMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide });
const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide });

// New: مجموعة الملحقات
const accessoriesGroup = new THREE.Group();
planeGroup.add(accessoriesGroup);

// جسم الطائرة
// تم تغيير fuselage إلى Group لاستيعاب الأجزاء المتعددة (الجسم، المقدمة، المؤخرة)
const fuselageGroup = new THREE.Group();
planeGroup.add(fuselageGroup);

// علامة مركز الثقل على جسم الطائرة - سيتم إنشاؤها ديناميكيًا
const cgFuselageMarkerGroup = new THREE.Group();
cgFuselageMarkerGroup.name = 'cgFuselageMarker';
// مجموعة الجناح (سيتم إنشاؤها ديناميكيًا)
const wingGroup = new THREE.Group();
planeGroup.add(wingGroup);

// مجموعة محركات الجناح
const wingEnginesGroup = new THREE.Group();
wingGroup.add(wingEnginesGroup); // تم نقلها إلى هنا لضمان تعريف wingGroup أولاً

// مجموعة تجميع الذيل (للسماح بدوران الميلان)
const tailAssembly = new THREE.Group();
planeGroup.add(tailAssembly);

// مجموعة قمرة القيادة
const cockpitGroup = new THREE.Group();
planeGroup.add(cockpitGroup);

// مجموعة مصدر الطاقة (بطارية/خزان)
const energySourceGroup = new THREE.Group();
planeGroup.add(energySourceGroup);
const energySourceMaterial = new THREE.MeshStandardMaterial({ color: 0xf39c12, side: THREE.DoubleSide });
const energySourceGeom = new THREE.BoxGeometry(1, 1, 1); // صندوق بوحدة قياس 1x1x1 سيتم تغيير حجمه
const energySourceMesh = new THREE.Mesh(energySourceGeom, energySourceMaterial);
energySourceGroup.add(energySourceMesh);

// المروحة
const propellerGroup = new THREE.Group();
const propBladeGeom = new THREE.BoxGeometry(0.02, 0.25, 0.01);
const propMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

propellerGroup.position.x = 0.55;
planeGroup.add(propellerGroup);

scene.add(planeGroup);

// --- كائنات مركز الجاذبية والمركز الهوائي ---
const cgAcGroup = new THREE.Group();
const cgGeom = new THREE.SphereGeometry(0.02, 16, 16);
const cgMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // أحمر
const cgSphere = new THREE.Mesh(cgGeom, cgMaterial);
cgAcGroup.add(cgSphere);
planeGroup.add(cgAcGroup);

// متغير لتخزين اهتزاز الدوران من الإطار السابق لإزالته في الإطار التالي
let lastVibrationRotation = new THREE.Euler();
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

/**
 * Calculates and updates the air density input field based on temperature and pressure
 * using the Ideal Gas Law (ρ = P / (R * T)).
 */
function updateAirDensity() {
    const temperatureC = getValidNumber(temperatureInput);
    const pressurePa = getValidNumber(pressureInput);

    // Convert temperature to Kelvin
    const temperatureK = temperatureC + 273.15;

    // Specific gas constant for dry air in J/(kg·K)
    const R_specific = 287.058;

    if (temperatureK > 0) {
        const calculatedDensity = pressurePa / (R_specific * temperatureK);
        // Update the input field, which will be read by calculateAerodynamics
        airDensityInput.value = calculatedDensity.toFixed(4);
    }
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
    'plastic': 1150, // بلاستيك Nylon/ABS
    'carbon_fiber': 1600,
    'wood': 700,
    'polycarbonate': 1200, // كثافة البولي كربونات
    'aluminum': 2700
};

const FUEL_DENSITIES = {
    'methanol_nitro': 850, // kg/m³ for typical glow fuel
    'gasoline': 750 // kg/m³ for gasoline
};

const ENGINE_SPECS = {
    electric: {
        'dc_180': {
            weight: 50, torque: 0.02, kv: 2000, voltage: 6,
            length: 3.2, diameter: 2.8,
            modelSize: { type: 'box', x: 0.03, y: 0.02, z: 0.015 }
        },
        'brushless_1000kv': {
            weight: 70, torque: 0.08, kv: 1000, voltage: 11.1,
            length: 3.5, diameter: 2.8,
            modelSize: { type: 'cylinder', length: 0.026, diameter: 0.028 }
        }
    },
    ic: {
        'glow_15': {
            weight: 200, displacement: 2.5, torque: 0.3, rpm: 15000,
            length: 6, diameter: 5,
            modelSize: { type: 'cylinder', length: 0.06, diameter: 0.05 }
        },
        'glow_46': {
            weight: 450, displacement: 7.5, torque: 1.2, rpm: 11000,
            length: 8, diameter: 7,
            modelSize: { type: 'cylinder', length: 0.08, diameter: 0.07 }
        }
    }
};
// تخزين عناصر الإدخال والنتائج لتحسين الأداء
const unitSelector = document.getElementById('unit-selector');
const showAxesCheckbox = document.getElementById('show-axes-checkbox');
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
const elevatorAirfoilTypeInput = document.getElementById('elevator-airfoil-type');
const elevatorWidthInput = document.getElementById('elevator-width');
const hasRudderInput = document.getElementById('has-rudder');
const rudderControls = document.getElementById('rudder-controls');
const rudderWidthInput = document.getElementById('rudder-width');
const tailSweepAngleInput = document.getElementById('tail-sweep-angle');
const vStabSweepAngleInput = document.getElementById('vstab-sweep-angle');
const tailTaperRatioInput = document.getElementById('tail-taper-ratio');
const rudderAirfoilTypeInput = document.getElementById('rudder-airfoil-type');
const tailAirfoilTypeInput = document.getElementById('tail-airfoil-type');
const tailThicknessInput = document.getElementById('tail-thickness');
const controlSurfaceThicknessInput = document.getElementById('control-surface-thickness');
const tailIncidenceAngleInput = document.getElementById('tail-incidence-angle');
const tailDihedralAngleInput = document.getElementById('tail-dihedral-angle');

const hStabSpanGroup = document.getElementById('h-stab-span-group');
const hStabChordGroup = document.getElementById('h-stab-chord-group');
const vStabGroup = document.getElementById('v-stab-group');
const vStabChordGroup = document.getElementById('v-stab-chord-group');
const vTailAngleGroup = document.getElementById('v-tail-angle-group');
const vStabHeightLabel = vStabGroup.querySelector('label');
const vStabChordLabel = vStabChordGroup.querySelector('label');
const wingThicknessInput = document.getElementById('wing-thickness');
const wingPositionInput = document.getElementById('wing-position');
const airfoilTypeInput = document.getElementById('airfoil-type');
const sweepAngleInput = document.getElementById('sweep-angle');
const taperRatioInput = document.getElementById('taper-ratio');
const dihedralAngleInput = document.getElementById('dihedral-angle');

const wingIncidenceAngleInput = document.getElementById('wing-incidence-angle');

const hasWingtipInput = document.getElementById('has-wingtip');
const wingtipAirfoilTypeInput = document.getElementById('wingtip-airfoil-type');
const wingtipShapeInput = document.getElementById('wingtip-shape');
const wingtipLengthInput = document.getElementById('wingtip-length');
const wingtipWidthInput = document.getElementById('wingtip-width');
const wingtipThicknessInput = document.getElementById('wingtip-thickness');
const wingtipPositionInput = document.getElementById('wingtip-position');
const wingtipAngleInput = document.getElementById('wingtip-angle');
const wingtipTwistAngleInput = document.getElementById('wingtip-twist-angle');
const wingtipTaperRatioInput = document.getElementById('wingtip-taper-ratio');
const wingtipSweepAngleInput = document.getElementById('wingtip-sweep-angle');
const wingtipControls = document.getElementById('wingtip-controls');
const wingtipResultsContainer = document.getElementById('wingtip-results-container');

const hasAileronInput = document.getElementById('has-aileron');
const aileronLengthInput = document.getElementById('aileron-length');
const aileronWidthInput = document.getElementById('aileron-width');
const aileronThicknessInput = document.getElementById('aileron-thickness');
const aileronPositionInput = document.getElementById('aileron-position');
const aileronAirfoilTypeInput = document.getElementById('aileron-airfoil-type');
const elevatorLengthInput = document.getElementById('elevator-length');
const rudderLengthInput = document.getElementById('rudder-length');
const aileronControls = document.getElementById('aileron-controls');


const fuselageLengthInput = document.getElementById('fuselage-length');
const fuselageShapeInput = document.getElementById('fuselage-shape');
const fuselageWidthInput = document.getElementById('fuselage-width');
const fuselageHeightInput = document.getElementById('fuselage-height');
const fuselageDiameterInput = document.getElementById('fuselage-diameter');
const fuselageFrontDiameterInput = document.getElementById('fuselage-front-diameter');
const fuselageRearDiameterInput = document.getElementById('fuselage-rear-diameter');
const fuselageRectWidthGroup = document.getElementById('fuselage-rectangular-width-group');
const fuselageRectHeightGroup = document.getElementById('fuselage-rectangular-height-group');
const fuselageCylDiameterGroup = document.getElementById('fuselage-cylindrical-diameter-group');
const fuselageTearFrontDiaGroup = document.getElementById('fuselage-teardrop-front-diameter-group');
const fuselageTaperRatioInput = document.getElementById('fuselage-taper-ratio');
const fuselageTaperValueEl = document.getElementById('fuselage-taper-value');
const fuselageTaperGroup = document.getElementById('fuselage-taper-group');
const fuselageOpacityInput = document.getElementById('fuselage-opacity');
const fuselageOpacityValueEl = document.getElementById('fuselage-opacity-value');
const fuselageEndsControls = document.getElementById('fuselage-ends-controls');
const fuselageNoseShapeInput = document.getElementById('fuselage-nose-shape');
const fuselageTailShapeInput = document.getElementById('fuselage-tail-shape');
const fuselageTearRearDiaGroup = document.getElementById('fuselage-teardrop-rear-diameter-group');
const wingPropDistanceInput = document.getElementById('wing-prop-distance');
const wingTailDistanceInput = document.getElementById('wing-tail-distance');
const fuselageMaterialInput = document.getElementById('fuselage-material');

const structureMaterialInput = document.getElementById('structure-material');
const controlSurfaceMaterialInput = document.getElementById('control-surface-material');

// Cockpit Inputs
const hasCockpitInput = document.getElementById('has-cockpit');
const cockpitControls = document.getElementById('cockpit-controls');
const cockpitShapeInput = document.getElementById('cockpit-shape');
const cockpitLengthInput = document.getElementById('cockpit-length');
const cockpitWidthInput = document.getElementById('cockpit-width');
const cockpitHeightInput = document.getElementById('cockpit-height');
const cockpitPositionInput = document.getElementById('cockpit-position');
const cockpitOpacityInput = document.getElementById('cockpit-opacity');
const fuelTankMaterialInput = document.getElementById('fuel-tank-material');
const cockpitMaterialInput = document.getElementById('cockpit-material');
const propDiameterInput = document.getElementById('prop-diameter');
const propBladesInput = document.getElementById('prop-blades');
const propPitchInput = document.getElementById('prop-pitch');
const propChordInput = document.getElementById('prop-chord');
const propThicknessInput = document.getElementById('prop-thickness');
const propMaterialInput = document.getElementById('prop-material');
const spinnerDiameterInput = document.getElementById('spinner-diameter');
const propRpmInput = document.getElementById('prop-rpm');
const vibrationIntensityInput = document.getElementById('vibration-intensity');
const togglePropSpinBtn = document.getElementById('toggle-prop-spin');
const angleOfAttackInput = document.getElementById('angle-of-attack');
const airSpeedInput = document.getElementById('air-speed');
const airDensityInput = document.getElementById('air-density');
const temperatureInput = document.getElementById('temperature');
const pressureInput = document.getElementById('pressure');
const particleDensityInput = document.getElementById('particle-density');
const particleSizeInput = document.getElementById('particle-size');
const showAmbientWindInput = document.getElementById('show-ambient-wind');
const showVorticesInput = document.getElementById('show-vortices');
const airflowTransparencyInput = document.getElementById('airflow-transparency');
const toggleChartsBtn = document.getElementById('toggle-charts-btn');
const chartsContainer = document.getElementById('charts-container');
const showHeatHazeInput = document.getElementById('show-heat-haze');
const showSmokeInput = document.getElementById('show-smoke');
const airflowTransparencyValueEl = document.getElementById('airflow-transparency-value');
const fuselageColorInput = document.getElementById('fuselage-color');
const wingColorInput = document.getElementById('wing-color');
const tailColorInput = document.getElementById('tail-color');
const aileronColorInput = document.getElementById('aileron-color');
const rollStabilityResultEl = document.getElementById('roll-stability-result');
const propColorInput = document.getElementById('prop-color');
const cockpitColorInput = document.getElementById('cockpit-color');
const engineColorInput = document.getElementById('engine-color');
const pylonColorInput = document.getElementById('pylon-color');
const accessoryColorInput = document.getElementById('accessory-color');
const airflowColorInput = document.getElementById('airflow-color');
const vortexColorInput = document.getElementById('vortex-color');
const smokeColorInput = document.getElementById('smoke-color');
const wheelColorInput = document.getElementById('wheel-color');
const backgroundColorInput = document.getElementById('background-color');

// عناصر عرض قيم شريط التمرير
const sweepValueEl = document.getElementById('sweep-value');
const taperValueEl = document.getElementById('taper-value');
const dihedralValueEl = document.getElementById('dihedral-value');
const wingIncidenceValueEl = document.getElementById('wing-incidence-value');
const fuelLevelValueEl = document.getElementById('fuel-level-value');
const tailSweepValueEl = document.getElementById('tail-sweep-value');
const vStabSweepValueEl = document.getElementById('vstab-sweep-value');
const tailIncidenceValueEl = document.getElementById('tail-incidence-value');
const tailDihedralValueEl = document.getElementById('tail-dihedral-value');
const tailTaperValueEl = document.getElementById('tail-taper-value');
const wingtipTaperValueEl = document.getElementById('wingtip-taper-value');
const wingtipSweepValueEl = document.getElementById('wingtip-sweep-value');
const particleDensityValueEl = document.getElementById('particle-density-value');
const particleSizeValueEl = document.getElementById('particle-size-value');
const vibrationValueEl = document.getElementById('vibration-value');
const cockpitOpacityValueEl = document.getElementById('cockpit-opacity-value');
const unitLabels = document.querySelectorAll('.unit-label');

// Landing Gear Inputs
const hasLandingGearInput = document.getElementById('has-landing-gear');
const landingGearControls = document.getElementById('landing-gear-controls');
const gearTypeInput = document.getElementById('gear-type');
const wheelDiameterInput = document.getElementById('wheel-diameter');
const wheelThicknessInput = document.getElementById('wheel-thickness');
const strutLengthInput = document.getElementById('strut-length');
const strutThicknessInput = document.getElementById('strut-thickness');
const mainGearPositionInput = document.getElementById('main-gear-position');
const hasRetractableGearInput = document.getElementById('has-retractable-gear');
const mainGearWidthInput = document.getElementById('main-gear-width');

// Engine Inputs
const engineVerticalPositionInput = document.getElementById('engine-vertical-position');
const engineThrustAngleInput = document.getElementById('engine-thrust-angle');
const engineSideThrustAngleInput = document.getElementById('engine-side-thrust-angle');
const engineTypeInput = document.getElementById('engine-type');
const electricEngineOptions = document.getElementById('electric-engine-options');
const icEngineOptions = document.getElementById('ic-engine-options');
const electricMotorTypeInput = document.getElementById('electric-motor-type');
const icEngineTypeInput = document.getElementById('ic-engine-type');

// Electric Engine Inputs
const enginePlacementInput = document.getElementById('engine-placement');
const wingEnginePlacementOptions = document.getElementById('wing-engine-placement-options');
const engineWingDistanceInput = document.getElementById('engine-wing-distance');
const engineWingVerticalPosInput = document.getElementById('engine-wing-vertical-pos');
const engineWingForeAftInput = document.getElementById('engine-wing-fore-aft');
const enginePylonLengthInput = document.getElementById('engine-pylon-length');
const pylonMaterialInput = document.getElementById('pylon-material');
const wingPropRotationInput = document.getElementById('wing-prop-rotation');

const electricMotorWeightInput = document.getElementById('electric-motor-weight-input');
const electricMotorTorqueInput = document.getElementById('electric-motor-torque-input');
const electricMotorKvInput = document.getElementById('electric-motor-kv-input');
const electricMotorVoltageInput = document.getElementById('electric-motor-voltage-input');
const electricMotorLengthInput = document.getElementById('electric-motor-length-input');
const electricMotorDiameterInput = document.getElementById('electric-motor-diameter-input');

// IC Engine Inputs
const icEngineDisplacementInput = document.getElementById('ic-engine-displacement-input');
const icEngineWeightInput = document.getElementById('ic-engine-weight-input');
const icEngineTorqueInput = document.getElementById('ic-engine-torque-input');
const icEngineLengthInput = document.getElementById('ic-engine-length-input');
const icEngineDiameterInput = document.getElementById('ic-engine-diameter-input');

// Energy Source Inputs
const energySourceColorInput = document.getElementById('energy-source-color');
const batteryOptions = document.getElementById('battery-options');
const fuelTankOptions = document.getElementById('fuel-tank-options');
const batteryTypeInput = document.getElementById('battery-type');
const batteryCapacityInput = document.getElementById('battery-capacity');
const batteryVoltageInput = document.getElementById('battery-voltage');
const batteryCRatingInput = document.getElementById('battery-c-rating');
const batteryWeightInput = document.getElementById('battery-weight');
const batteryPositionInput = document.getElementById('battery-position');
const fuelTankCapacityInput = document.getElementById('fuel-tank-capacity');
const fuelTankLengthInput = document.getElementById('fuel-tank-length');
const fuelTankWidthInput = document.getElementById('fuel-tank-width');
const fuelTankHeightInput = document.getElementById('fuel-tank-height');
const fuelTankPositionInput = document.getElementById('fuel-tank-position');

// Accessories Inputs
const receiverWeightInput = document.getElementById('receiver-weight');
const cameraWeightInput = document.getElementById('camera-weight');
const otherAccessoriesWeightInput = document.getElementById('other-accessories-weight');
const receiverPositionInput = document.getElementById('receiver-position');
const cameraPositionInput = document.getElementById('camera-position');
const receiverPositionYInput = document.getElementById('receiver-position-y');
const receiverPositionZInput = document.getElementById('receiver-position-z');
const cameraPositionYInput = document.getElementById('camera-position-y');
const cameraPositionZInput = document.getElementById('camera-position-z');

// Servo Group 1 Inputs
const servoG1WeightInput = document.getElementById('servo-g1-weight');
const servoG1CountInput = document.getElementById('servo-g1-count');
const servoG1PositionXInput = document.getElementById('servo-g1-position-x');
const servoG1PositionYInput = document.getElementById('servo-g1-position-y');
const servoG1PositionZInput = document.getElementById('servo-g1-position-z');

// Servo Group 2 Inputs
const servoG2WeightInput = document.getElementById('servo-g2-weight');
const servoG2CountInput = document.getElementById('servo-g2-count');
const servoG2PositionXInput = document.getElementById('servo-g2-position-x');
const servoG2PositionYInput = document.getElementById('servo-g2-position-y');
const servoG2PositionZInput = document.getElementById('servo-g2-position-z');

// CG/AC Inputs
const showCgCheckbox = document.getElementById('show-cg');

// عناصر التحكم الجديدة
const aileronControlSlider = document.getElementById('aileron-control');
const elevatorControlSlider = document.getElementById('elevator-control');
const rudderControlSlider = document.getElementById('rudder-control');
const engineSound = document.getElementById('engine-sound');
const toggleSoundBtn = document.getElementById('toggle-sound-btn');
const resetControlsBtn = document.getElementById('reset-controls-btn');
const liftResultEl = document.getElementById('lift-result');
const dragResultEl = document.getElementById('drag-result');
const thrustResultEl = document.getElementById('thrust-result');
const twrResultEl = document.getElementById('twr-result');
const stallSpeedResultEl = document.getElementById('stall-speed-result');
const wingAreaResultEl = document.getElementById('wing-area-result');
const wingWeightResultEl = document.getElementById('wing-weight-result');
const tailAreaResultEl = document.getElementById('tail-area-result');
const tailWeightResultEl = document.getElementById('tail-weight-result');
const fuselageWeightResultEl = document.getElementById('fuselage-weight-result'); // This ID is correct
const fuselageAreaResultEl = document.getElementById('fuselage-area-result');
const cockpitWeightResultEl = document.getElementById('cockpit-weight-result');
const energySourceWeightResultEl = document.getElementById('energy-source-weight-result');
const fuelLevelInput = document.getElementById('fuel-level');
const fuelTypeInput = document.getElementById('fuel-type');
const accessoriesWeightResultEl = document.getElementById('accessories-weight-result');
const wheelWeightResultEl = document.getElementById('wheel-weight-result');
const strutWeightResultEl = document.getElementById('strut-weight-result');
const engineWeightResultEl = document.getElementById('engine-weight-result');
const pylonWeightResultEl = document.getElementById('pylon-weight-result');
const landingGearWeightResultEl = document.getElementById('landing-gear-weight-result');
const totalWeightResultEl = document.getElementById('total-weight-result');
const propWeightResultEl = document.getElementById('prop-weight-result');
const propPowerResultEl = document.getElementById('prop-power-result');
const propTorqueResultEl = document.getElementById('prop-torque-result');
const cgPositionResultEl = document.getElementById('cg-position-result');

const planeParams = {}; // Object to hold cached plane parameters for the animation loop

let liftChart, dragChart, thrustChart;
let isPropSpinning = false; // متغير لتتبع حالة دوران المروحة
let propParticleSystem, propParticleCount = 400; // لتدفق هواء المروحة (تم تقليل العدد)
let wingAirflowParticleSystem, wingAirflowParticleCount = 2500; // لتدفق الهواء العام
let vortexParticleSystem, vortexParticleCount = 1000; // لدوامات أطراف الجناح
let smokeParticleSystem, smokeParticleCount = 500; // لدخان محرك IC
let heatHazeParticleSystem, heatHazeParticleCount = 300; // لتأثير الحرارة

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
    }
    // Add simpler shapes for control surfaces
    else if (airfoilType === 'wedge') {
        // A wedge is a triangle. The points must be in order to form a loop.
        points.push(new THREE.Vector2(chord / 2, thickness / 2));   // Top-front
        points.push(new THREE.Vector2(-chord / 2, 0));              // Trailing edge point
        points.push(new THREE.Vector2(chord / 2, -thickness / 2));  // Bottom-front
    }
    else if (airfoilType === 'flat_plate') {
        points.push(new THREE.Vector2(chord / 2, thickness / 2));
        points.push(new THREE.Vector2(chord / 2, -thickness / 2));
        points.push(new THREE.Vector2(-chord / 2, -thickness / 2));
        points.push(new THREE.Vector2(-chord / 2, thickness / 2));
    } else { // Default to Symmetrical and Semi-symmetrical
        const bottomFactor = (airfoilType === 'semi-symmetrical') ? 0.6 : 1.0;
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

const createSurface = (span, rootChord, taperRatio, sweepAngle, thickness, airfoil, isVertical = false, createRootCap = false) => {
    const effectiveSpan = isVertical ? span : span / 2; // الأسطح العمودية تمتد بطولها الكامل من القاعدة
    const sweepRad = sweepAngle * Math.PI / 180;
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const segments = (airfoil === 'flat_plate' || airfoil === 'wedge' || airfoil === 'rectangular') ? 1 : 5; // Use fewer segments for simple shapes
    let pointsPerSection = 0; // سيتم تحديده ديناميكيًا

    for (let i = 0; i <= segments; i++) {
        const spanProgress = i / segments;
        const currentY = spanProgress * effectiveSpan;
        const currentChord = rootChord + (rootChord * taperRatio - rootChord) * spanProgress;
        const currentSweep = currentY * Math.tan(sweepRad);
        // The number of points depends on the airfoil type
        const airfoilPoints = generateAirfoil(currentChord, thickness, airfoil, 15);
        if (i === 0) pointsPerSection = airfoilPoints.length; // Set the number of points from the first section

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

    // Add root cap if requested
    if (createRootCap) {
        const rootStartIndex = 0;
        for (let j = 1; j < pointsPerSection - 1; j++) {
            // Wind in the opposite direction for the root cap
            indices.push(rootStartIndex, rootStartIndex + j, rootStartIndex + j + 1);
        }
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
};

/**
 * Creates an Ogive (bullet) shape geometry for the nose cone.
 * @param {number} radius The base radius of the ogive.
 * @param {number} length The length of the ogive.
 * @param {number} segments The number of radial segments.
 * @returns {THREE.BufferGeometry} The generated ogive geometry.
 */
function createOgiveGeometry(radius, length, segments) {
    const points = [];
    const numPoints = 32; // Increased for a smoother curve
    // Equation for a tangent ogive
    const rho = (radius * radius + length * length) / (2 * radius);
    for (let i = 0; i <= numPoints; i++) {
        // We build the profile from tip (y=length) to base (y=0)
        const y = (i / numPoints) * length;
        const x = Math.sqrt(rho * rho - Math.pow(length - y, 2)) + radius - rho;
        points.push(new THREE.Vector2(x, y));
    }

    const geometry = new THREE.LatheGeometry(points, segments);
    // تم التعديل: تحريك الهندسة بحيث يكون أصلها عند القاعدة (y=0) بدلاً من الرأس
    // هذا يجعلها متوافقة مع هندسة نصف الكرة (hemisphere)
    geometry.translate(0, -length, 0);
    return geometry;
}

/**
 * Creates a realistic propeller blade geometry with airfoil shape and twist.
 * @param {number} radius The length of the blade from the spinner edge to the tip.
 * @param {number} rootChord The chord width at the base of the blade.
 * @param {number} tipChord The chord width at the tip of the blade.
 * @param {number} thickness The thickness of the airfoil.
 * @param {number} pitch The propeller pitch in meters.
 * @param {number} spinnerRadius The radius of the central spinner.
 * @param {string} airfoilType The type of airfoil to use for the blade cross-section.
 * @returns {THREE.BufferGeometry} The generated blade geometry.
 */
const createPropellerBladeGeom = (radius, rootChord, tipChord, thickness, pitch, spinnerRadius, airfoilType) => {
    const geom = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const segments = 8; // Fewer segments for performance
    const pointsPerSection = (15 * 2); // From generateAirfoil

    for (let i = 0; i <= segments; i++) {
        const progress = i / segments;
        const currentY = spinnerRadius + progress * radius; // Distance from center
        const currentChord = rootChord + (tipChord - rootChord) * progress;
        const twistAngle = (currentY > 0.001) ? Math.atan(pitch / (2 * Math.PI * currentY)) : 0;

        // Generate airfoil points in the XZ plane
        const airfoilPoints = generateAirfoil(currentChord, thickness, airfoilType, 15);

        airfoilPoints.forEach(p => {
            const vec = new THREE.Vector3(p.y, 0, p.x); // Airfoil is X,Y -> map to X,Z plane for the blade
            // Apply twist around Y axis (span-wise axis)
            vec.applyAxisAngle(new THREE.Vector3(0, 1, 0), twistAngle);
            // Position along blade span
            vec.y += currentY;
            vertices.push(vec.x, vec.y, vec.z);
        });
    }

    // Create faces (same logic as wing)
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < pointsPerSection; j++) {
            const p1 = i * pointsPerSection + j;
            const p2 = i * pointsPerSection + ((j + 1) % pointsPerSection);
            const p3 = (i + 1) * pointsPerSection + j;
            const p4 = (i + 1) * pointsPerSection + ((j + 1) % pointsPerSection);
            indices.push(p1, p3, p4, p1, p4, p2);
        }
    }
    geom.setIndex(indices);
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.computeVertexNormals();
    return geom;
};

/**
 * Reads all DOM input values, calculates derived properties, 
 * and caches them in the global `planeParams` object for use in the animation loop.
 * This prevents slow DOM access during the render cycle.
 */
function updatePlaneParameters() {
    const conversionFactor = UNIT_CONVERSIONS[unitSelector.value];

    // Cache all necessary values
    planeParams.conversionFactor = conversionFactor;
    planeParams.wingSpan = getValidNumber(wingSpanInput) * conversionFactor;
    planeParams.wingChord = getValidNumber(wingChordInput) * conversionFactor;
    planeParams.taperRatio = getValidNumber(taperRatioInput);
    planeParams.angleOfAttack = getValidNumber(angleOfAttackInput);
    planeParams.propRpm = getValidNumber(propRpmInput);
    planeParams.propPitch = getValidNumber(propPitchInput) * 0.0254; // to meters
    planeParams.propDiameter = getValidNumber(propDiameterInput) * 0.0254; // to meters
    planeParams.fuselageLength = getValidNumber(fuselageLengthInput) * conversionFactor;
    planeParams.aileronLength = getValidNumber(aileronLengthInput) * conversionFactor;
    planeParams.aileronPosition = getValidNumber(aileronPositionInput) * conversionFactor;
    planeParams.elevatorLength = getValidNumber(elevatorLengthInput) * conversionFactor;
    planeParams.rudderLength = getValidNumber(rudderLengthInput) * conversionFactor;
    planeParams.vStabHeight = getValidNumber(vStabHeightInput) * conversionFactor;

    // Cache fuselage dimensions
    const fuselageShape = fuselageShapeInput.value;
    if (fuselageShape === 'rectangular') {
        planeParams.fuselageWidth = getValidNumber(fuselageWidthInput) * conversionFactor;
        planeParams.fuselageHeight = getValidNumber(fuselageHeightInput) * conversionFactor;
    } else if (fuselageShape === 'cylindrical') {
        const fuselageDiameter = getValidNumber(fuselageDiameterInput) * conversionFactor;
        planeParams.fuselageWidth = fuselageDiameter;
        planeParams.fuselageHeight = fuselageDiameter;
    } else if (fuselageShape === 'teardrop') {
        const frontDiameter = getValidNumber(fuselageFrontDiameterInput) * conversionFactor;
        const rearDiameter = getValidNumber(fuselageRearDiameterInput) * conversionFactor;
        planeParams.fuselageWidth = Math.max(frontDiameter, rearDiameter);
        planeParams.fuselageHeight = Math.max(frontDiameter, rearDiameter);
    }

    // Calculate and cache aerodynamic coefficients
    const tipChord = planeParams.wingChord * planeParams.taperRatio;
    const wingArea = planeParams.wingSpan * (planeParams.wingChord + tipChord) / 2;
    const alphaRad = planeParams.angleOfAttack * (Math.PI / 180);
    const cl = 1.0 * 2 * Math.PI * alphaRad; // Simplified Cl
    planeParams.cl = cl;
}

function updateEngineInputs(spec, type) {
    if (type === 'electric') {
        electricMotorWeightInput.value = spec.weight || 0;
        electricMotorTorqueInput.value = spec.torque || 0;
        electricMotorKvInput.value = spec.kv || 0;
        electricMotorVoltageInput.value = spec.voltage || 0;
        electricMotorLengthInput.value = spec.length || 0;
        electricMotorDiameterInput.value = spec.diameter || 0;
    } else { // ic
        icEngineWeightInput.value = spec.weight || 0;
        icEngineDisplacementInput.value = spec.displacement || 0;
        icEngineTorqueInput.value = spec.torque || 0;
        icEngineLengthInput.value = spec.length || 0;
        icEngineDiameterInput.value = spec.diameter || 0;
    }
}
function updateEngineUI() {
    const engineType = engineTypeInput.value;

    // Show/hide option blocks
    electricEngineOptions.style.display = engineType === 'electric' ? 'block' : 'none';
    icEngineOptions.style.display = engineType === 'ic' ? 'block' : 'none';
    batteryOptions.style.display = engineType === 'electric' ? 'block' : 'none';
    fuelTankOptions.style.display = engineType === 'ic' ? 'block' : 'none';

    let selectedEngineSpec;
    let calculatedRpm = 0;

    if (engineType === 'electric') {
        const motorType = electricMotorTypeInput.value;
        selectedEngineSpec = ENGINE_SPECS.electric[motorType];
        updateEngineInputs(selectedEngineSpec, 'electric');

        // حساب RPM للمحرك الكهربائي
        const kv = getValidNumber(electricMotorKvInput);
        const voltage = getValidNumber(batteryVoltageInput);
        const efficiencyFactor = 0.85; // معامل تقديري للكفاءة والحمل
        calculatedRpm = kv * voltage * efficiencyFactor;

    } else { // ic
        const motorType = icEngineTypeInput.value;
        selectedEngineSpec = ENGINE_SPECS.ic[motorType];
        updateEngineInputs(selectedEngineSpec, 'ic');
        calculatedRpm = selectedEngineSpec.rpm || 8000; // استخدام RPM من المواصفات
    }
    propRpmInput.value = Math.round(calculatedRpm);
    // بعد تحديث حقول الإدخال من القائمة المنسدلة، قم بتحديث النموذج والحسابات
    updateAll();
    // لا حاجة لاستدعاء updateAll() هنا لأن مستمع الحدث 'change' سيقوم بذلك تلقائيًا.
}

function updatePlaneModel() {
    // --- FIX: Define all necessary variables at the top of the function scope ---
    const conversionFactor = UNIT_CONVERSIONS[unitSelector.value];
    const engineType = engineTypeInput.value;


    // قراءة قيم الجناح
    const wingSpan = getValidNumber(wingSpanInput) * conversionFactor;
    const wingChord = getValidNumber(wingChordInput) * conversionFactor;
    const wingThickness = getValidNumber(wingThicknessInput) * conversionFactor;
    const wingPosition = wingPositionInput.value;
    const airfoilType = airfoilTypeInput.value;
    const sweepAngle = getValidNumber(sweepAngleInput);

    const wingIncidenceAngle = getValidNumber(wingIncidenceAngleInput);
    // قراءة قيم المحرك والمروحة
    const engineVerticalPosition = getValidNumber(engineVerticalPositionInput) * conversionFactor;
    const engineThrustAngle = getValidNumber(engineThrustAngleInput) * (Math.PI / 180); // to radians
    const engineSideThrustAngle = getValidNumber(engineSideThrustAngleInput) * (Math.PI / 180); // to radians

    const dihedralAngle = getValidNumber(dihedralAngleInput);
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
    const vStabSweepAngle = getValidNumber(vStabSweepAngleInput);
    const tailAirfoilType = tailAirfoilTypeInput.value;
    const tailIncidenceAngle = getValidNumber(tailIncidenceAngleInput);
    const tailDihedralAngle = getValidNumber(tailDihedralAngleInput);
    const tailDihedralRad = tailDihedralAngle * (Math.PI / 180);
    const tailTaperRatio = getValidNumber(tailTaperRatioInput);

    // قراءة قيم جسم الطائرة
    const fuselageShape = fuselageShapeInput.value;

    // تحديد الأبعاد الفعلية لجسم الطائرة (الارتفاع والعرض) بناءً على الشكل المختار
    // تم نقل هذا الجزء للأعلى لضمان أن الأبعاد الحالية متاحة لجميع حسابات المواضع التالية
    let currentFuselageHeight;
    let currentFuselageWidth;

    if (fuselageShape === 'rectangular') {
        currentFuselageWidth = getValidNumber(fuselageWidthInput) * conversionFactor;
        currentFuselageHeight = getValidNumber(fuselageHeightInput) * conversionFactor;
    } else if (fuselageShape === 'cylindrical') {
        const fuselageDiameter = getValidNumber(fuselageDiameterInput) * conversionFactor;
        currentFuselageWidth = fuselageDiameter;
        currentFuselageHeight = fuselageDiameter; // القطر هو الارتفاع والعرض للأسطوانة
    } else if (fuselageShape === 'teardrop') {
        const frontDiameter = getValidNumber(fuselageFrontDiameterInput) * conversionFactor;
        const rearDiameter = getValidNumber(fuselageRearDiameterInput) * conversionFactor;
        // Use the largest diameter for positioning calculations to avoid clipping
        currentFuselageWidth = Math.max(frontDiameter, rearDiameter);
        currentFuselageHeight = Math.max(frontDiameter, rearDiameter);
    } else {
        currentFuselageWidth = 0.15; // Default values
        currentFuselageHeight = 0.15; // Default values
    }


    // New: Read fuselage taper ratio
    const fuselageTaperRatio = getValidNumber(fuselageTaperRatioInput);

    // New: Read component distances
    const wingPropDistance = getValidNumber(wingPropDistanceInput) * conversionFactor;
    const wingTailDistance = getValidNumber(wingTailDistanceInput) * conversionFactor;

    // Calculate X positions for components
    const wingPositionX = (fuselageLength / 2) - wingPropDistance;
    const tailPositionX = wingPositionX - wingTailDistance;

    // قيم المروحة تبقى بالبوصة كما هي متعارف عليها
    const propDiameter = getValidNumber(propDiameterInput) * 0.0254; // to meters
    const propChord = getValidNumber(propChordInput) * conversionFactor;
    const propThickness = getValidNumber(propThicknessInput) * conversionFactor;
    const spinnerDiameter = getValidNumber(spinnerDiameterInput) * conversionFactor;
    const pitchInMeters = getValidNumber(propPitchInput) * 0.0254;
    const propBlades = parseInt(getValidNumber(propBladesInput));
    const fuselageColor = fuselageColorInput.value;
    const wingColor = wingColorInput.value;
    const fuselageOpacity = getValidNumber(fuselageOpacityInput);
    const tailColor = tailColorInput.value;
    const pylonColor = pylonColorInput.value;
    const vortexColor = vortexColorInput.value;
    const airflowColor = airflowColorInput.value;
    const smokeColor = smokeColorInput.value;
    const backgroundColor = backgroundColorInput.value;
    const accessoryColor = accessoryColorInput.value; // FIX: Define accessoryColor


    // تحديث الألوان
    fuselageMaterial.color.set(fuselageColor);
    fuselageMaterial.opacity = fuselageOpacity;
    wingMaterial.color.set(wingColor);
    tailMaterial.color.set(tailColor);
    aileronMaterial.color.set(aileronColorInput.value);
    // The pylon material is created locally, so no global update needed here.
    engineMaterial.color.set(engineColorInput.value);
    cockpitMaterial.color.set(cockpitColorInput.value);
    propMaterial.color.set(propColorInput.value);
    wheelMaterial.color.set(wheelColorInput.value);
    // سيتم تحديث لون الملحقات عند إنشائها
    energySourceMaterial.color.set(energySourceColorInput.value);

    // تحديث ألوان جسيمات الهواء
    if (propParticleSystem && propParticleSystem.material.uniforms.color) {
        propParticleSystem.material.uniforms.color.value.set(airflowColor);
    }
    if (wingAirflowParticleSystem && wingAirflowParticleSystem.material.uniforms.color) {
        wingAirflowParticleSystem.material.uniforms.color.value.set(airflowColor);
    }
    if (vortexParticleSystem && vortexParticleSystem.material.uniforms.color) {
        vortexParticleSystem.material.uniforms.color.value.set(vortexColor);
    }
    if (smokeParticleSystem && smokeParticleSystem.material.uniforms.color) {
        smokeParticleSystem.material.uniforms.color.value.set(smokeColor);
    }
    scene.background.set(backgroundColor);

    // Wingtip Controls visibility
    if (hasWingtipInput.checked) {
        wingtipControls.style.display = 'block';
    } else {
        wingtipControls.style.display = 'none';
    }

    // Aileron Controls visibility
    if (hasAileronInput.checked) {
        aileronControls.style.display = 'block';
    } else {
        aileronControls.style.display = 'none';
    }

    // Cockpit Controls visibility
    if (hasCockpitInput.checked) {
        cockpitControls.style.display = 'block';
    } else {
        cockpitControls.style.display = 'none';
    }

    // إظهار/إخفاء حقول أبعاد الجسم بناءً على الشكل
    fuselageRectWidthGroup.style.display = 'none';
    fuselageRectHeightGroup.style.display = 'none';
    fuselageCylDiameterGroup.style.display = 'none';
    fuselageTearFrontDiaGroup.style.display = 'none';
    fuselageTearRearDiaGroup.style.display = 'none';
    fuselageEndsControls.style.display = 'none'; // إخفاء عناصر التحكم الجديدة افتراضيًا

    if (fuselageShape === 'rectangular') {
        fuselageRectWidthGroup.style.display = 'flex';
        fuselageRectHeightGroup.style.display = 'flex';
    } else if (fuselageShape === 'cylindrical') {
        fuselageCylDiameterGroup.style.display = 'flex';
        fuselageEndsControls.style.display = 'block'; // إظهارها للأسطواني
    } else if (fuselageShape === 'teardrop') {
        fuselageTearFrontDiaGroup.style.display = 'flex';
        fuselageTearRearDiaGroup.style.display = 'flex';
        fuselageEndsControls.style.display = 'block'; // إظهارها لقطرة الدموع
    }

    // إظهار/إخفاء خيارات موضع محرك الجناح
    const enginePlacement = enginePlacementInput.value;
    wingEnginePlacementOptions.style.display = enginePlacement === 'wing' ? 'block' : 'none';
    // إخفاء حقل الموضع العمودي للمحرك عند التركيب على الجناح لأنه غير مستخدم في هذه الحالة
    document.getElementById('engine-vertical-position-group').style.display = enginePlacement === 'wing' ? 'none' : 'flex';

    // إظهار/إخفاء خيار اتجاه دوران مروحة الجناح في قسم المحاكاة
    const wingPropRotationGroup = document.getElementById('wing-prop-rotation-group');
    if (wingPropRotationGroup) {
        wingPropRotationGroup.style.display = enginePlacement === 'wing' ? 'flex' : 'none';
    }


    // Landing Gear Controls visibility
    landingGearControls.style.display = hasLandingGearInput.checked ? 'block' : 'none';

    // New: Show/hide fuselage taper ratio input based on shape
    if (fuselageShape === 'rectangular' || fuselageShape === 'cylindrical') {
        fuselageTaperGroup.style.display = 'flex';
    } else {
        fuselageTaperGroup.style.display = 'none';
    }





    // Tail Controls visibility
    const isVTail = tailType === 'v-tail';

    // إظهار/إخفاء الحقول بناءً على نوع الذيل
    hStabSpanGroup.style.display = isVTail ? 'none' : 'flex';
    hStabChordGroup.style.display = isVTail ? 'none' : 'flex';
    vTailAngleGroup.style.display = isVTail ? 'flex' : 'none';

    // تغيير تسميات حقول الذيل العمودي عند اختيار V-Tail
    if (isVTail) {
        vStabHeightLabel.innerHTML = 'طول لوح الذيل V (<span class="unit-label">سم</span>)';
        vStabChordLabel.innerHTML = 'عرض لوح الذيل V (<span class="unit-label">سم</span>)';
    } else {
        vStabHeightLabel.innerHTML = 'ارتفاع الذيل العمودي (<span class="unit-label">سم</span>)';
        vStabChordLabel.innerHTML = 'عرض الذيل العمودي (<span class="unit-label">سم</span>)';
    }

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
    while (wingGroup.children.length > 0) {
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
        const z_end = ((i + 1) / segments) * halfSpan; // نهاية المقطع الحالي على طول الجناح

        for (let j = 0; j < pointsPerSection; j++) {
            // Check if this face is part of the aileron cutout
            const segmentOverlapsAileron = aileronActive && (z_start < aileronZEnd && z_end > aileronZStart);
            const p1_vertex_index = (i * pointsPerSection + j) * 3;
            const p1_x = vertices[p1_vertex_index];
            const spanProgress = z_start / halfSpan;
            const currentChord = rootChord + (rootChord * taperRatio - rootChord) * spanProgress;
            const sweepAtZ = z_start * Math.tan(sweepRad);
            const trailingEdgeX = sweepAtZ - (currentChord / 2);
            const isTrailingEdgeFace = p1_x < trailingEdgeX + aileronWidth;
            if (segmentOverlapsAileron && isTrailingEdgeFace) {
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

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    const leftWing = rightWing.clone();
    leftWing.scale.z = -1; // عكس الجناح الأيسر

    // --- تطبيق زاوية الديhedral ---
    // يتم الدوران حول المحور X (المحور الممتد من مقدمة الجناح لمؤخرته)
    const dihedralRad = dihedralAngle * (Math.PI / 180);
    rightWing.rotation.x = -dihedralRad; // إشارة سالبة لرفع الجناح للأعلى عند قيمة موجبة
    leftWing.rotation.x = -dihedralRad; // نفس الدوران، لأن الانعكاس في المقياس Z يعكس التأثير تلقائيًا

    // تحديد موضع الجناحين ليبدآ من جانبي جسم الطائرة
    rightWing.position.z = currentFuselageWidth / 2;
    leftWing.position.z = -currentFuselageWidth / 2;

    // تصحيح: إنشاء مجموعات محركات منفصلة لكل جناح لترث دوران الديhedral
    const rightWingEngineGroup = new THREE.Group();
    rightWingEngineGroup.name = "rightWingEngineGroup"; // إضافة اسم لسهولة العثور عليها
    const leftWingEngineGroup = new THREE.Group();
    leftWingEngineGroup.name = "leftWingEngineGroup"; // إضافة اسم لسهولة العثور عليها
    rightWing.add(rightWingEngineGroup);
    leftWing.add(leftWingEngineGroup);

    wingGroup.add(rightWing, leftWing);
    // Wingtip
    if (hasWingtipInput.checked) {
        const wingtipAirfoilType = wingtipAirfoilTypeInput.value;
        const wingtipLength = getValidNumber(wingtipLengthInput) * conversionFactor;
        const wingtipWidth = getValidNumber(wingtipWidthInput) * conversionFactor;
        const wingtipThickness = getValidNumber(wingtipThicknessInput) * conversionFactor;
        const wingtipPosition = getValidNumber(wingtipPositionInput) * conversionFactor;
        const wingtipAngle = getValidNumber(wingtipAngleInput) * Math.PI / 180; // Convert to radians
        const wingtipTwistAngle = getValidNumber(wingtipTwistAngleInput) * Math.PI / 180; // Convert to radians
        const wingtipTaperRatio = getValidNumber(wingtipTaperRatioInput);
        const wingtipSweepAngle = getValidNumber(wingtipSweepAngleInput);

        // إنشاء طرف الجناح باستخدام دالة createSurface للحصول على مقطع هوائي صحيح
        // نفترض عدم وجود استدقاق أو ميلان لطرف الجناح نفسه للتبسيط
        const wingtipGeometry = createSurface(wingtipLength, wingtipWidth, wingtipTaperRatio, wingtipSweepAngle, wingtipThickness, wingtipAirfoilType, true, true);

        const wingtipMaterial = new THREE.MeshStandardMaterial({ color: wingMaterial.color, side: THREE.DoubleSide });
        const rightWingtip = new THREE.Mesh(wingtipGeometry, wingtipMaterial);

        // Position the wingtip at the end of the main wing
        const tipSweep = halfSpan * Math.tan(sweepRad);
        const tipZ = halfSpan; // الموضع على امتداد الجناح
        // يجب أن يتمركز طرف الجناح مع مركز وتر الجناح عند نهايته.
        // مركز وتر الجناح عند النهاية هو tipSweep.
        rightWingtip.position.set(tipSweep, 0, tipZ);

        // Apply the cant angle (up/down rotation)
        rightWingtip.rotation.x = wingtipAngle;
        rightWingtip.rotation.y = wingtipTwistAngle; // Apply twist/toe angle

        const leftWingtip = rightWingtip.clone();
        // Correctly mirror the twist angle for the left winglet.
        // The cant angle (rotation.x) is handled correctly by the parent's negative scale.
        leftWingtip.rotation.y = -wingtipTwistAngle;

        rightWing.add(rightWingtip);
        leftWing.add(leftWingtip);

    }

    // Ailerons (Added after wingtips to ensure correct positioning relative to the final wing)
    if (hasAileronInput.checked) {
        const aileronLength = getValidNumber(aileronLengthInput) * conversionFactor;
        const aileronWidth = getValidNumber(aileronWidthInput) * conversionFactor;
        const aileronThickness = getValidNumber(aileronThicknessInput) * conversionFactor;
        const aileronPosition = getValidNumber(aileronPositionInput) * conversionFactor;
        const aileronAirfoilType = aileronAirfoilTypeInput.value;

        // --- حساب استدقاق الجنيح ليتناسب مع الجناح ---
        const aileronStartZ = halfSpan - aileronPosition - aileronLength;
        const aileronEndZ = halfSpan - aileronPosition;
        const chordAtAileronStart = rootChord + (rootChord * taperRatio - rootChord) * (aileronStartZ / halfSpan);
        const chordAtAileronEnd = rootChord + (rootChord * taperRatio - rootChord) * (aileronEndZ / halfSpan);
        const aileronTaperRatio = chordAtAileronEnd / chordAtAileronStart;

        // إنشاء هندسة الجنيح بشكل مستدق
        const aileronGeom = createSurface(aileronLength, aileronWidth, aileronTaperRatio, 0, aileronThickness, aileronAirfoilType, true, true);
        aileronGeom.translate(-aileronWidth / 2, 0, 0); // إزاحة المحور ليكون عند الحافة الأمامية للجنيح
        aileronGeom.rotateX(Math.PI / 2); // تدوير ليتوافق مع امتداد الجناح

        // Create the aileron meshes
        const rightAileron = new THREE.Mesh(aileronGeom, aileronMaterial);
        rightAileron.name = 'rightAileron'; // Name for raycasting

        // Create pivot groups to handle positioning, sweep, and rotation
        const rightAileronPivot = new THREE.Group();
        rightAileronPivot.add(rightAileron);
        const leftAileronPivot = rightAileronPivot.clone();
        leftAileronPivot.children[0].name = 'leftAileron';

        // --- حساب موضع ودوران محور الجنيح ---
        const hingeLineSlope = Math.tan(sweepRad) + (rootChord * (1 - taperRatio)) / wingSpan;
        const hingeAngle = Math.atan(hingeLineSlope);

        // حساب الموضع عند بداية الجنيح (أقرب نقطة للجسم)
        const sweepAtHingeStart = aileronStartZ * Math.tan(sweepRad);
        const hingeX = (sweepAtHingeStart - (chordAtAileronStart / 2)) + aileronWidth;
        const finalPivotZ = aileronStartZ;

        rightAileronPivot.position.set(hingeX, 0, finalPivotZ);
        rightAileronPivot.rotation.y = hingeAngle;

        leftAileronPivot.position.set(hingeX, 0, finalPivotZ);
        leftAileronPivot.rotation.y = hingeAngle;

        // Add pivots to the wings
        rightWing.add(rightAileronPivot);
        leftWing.add(leftAileronPivot);
    }




    // تحديث موضع الجناح (علوي/متوسط/سفلي)
    wingGroup.position.x = wingPositionX;
    if (wingPosition === 'high') wingGroup.position.y = currentFuselageHeight / 2;
    else if (wingPosition === 'mid') wingGroup.position.y = 0;
    else if (wingPosition === 'low') wingGroup.position.y = -currentFuselageHeight / 2;

    // تطبيق زاوية ميلان الجناح (Incidence)
    wingGroup.rotation.z = wingIncidenceAngle * (Math.PI / 180);

    // --- تحديث الأبعاد الأخرى ---
    // --- إعادة بناء مجموعة الذيل بالكامل ---
    while (tailAssembly.children.length > 0) {
        const child = tailAssembly.children[0];
        // Recursively dispose of geometries and materials to prevent memory leaks
        child.traverse(obj => {
            if (obj.isMesh) { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); }
        });
        tailAssembly.remove(child);
    }

    const tailThickness = getValidNumber(tailThicknessInput) * conversionFactor;
    const controlSurfaceThickness = getValidNumber(controlSurfaceThicknessInput) * conversionFactor;
    const hasElevator = hasElevatorInput.checked;
    const elevatorWidth = getValidNumber(elevatorWidthInput) * conversionFactor;
    const hasRudder = hasRudderInput.checked;
    const rudderWidth = getValidNumber(rudderWidthInput) * conversionFactor;

    const elevatorAirfoilType = elevatorAirfoilTypeInput.value;
    const rudderAirfoilType = rudderAirfoilTypeInput.value;
    // --- تطبيق موضع وزاوية ميلان الذيل ---
    tailAssembly.position.x = tailPositionX;
    tailAssembly.position.y = 0; // Y position is handled by components inside
    tailAssembly.position.z = 0;
    tailAssembly.rotation.z = tailIncidenceAngle * (Math.PI / 180);

    // --- Tail Assembly ---
    if (tailType === 'conventional') {
        const hStabChordEffective = hasElevator ? tailChord - elevatorWidth : tailChord;
        const vStabChordEffective = hasRudder ? vStabChord - rudderWidth : vStabChord;

        // Create right half of the horizontal stabilizer
        const hStabGeom = createSurface(tailSpan, hStabChordEffective, tailTaperRatio, tailSweepAngle, tailThickness, tailAirfoilType, false);
        // إزاحة المثبت الأفقي ليبدأ من جانب جسم الطائرة
        hStabGeom.translate(0, 0, currentFuselageWidth / 2);
        const rightHStab = new THREE.Mesh(hStabGeom, tailMaterial); // Define rightHStab
        rightHStab.position.x = -hStabChordEffective / 2; // Position relative to tailAssembly
        rightHStab.rotation.x = tailDihedralRad;
        // Clone and mirror for the left half
        const leftHStab = rightHStab.clone();
        leftHStab.scale.z = -1;

        const vStabGeom = createSurface(vStabHeight, vStabChordEffective, tailTaperRatio, vStabSweepAngle, tailThickness, tailAirfoilType, true);
        const vStab = new THREE.Mesh(vStabGeom, tailMaterial);
        vStab.position.x = -vStabChordEffective / 2; // Position relative to tailAssembly
        vStab.position.y = currentFuselageHeight / 2;

        tailAssembly.add(rightHStab, leftHStab, vStab);
    } else if (tailType === 't-tail') {
        const hStabChordEffective = hasElevator ? tailChord - elevatorWidth : tailChord;
        const vStabChordEffective = hasRudder ? vStabChord - rudderWidth : vStabChord;

        // Create right half of the horizontal stabilizer
        const hStabGeom = createSurface(tailSpan, hStabChordEffective, tailTaperRatio, tailSweepAngle, tailThickness, tailAirfoilType, false);
        const rightHStab = new THREE.Mesh(hStabGeom, tailMaterial);
        // رفع المثبت الأفقي ليجلس فوق المثبت العمودي
        rightHStab.position.set(-hStabChordEffective / 2, vStabHeight + currentFuselageHeight / 2, 0);
        rightHStab.rotation.x = tailDihedralRad;

        // Clone and mirror for the left half
        const leftHStab = rightHStab.clone(); // Corrected: leftHStab was not defined
        leftHStab.scale.z = -1;

        const vStabGeom = createSurface(vStabHeight, vStabChordEffective, tailTaperRatio, vStabSweepAngle, tailThickness, tailAirfoilType, true);
        const vStab = new THREE.Mesh(vStabGeom, tailMaterial);
        vStab.position.x = -vStabChordEffective / 2;
        // رفع المثبت العمودي ليجلس فوق جسم الطائرة
        vStab.position.y = currentFuselageHeight / 2;
        tailAssembly.add(rightHStab, leftHStab, vStab);
    } else if (tailType === 'v-tail') {
        const vStabChordEffective = hasRudder ? vStabChord - rudderWidth : vStabChord;
        const angleRad = vTailAngle * Math.PI / 180;
        const vTailPanelGeom = createSurface(vStabHeight, vStabChordEffective, tailTaperRatio, vStabSweepAngle, tailThickness, tailAirfoilType, true);

        const rightVPanel = new THREE.Mesh(vTailPanelGeom, tailMaterial);
        // إزاحة اللوحة اليمنى إلى جانب جسم الطائرة
        rightVPanel.position.z = currentFuselageWidth / 2;
        rightVPanel.rotation.x = -angleRad; // تدوير حول المحور X للحصول على شكل V

        const leftVPanel = rightVPanel.clone();
        // إزاحة اللوحة اليسرى إلى الجانب الآخر
        leftVPanel.position.z = -currentFuselageWidth / 2;
        leftVPanel.rotation.x = angleRad; // تدوير معاكس للجهة الأخرى

        const vTailAssembly = new THREE.Group();
        vTailAssembly.add(rightVPanel, leftVPanel);
        vTailAssembly.position.x = -vStabChordEffective / 2;
        // رفع مجموعة الذيل لتجلس فوق جسم الطائرة
        vTailAssembly.position.y = currentFuselageHeight / 2;
        tailAssembly.add(vTailAssembly);

    }
    // --- Tail Control Surfaces ---
    if (hasElevator && tailType !== 'v-tail') {
        // إنشاء سطح مائل ومستدق لنصف الرافع
        const elevatorLength = getValidNumber(elevatorLengthInput) * conversionFactor;
        const elevatorHalfGeom = createSurface(elevatorLength * 2, elevatorWidth, tailTaperRatio, tailSweepAngle, controlSurfaceThickness, elevatorAirfoilType, false, true);
        elevatorHalfGeom.translate(-elevatorWidth / 2, 0, 0); // تمدد للخلف من نقطة المفصل
        // إزاحة الرافع ليبدأ من جانب جسم الطائرة، مما يخلق فجوة في المنتصف
        elevatorHalfGeom.translate(0, 0, currentFuselageWidth / 2);

        // الرافع الأيمن
        const rightElevator = new THREE.Mesh(elevatorHalfGeom, aileronMaterial);
        rightElevator.name = 'rightElevator';
        const rightElevatorPivot = new THREE.Group();
        rightElevatorPivot.add(rightElevator);

        // الرافع الأيسر (استنساخ وعكس)
        const leftElevatorPivot = rightElevatorPivot.clone();
        leftElevatorPivot.scale.z = -1;
        leftElevatorPivot.children[0].name = 'leftElevator';

        // نضع المحور عند الحافة الخلفية للجزء الثابت من الذيل
        const hStabRootChordEffective = tailChord - elevatorWidth;
        const pivotX = -hStabRootChordEffective;
        const elevatorY = (tailType === 't-tail' ? vStabHeight + currentFuselageHeight / 2 : 0);

        rightElevatorPivot.position.set(pivotX, elevatorY, 0);
        leftElevatorPivot.position.set(pivotX, elevatorY, 0);
        tailAssembly.add(rightElevatorPivot, leftElevatorPivot);
    }

    if (hasRudder && tailType !== 'v-tail') {
        // إنشاء سطح مائل ومستدق للدفة
        const rudderLength = getValidNumber(rudderLengthInput) * conversionFactor;
        // تصحيح: استخدام سماكة أسطح التحكم الجديدة
        const rudderGeom = createSurface(rudderLength, rudderWidth, tailTaperRatio, vStabSweepAngle, controlSurfaceThickness, rudderAirfoilType, true, true);
        rudderGeom.translate(-rudderWidth / 2, 0, 0); // تمدد للخلف من نقطة المفصل

        const rudder = new THREE.Mesh(rudderGeom, aileronMaterial);
        rudder.name = 'rudder';
        const rudderPivot = new THREE.Group();
        rudderPivot.add(rudder);
        // تصحيح: نضع المحور عند الحافة الخلفية للجزء الثابت من الذيل العمودي
        const vStabRootChordEffective = vStabChord - rudderWidth;
        // يجب أن يكون موضع المحور عند الحافة الخلفية للجزء الثابت من الذيل العمودي
        const pivotX = -vStabRootChordEffective;

        rudderPivot.position.set(pivotX, currentFuselageHeight / 2, 0); // تبدأ الهندسة من y=0، لذا نرفعها

        tailAssembly.add(rudderPivot);
    } else if (hasRudderInput.checked && tailType === 'v-tail') {
        // This part is complex and can be added in a future step
    }

    // --- تحديث جسم الطائرة ---
    // إزالة الأجزاء القديمة من مجموعة الجسم
    while (fuselageGroup.children.length > 0) {
        fuselageGroup.remove(fuselageGroup.children[0]);
    }
    // إعادة إضافة مجموعة علامة مركز الثقل بعد مسح المجموعة لضمان عدم حذفها
    fuselageGroup.add(cgFuselageMarkerGroup);
    if (fuselageShape === 'rectangular') {
        const rearWidth = currentFuselageWidth * fuselageTaperRatio;
        const rearHeight = currentFuselageHeight * fuselageTaperRatio;
        const halfLength = fuselageLength / 2;
        const halfFrontWidth = currentFuselageWidth / 2;
        const halfFrontHeight = currentFuselageHeight / 2;
        const halfRearWidth = rearWidth / 2;
        const halfRearHeight = rearHeight / 2;

        const vertices = new Float32Array([ // ... (vertices definition)
            halfLength, halfFrontHeight, halfFrontWidth, -halfLength, halfRearHeight, halfRearWidth,
            halfLength, -halfFrontHeight, halfFrontWidth, -halfLength, -halfRearHeight, halfRearWidth,
            halfLength, -halfFrontHeight, -halfFrontWidth, -halfLength, -halfRearHeight, -halfRearWidth,
            halfLength, halfFrontHeight, -halfFrontWidth, -halfLength, halfRearHeight, -halfRearWidth,
        ]);
        const indices = new Uint16Array([ // ... (indices definition)
            0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
            0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6,
            0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
        ]);
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            halfLength, halfFrontHeight, halfFrontWidth, halfLength, -halfFrontHeight, halfFrontWidth, halfLength, -halfFrontHeight, -halfFrontWidth, halfLength, halfFrontHeight, -halfFrontWidth,
            -halfLength, halfRearHeight, halfRearWidth, -halfLength, -halfRearHeight, halfRearWidth, -halfLength, -halfRearHeight, -halfRearWidth, -halfLength, halfRearHeight, -halfRearWidth
        ]), 3));
        geom.setIndex(new THREE.BufferAttribute(new Uint16Array([
            0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 3, 7, 4, 3, 4, 0, 1, 5, 6, 1, 6, 2, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7
        ]), 1));
        geom.computeVertexNormals();
        fuselageGroup.add(new THREE.Mesh(geom, fuselageMaterial));

    } else {
        // للنماذج الأسطوانية وذات شكل قطرة الدمع
        const noseShape = fuselageNoseShapeInput.value;
        const tailShape = fuselageTailShapeInput.value;

        let radiusFront, radiusRear;

        if (fuselageShape === 'cylindrical') {
            const fuselageDiameter = getValidNumber(fuselageDiameterInput) * conversionFactor;
            radiusFront = fuselageDiameter / 2;
            radiusRear = radiusFront * fuselageTaperRatio;
        } else { // teardrop
            radiusFront = (getValidNumber(fuselageFrontDiameterInput) * conversionFactor) / 2;
            radiusRear = (getValidNumber(fuselageRearDiameterInput) * conversionFactor) / 2;
        }

        // --- حساب أطوال المقدمة والمؤخرة بناءً على شكلهما ---
        let noseLength = 0;
        if (noseShape === 'rounded') {
            noseLength = radiusFront; // طول نصف الكرة هو نصف قطرها
        } else if (noseShape === 'ogival') {
            noseLength = radiusFront * 2.0; // طول الشكل البيضوي يُعرّف بأنه ضعف نصف القطر
        }

        let tailLength = 0;
        if (tailShape === 'rounded') {
            tailLength = radiusRear; // طول نصف الكرة هو نصف قطرها
        }

        // طول الجزء الأوسط من الجسم هو الطول الكلي مطروحًا منه أطوال الأغطية الطرفية
        const bodyLength = fuselageLength - noseLength - tailLength;

        // --- بناء المقدمة ---
        if (noseShape !== 'flat' && radiusFront > 0) {
            let noseGeom;
            if (noseShape === 'rounded') {
                // إنشاء نصف كرة
                noseGeom = new THREE.SphereGeometry(radiusFront, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
                // تدويرها لتشير إلى الأمام (محور +Y الأصلي يصبح +X)
                noseGeom.rotateZ(-Math.PI / 2);
            } else { // ogival
                // تم تعديل createOgiveGeometry ليكون أصلها عند القاعدة
                noseGeom = createOgiveGeometry(radiusFront, noseLength, 32);
                // تدويرها لتشير إلى الأمام على طول المحور X+
                noseGeom.rotateZ(Math.PI / 2);
            }
            const noseCone = new THREE.Mesh(noseGeom, fuselageMaterial);
            // وضع قاعدة المقدمة عند مقدمة الجسم
            noseCone.position.x = fuselageLength / 2 - noseLength;
            fuselageGroup.add(noseCone);
        }

        // --- بناء المؤخرة ---
        if (tailShape !== 'flat' && radiusRear > 0) {
            const tailGeom = new THREE.SphereGeometry(radiusRear, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            tailGeom.rotateZ(Math.PI / 2); // تدويرها لتشير إلى الخلف (محور +Y الأصلي يصبح -X)
            const tailCone = new THREE.Mesh(tailGeom, fuselageMaterial);
            tailCone.position.x = -fuselageLength / 2 + tailLength;
            fuselageGroup.add(tailCone);
        }

        // --- بناء الجسم الأوسط ---
        if (bodyLength > 0.001) { // إضافة هامش صغير لتجنب الأجسام ذات الطول الصفري
            const bodyGeom = new THREE.CylinderGeometry(radiusRear, radiusFront, bodyLength, 32);
            bodyGeom.rotateZ(Math.PI / 2);
            const mainBody = new THREE.Mesh(bodyGeom, fuselageMaterial);

            // مركز الجسم الأوسط يقع في منتصف المسافة بين نهاية المقدمة وبداية المؤخرة
            mainBody.position.x = (tailLength - noseLength) / 2;
            fuselageGroup.add(mainBody);
        }
    }

    // --- إنشاء وتحديد موضع المحرك والمروحة ---
    // 1. إزالة النماذج القديمة
    while (engineGroup.children.length > 0) engineGroup.remove(engineGroup.children[0]);
    while (propellerGroup.children.length > 0) propellerGroup.remove(propellerGroup.children[0]);
    // تصحيح: مسح محركات الجناح القديمة قبل إعادة بنائها
    const rightWingEngineGrp = scene.getObjectByName("rightWingEngineGroup");
    if (rightWingEngineGrp) {
        while(rightWingEngineGrp.children.length > 0) rightWingEngineGrp.remove(rightWingEngineGrp.children[0]);
    }
    const leftWingEngineGrp = scene.getObjectByName("leftWingEngineGroup");
    if (leftWingEngineGrp) {
        while(leftWingEngineGrp.children.length > 0) leftWingEngineGrp.remove(leftWingEngineGrp.children[0]);
    }


    // إعادة تعيين موضع ودوران المجموعات قبل تطبيق القيم الجديدة
    engineGroup.position.set(0, 0, 0);
    engineGroup.rotation.set(0, 0, 0);
    propellerGroup.position.set(0, 0, 0);
    propellerGroup.rotation.set(0, 0, 0);


    // 2. قراءة أبعاد المحرك والمروحة
    let engineLengthMeters = 0;
    let engineDiameterMeters = 0;
    if (engineType === 'electric') {
        engineLengthMeters = getValidNumber(electricMotorLengthInput) * conversionFactor;
        engineDiameterMeters = getValidNumber(electricMotorDiameterInput) * conversionFactor;
    } else { // ic
        engineLengthMeters = getValidNumber(icEngineLengthInput) * conversionFactor;
        engineDiameterMeters = getValidNumber(icEngineDiameterInput) * conversionFactor;
    }

    // 3. إنشاء نماذج أولية للمحرك والمروحة
    let engineProto = null;
    if (engineLengthMeters > 0 && engineDiameterMeters > 0) {
        const engineGeom = new THREE.CylinderGeometry(engineDiameterMeters / 2, engineDiameterMeters / 2, engineLengthMeters, 16);
        engineGeom.rotateZ(Math.PI / 2); // تدوير الأسطوانة لتكون أفقية
        engineProto = new THREE.Mesh(engineGeom, engineMaterial);
    }

    const propProto = new THREE.Group();
    const spinnerGeom = new THREE.SphereGeometry(spinnerDiameter / 2, 16, 12);
    spinnerGeom.scale(1.5, 1, 1);
    propProto.add(new THREE.Mesh(spinnerGeom, propMaterial));
    const bladeRadius = (propDiameter / 2) - (spinnerDiameter / 2);
    const bladeGeom = createPropellerBladeGeom(bladeRadius, propChord, propChord * 0.5, propThickness, pitchInMeters, spinnerDiameter / 2, 'flat-bottom');
    for (let i = 0; i < propBlades; i++) {
        const blade = new THREE.Mesh(bladeGeom, propMaterial);
        blade.rotation.x = (i / propBlades) * Math.PI * 2;
        propProto.add(blade);
    }

    // 4. تحديد الموضع بناءً على اختيار المستخدم
    if (enginePlacement === 'front') {
        if (engineProto) {
            // The engine model itself has no offset within its group
            engineGroup.add(engineProto.clone());
        }
        propellerGroup.add(propProto.clone());

        // Apply position and rotation to the GROUPS
        engineGroup.position.set(fuselageLength / 2 + engineLengthMeters / 2, engineVerticalPosition, 0);
        engineGroup.rotation.set(0, engineSideThrustAngle, engineThrustAngle);

        propellerGroup.position.set(fuselageLength / 2 + engineLengthMeters + 0.01, engineVerticalPosition, 0);
        propellerGroup.rotation.copy(engineGroup.rotation); // Propeller has the same thrust line

    } else if (enginePlacement === 'rear') {
        if (engineProto) {
            engineGroup.add(engineProto.clone());
        }
        const pusherProp = propProto.clone();
        pusherProp.rotation.y = Math.PI; // Visual rotation for pusher
        propellerGroup.add(pusherProp);

        // Apply position and rotation to the GROUPS
        engineGroup.position.set(-fuselageLength / 2 - engineLengthMeters / 2, engineVerticalPosition, 0);
        engineGroup.rotation.set(0, engineSideThrustAngle, engineThrustAngle);

        propellerGroup.position.set(-fuselageLength / 2 - engineLengthMeters - 0.01, engineVerticalPosition, 0);
        // Combine thrust angles with the 180-degree pusher rotation
        propellerGroup.rotation.set(0, engineSideThrustAngle + Math.PI, engineThrustAngle);

    } else if (enginePlacement === 'wing') {
        if (engineProto) {
            // قراءة جميع خيارات تركيب الجناح
            const wingEngineDistMeters = getValidNumber(engineWingDistanceInput) * conversionFactor;
            const wingEngineVerticalPos = engineWingVerticalPosInput.value;
            const wingEngineForeAft = engineWingForeAftInput.value;
            // "طول" الحامل من المدخلات هو في الواقع ارتفاعه العمودي
            const pylonHeightMeters = getValidNumber(enginePylonLengthInput) * conversionFactor;

            // حساب الموضع على امتداد الجناح
            const localZ = wingEngineDistMeters;
            const spanProgress = localZ / halfSpan;

            // حساب خصائص الجناح عند هذا الموضع
            const chordAtPylon = rootChord + (rootChord * taperRatio - rootChord) * spanProgress;
            const sweepAtPylon = localZ * Math.tan(sweepRad);
            // حساب إحداثيات الحافة الأمامية والخلفية محلياً بالنسبة لنقطة أصل الجناح
            const leadingEdgeX_local = sweepAtPylon + chordAtPylon / 2;
            const trailingEdgeX_local = sweepAtPylon - chordAtPylon / 2;

            // حساب الموضع العمودي للمحرك (أعلى/أسفل) مع الأخذ في الاعتبار ارتفاع الحامل
            let engineY_relative;
            if (wingEngineVerticalPos === 'above') {
                // الموضع النسبي من مركز الجناح
                engineY_relative = (wingThickness / 2) + pylonHeightMeters + (engineDiameterMeters / 2);
            } else { // 'below'
                engineY_relative = -(wingThickness / 2) - pylonHeightMeters - (engineDiameterMeters / 2);
            }

            // حساب الموضع الأفقي (أمامي/خلفي) وإعداد المروحة
            let engineCenterX, propCenterX;
            let propModel;
            // تحديد طول الحامل في الاتجاه الأمامي-الخلفي (غير محدد من قبل المستخدم)
            const pylonForeAftLength = engineDiameterMeters * 0.6;

            // --- إنشاء حامل المحرك (Pylon) ---
            if (pylonHeightMeters > 0.001) {
                const pylonWidth = engineDiameterMeters * 0.4; // عرض الحامل أنحف قليلاً من المحرك
                const pylonGeom = new THREE.BoxGeometry(pylonForeAftLength, pylonHeightMeters, pylonWidth);

                // استخدام لون الحامل من أداة اختيار الألوان
                const pylonMaterial = new THREE.MeshStandardMaterial({ color: pylonColor, side: THREE.DoubleSide });

                // حساب موضع الحامل
                let pylonY_local;

                if (wingEngineVerticalPos === 'above') {
                    pylonY_local = (wingThickness / 2) + (pylonHeightMeters / 2);
                } else { // below
                    pylonY_local = -(wingThickness / 2) - (pylonHeightMeters / 2);
                }

                // حساب موضع الحامل المحلي
                const pylonX_local = (wingEngineForeAft === 'leading') ? (leadingEdgeX_local + pylonForeAftLength / 2) : (trailingEdgeX_local - pylonForeAftLength / 2);

                const rightPylon = new THREE.Mesh(pylonGeom, pylonMaterial);
                rightPylon.position.set(pylonX_local, pylonY_local, localZ);
                const leftPylon = rightPylon.clone(); // يستنسخ الموضع المحلي الصحيح

                // تصحيح: إضافة الحوامل إلى مجموعات المحركات الخاصة بكل جناح
                rightWingEngineGroup.add(rightPylon);
                leftWingEngineGroup.add(leftPylon);
            }

            // --- حساب موضع المحرك والمروحة بناءً على موضع الحامل ---
            if (wingEngineForeAft === 'leading') {
                // المحرك يقع أمام الحامل
                engineCenterX = leadingEdgeX_local + pylonForeAftLength + (engineLengthMeters / 2);
                propCenterX = engineCenterX + (engineLengthMeters / 2) + 0.01;
                propModel = propProto.clone(); // مروحة سحب (Tractor)
            } else { // 'trailing'
                // المحرك يقع خلف الحامل
                engineCenterX = trailingEdgeX_local - pylonForeAftLength - (engineLengthMeters / 2);
                propCenterX = engineCenterX - (engineLengthMeters / 2) - 0.01;
                propModel = propProto.clone();
                propModel.rotation.y = Math.PI; // مروحة دفع (Pusher)
            }

            // إنشاء ووضع المحركات والمراوح
            const rightEngine = engineProto.clone();
            const leftEngine = engineProto.clone();
            const rightProp = propModel.clone();
            const leftProp = propModel.clone();

            // تصحيح: إضافة أسماء فريدة للمراوح للعثور عليها بسهولة في حلقة الرسوم المتحركة
            rightProp.name = "wingProp_right";
            leftProp.name = "wingProp_left";

            // تصحيح: استخدام الإحداثيات المحلية لجميع المكونات
            rightEngine.position.set(engineCenterX, engineY_relative, localZ);
            leftEngine.position.set(engineCenterX, engineY_relative, localZ);

            rightProp.position.set(propCenterX, engineY_relative, localZ);
            leftProp.position.set(propCenterX, engineY_relative, localZ);

            // Apply thrust angles to each component
            rightEngine.rotation.set(0, engineSideThrustAngle, engineThrustAngle);
            leftEngine.rotation.set(0, engineSideThrustAngle, engineThrustAngle);
            rightProp.rotation.set(0, engineSideThrustAngle, engineThrustAngle);
            leftProp.rotation.set(0, engineSideThrustAngle, engineThrustAngle);

            // For pusher props on the wing, add the 180 deg rotation
            if (wingEngineForeAft === 'trailing') {
                rightProp.rotation.y += Math.PI;
                leftProp.rotation.y += Math.PI;
            }

            // تصحيح: إضافة كل مكون إلى مجموعة المحرك الخاصة بجناحه
            rightWingEngineGroup.add(rightEngine, rightProp);
            leftWingEngineGroup.add(leftEngine, leftProp);
        }
    }
    // --- Landing Gear ---
    while (landingGearGroup.children.length > 0) {
        landingGearGroup.remove(landingGearGroup.children[0]);
    }

    if (hasLandingGearInput.checked) {
        const gearType = gearTypeInput.value;
        const wheelDiameter = getValidNumber(wheelDiameterInput) * conversionFactor;
        const wheelThickness = getValidNumber(wheelThicknessInput) * conversionFactor;
        const strutLength = getValidNumber(strutLengthInput) * conversionFactor;
        const strutThickness = getValidNumber(strutThicknessInput) * conversionFactor;
        const mainGearPosition = getValidNumber(mainGearPositionInput) * conversionFactor;
        const mainGearWidth = getValidNumber(mainGearWidthInput) * conversionFactor;
        const hasRetractableGear = hasRetractableGearInput.checked;

        // Create reusable geometries
        const wheelGeom = new THREE.CylinderGeometry(wheelDiameter / 2, wheelDiameter / 2, wheelThickness, 24);
        wheelGeom.rotateX(Math.PI / 2); // Make the wheel stand upright
        const strutGeom = new THREE.CylinderGeometry(strutThickness / 2, strutThickness / 2, strutLength, 12);

        // --- Main Gear ---
        const createMainGear = (side) => {
            const gearAssembly = new THREE.Group();
            const strut = new THREE.Mesh(strutGeom, strutMaterial);
            const wheel = new THREE.Mesh(wheelGeom, wheelMaterial);

            // Position strut relative to assembly origin (top of strut)
            strut.position.y = -strutLength / 2;

            // Position wheel at the bottom of the strut
            wheel.position.y = -strutLength;

            gearAssembly.add(strut, wheel);

            // Position the whole assembly
            let gearYPosition = -currentFuselageHeight / 2; // Default extended position
            if (hasRetractableGear) {
                // Move the gear up by its strut length to simulate retraction
                gearYPosition += strutLength;
            }
            gearAssembly.position.x = (fuselageLength / 2) - mainGearPosition;
            gearAssembly.position.y = gearYPosition;
            gearAssembly.position.z = (mainGearWidth / 2) * side;

            return gearAssembly;
        };

        if (gearType === 'tricycle' || gearType === 'taildragger' || gearType === 'main-only') {
            const rightMainGear = createMainGear(1);
            const leftMainGear = createMainGear(-1);
            landingGearGroup.add(rightMainGear, leftMainGear);
        }

        // --- Nose/Tail Gear ---
        if (gearType === 'tricycle') {
            const noseGearAssembly = createMainGear(0); // Create a central gear
            noseGearAssembly.position.x = fuselageLength / 2 - (wheelDiameter); // Position it near the front
            landingGearGroup.add(noseGearAssembly);
        } else if (gearType === 'taildragger') {
            const tailWheelGeom = new THREE.CylinderGeometry(wheelDiameter / 3, wheelDiameter / 3, wheelThickness * 0.8, 16);
            tailWheelGeom.rotateX(Math.PI / 2);
            const tailWheel = new THREE.Mesh(tailWheelGeom, wheelMaterial);

            let tailWheelYPosition = -currentFuselageHeight / 2 + (wheelDiameter / 3); // Simplified extended position
            if (hasRetractableGear) {
                tailWheelYPosition += (wheelDiameter / 3); // Move up by its own radius
            }
            tailWheel.position.x = tailPositionX; // Position it near the tail assembly
            tailWheel.position.y = tailWheelYPosition;
            tailWheel.position.z = 0;
            landingGearGroup.add(tailWheel);
        }
    }

    // --- Cockpit ---
    while (cockpitGroup.children.length > 0) {
        cockpitGroup.remove(cockpitGroup.children[0]);
    }

    if (hasCockpitInput.checked) {
        const cockpitLength = getValidNumber(cockpitLengthInput) * conversionFactor;
        const cockpitWidth = getValidNumber(cockpitWidthInput) * conversionFactor;
        const cockpitHeight = getValidNumber(cockpitHeightInput) * conversionFactor;
        const cockpitPosition = getValidNumber(cockpitPositionInput) * conversionFactor;
        const cockpitShape = cockpitShapeInput.value;
        const cockpitOpacity = getValidNumber(cockpitOpacityInput);

        cockpitMaterial.opacity = cockpitOpacity;

        // يتم استخدام نصف كرة كأساس لكلا الشكلين
        const cockpitGeom = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);

        const cockpitMesh = new THREE.Mesh(cockpitGeom, cockpitMaterial);

        // تغيير حجم نصف الكرة بناءً على الشكل المختار
        if (cockpitShape === 'streamlined') {
            // الشكل الانسيابي يمكن أن يكون بيضاويًا (ellipsoid)
            cockpitMesh.scale.set(cockpitLength / 2, cockpitHeight, cockpitWidth / 2);
        } else { // 'bubble' - الشكل المحدب (Bubble) هو نصف شكل بيضاوي (ellipsoid)
            // يستخدم الطول والعرض والارتفاع المحددة.
            cockpitMesh.scale.set(cockpitLength / 2, cockpitHeight, cockpitWidth / 2);
        }

        // Position the cockpit
        // X: From the front of the fuselage, moving backwards.
        // Y: On top of the fuselage.
        // Z: Centered.
        const cockpitX = (fuselageLength / 2) - cockpitPosition - (cockpitLength / 2);
        const cockpitY = fuselageGroup.position.y + currentFuselageHeight / 2;
        cockpitMesh.position.set(cockpitX, cockpitY, 0);

        cockpitGroup.add(cockpitMesh);
    }

    // --- تحديث الملحقات ---
    // إزالة النماذج القديمة وتنظيف الذاكرة
    while (accessoriesGroup.children.length > 0) {
        const child = accessoriesGroup.children[0];
        child.traverse(obj => {
            if (obj.isMesh) {
                if (obj.geometry) obj.geometry.dispose();
                // لا تقم بحذف المادة إذا كانت مشتركة
            }
        });
        accessoriesGroup.remove(child);
    }

    const accessoryMaterial = new THREE.MeshStandardMaterial({ color: accessoryColor, transparent: true, opacity: 0.8 }); // This will now work

    const createAccessoryBox = (weightGrams, posX_cm, posY_cm, posZ_cm, name) => {
        if (weightGrams <= 0) return;

        const weightKg = weightGrams / 1000;
        const densityKgM3 = 1800; // كثافة تقديرية للإلكترونيات
        const volumeM3 = weightKg / densityKgM3;
        const sideLength = Math.cbrt(volumeM3);

        const geom = new THREE.BoxGeometry(sideLength, sideLength, sideLength);
        const box = new THREE.Mesh(geom, accessoryMaterial);
        box.name = name;

        // تحويل المواضع من سم إلى متر وتطبيقها
        const posX_m = posX_cm * conversionFactor;
        const posY_m = posY_cm * conversionFactor;
        const posZ_m = posZ_cm * conversionFactor;

        // الموضع X يُحسب من مقدمة الطائرة
        box.position.x = (fuselageLength / 2) - posX_m;
        // المواضع Y و Z تُطبق مباشرة
        box.position.y = posY_m;
        box.position.z = posZ_m;

        accessoriesGroup.add(box);
    };

    // استدعاء الدالة مع الإحداثيات الجديدة
    createAccessoryBox(getValidNumber(receiverWeightInput), getValidNumber(receiverPositionInput), getValidNumber(receiverPositionYInput), getValidNumber(receiverPositionZInput), 'Receiver');
    createAccessoryBox(getValidNumber(cameraWeightInput), getValidNumber(cameraPositionInput), getValidNumber(cameraPositionYInput), getValidNumber(cameraPositionZInput), 'Camera');
    // إنشاء صناديق لمجموعات السيرفو
    createAccessoryBox(getValidNumber(servoG1WeightInput) * getValidNumber(servoG1CountInput), getValidNumber(servoG1PositionXInput), getValidNumber(servoG1PositionYInput), getValidNumber(servoG1PositionZInput), 'Servo Group 1');
    createAccessoryBox(getValidNumber(servoG2WeightInput) * getValidNumber(servoG2CountInput), getValidNumber(servoG2PositionXInput), getValidNumber(servoG2PositionYInput), getValidNumber(servoG2PositionZInput), 'Servo Group 2');

    // --- FIX: Energy Source (Battery/Fuel Tank) Logic ---
    energySourceGroup.visible = false; // إخفاؤه افتراضيًا

    if (engineType === 'electric') {
        energySourceGroup.visible = true;

        // حساب الحجم بناءً على الوزن والكثافة التقديرية للبطارية
        const batteryWeightGrams = getValidNumber(batteryWeightInput); // Already in grams
        const batteryDensityG_cm3 = 1.5; // كثافة تقديرية للبطارية مع الغلاف (جرام/سم^3)
        const volume_cm3 = batteryWeightGrams > 0 ? batteryWeightGrams / batteryDensityG_cm3 : 0;
        const volume_m3 = volume_cm3 / 1e6;

        // حساب الأبعاد من الحجم مع الحفاظ على نسبة أبعاد تقديرية (L:W:H = 4:2:1)
        const x_dim = volume_m3 > 0 ? Math.cbrt(volume_m3 / (4 * 2 * 1)) : 0;
        const height = x_dim * 1;
        const width = x_dim * 2;
        const length = x_dim * 4;

        energySourceMesh.scale.set(length, height, width);

        const batteryPositionFromNose = getValidNumber(batteryPositionInput) * conversionFactor;
        energySourceGroup.position.x = (fuselageLength / 2) - batteryPositionFromNose;

    } else if (engineType === 'ic') {
        energySourceGroup.visible = true;

        energySourceMesh.scale.set(getValidNumber(fuelTankLengthInput) * conversionFactor, getValidNumber(fuelTankHeightInput) * conversionFactor, getValidNumber(fuelTankWidthInput) * conversionFactor);
        const tankPositionFromNose = getValidNumber(fuelTankPositionInput) * conversionFactor;
        energySourceGroup.position.x = (fuselageLength / 2) - tankPositionFromNose;
    }
}

/**
 * يقرأ جميع المدخلات، ويحسب الخصائص الديناميكية الهوائية والوزن، ويعرض النتائج.
 * تم تعديل هذه الدالة لتقرأ القيم مباشرة من عناصر DOM لضمان الدقة.
 */
function calculateAerodynamics() {
    // --- FIX: Read all values directly from DOM to ensure they are current ---
    const conversionFactor = UNIT_CONVERSIONS[unitSelector.value];

    // Helper to get value and convert
    const getVal = (el) => getValidNumber(el) * conversionFactor;
    const getRaw = (el) => getValidNumber(el);
    const getStr = (el) => el.value;
    const getCheck = (el) => el.checked;

    // --- Read ALL parameters directly from inputs ---
    const wingSpan = getVal(wingSpanInput);
    const wingChord = getVal(wingChordInput);
    const wingThickness = getVal(wingThicknessInput);
    const taperRatio = getRaw(taperRatioInput);
    const airfoilType = getStr(airfoilTypeInput);
    const angleOfAttack = getRaw(angleOfAttackInput);
    const airSpeed = getRaw(airSpeedInput);
    const airDensity = getRaw(airDensityInput);
    const propDiameter = getRaw(propDiameterInput) * 0.0254; // in to m
    const propChord = getVal(propChordInput);
    const propThickness = getVal(propThicknessInput);
    const spinnerDiameter = getVal(spinnerDiameterInput);
    const propBlades = parseInt(getRaw(propBladesInput));
    const propMaterial = getStr(propMaterialInput);
    const propPitch = getRaw(propPitchInput); // inches
    const propRpm = getRaw(propRpmInput); // RPM
    const controlSurfaceMaterial = getStr(controlSurfaceMaterialInput);
    const structureMaterial = getStr(structureMaterialInput);
    const fuselageMaterialValue = getStr(fuselageMaterialInput);
    const fuselageShape = getStr(fuselageShapeInput);
    const fuselageTaperRatio = getRaw(fuselageTaperRatioInput);
    const fuselageLength = getVal(fuselageLengthInput);
    const sweepRad = getRaw(sweepAngleInput) * (Math.PI / 180); // تعريف sweepRad مرة واحدة هنا
    const sweepAngle = getRaw(sweepAngleInput);
    const wingPosition = getStr(wingPositionInput);
    const dihedralAngle = getRaw(dihedralAngleInput);
    const tailDihedralAngle = getRaw(tailDihedralAngleInput);
    const wingIncidenceAngle = getRaw(wingIncidenceAngleInput);
    const tailSpan = getVal(tailSpanInput);
    const tailChord = getVal(tailChordInput);
    const vStabHeight = getVal(vStabHeightInput);
    const vStabChord = getVal(vStabChordInput);
    const tailType = getStr(tailTypeInput);
    const tailThickness = getVal(tailThicknessInput);
    const controlSurfaceThickness = getVal(controlSurfaceThicknessInput);
    const hasWingtip = getCheck(hasWingtipInput);
    const wingtipShape = getStr(wingtipShapeInput);
    const wingtipAirfoilType = getStr(wingtipAirfoilTypeInput);
    const wingtipLength = getVal(wingtipLengthInput);
    const wingtipWidth = getVal(wingtipWidthInput);
    const wingtipThickness = getVal(wingtipThicknessInput);
    const wingtipTaperRatio = getRaw(wingtipTaperRatioInput);
    const hasCockpit = getCheck(hasCockpitInput);
    const cockpitLength = getVal(cockpitLengthInput);
    const cockpitWidth = getVal(cockpitWidthInput); // This was a duplicate, but keeping it for context
    const cockpitHeight = getVal(cockpitHeightInput); // This was a duplicate, but keeping it for context
    const cockpitMaterial = getStr(cockpitMaterialInput); // This was a duplicate, but keeping it for context
    const cockpitPosition = getVal(cockpitPositionInput); // This was a duplicate, but keeping it for context
    const engineType = getStr(engineTypeInput); // This was a duplicate, but keeping it for context
    const hasLandingGear = getCheck(hasLandingGearInput); // This was a duplicate, but keeping it for context
    const wheelDiameter = getVal(wheelDiameterInput); // This was a duplicate, but keeping it for context
    const wheelThickness = getVal(wheelThicknessInput); // This was a duplicate, but keeping it for context
    const strutLength = getVal(strutLengthInput); // This was a duplicate, but keeping it for context
    const strutThickness = getVal(strutThicknessInput); // This was a duplicate, but keeping it for context
    const gearType = getStr(gearTypeInput); // This was a duplicate, but keeping it for context
    const mainGearPosition = getVal(mainGearPositionInput); // This was a duplicate, but keeping it for context
    const wingPropDistance = getVal(wingPropDistanceInput);
    const wingTailDistance = getVal(wingTailDistanceInput);
    const enginePlacement = getStr(enginePlacementInput);
    const fuselageWidth = getVal(fuselageWidthInput);
    let fuselageHeight = getVal(fuselageHeightInput); // Use let to allow modification

    // --- Fix: Determine current fuselage dimensions for calculations ---
    let currentFuselageWidth, currentFuselageHeight;
    if (fuselageShape === 'rectangular') {
        currentFuselageWidth = fuselageWidth;
        currentFuselageHeight = fuselageHeight;
    } else if (fuselageShape === 'cylindrical') {
        const fuselageDiameter = getVal(fuselageDiameterInput);
        currentFuselageWidth = fuselageDiameter;
        currentFuselageHeight = fuselageDiameter;
    } else if (fuselageShape === 'teardrop') {
        currentFuselageWidth = Math.max(fuselageFrontDiameter, fuselageRearDiameter);
        currentFuselageHeight = Math.max(fuselageFrontDiameter, fuselageRearDiameter);
    } else {
        currentFuselageWidth = 0.15; // Default
        currentFuselageHeight = 0.15; // Default
    }
    // This ensures fuselageHeight is correctly set for pylon calculations below
    if (fuselageShape !== 'rectangular') {
        fuselageHeight = currentFuselageHeight;
    }

    const noseShape = getStr(fuselageNoseShapeInput);
    const tailShape = getStr(fuselageTailShapeInput);


    const hasAileron = getCheck(hasAileronInput);
    const aileronLength = getVal(aileronLengthInput);
    const aileronWidth = getVal(aileronWidthInput);
    const aileronThickness = getVal(aileronThicknessInput);
    const aileronPosition = getVal(aileronPositionInput);
    const aileronAirfoilType = getStr(aileronAirfoilTypeInput);
    const hasElevator = getCheck(hasElevatorInput);
    const elevatorAirfoilType = getStr(elevatorAirfoilTypeInput);
    const elevatorLength = getVal(elevatorLengthInput); // This was a duplicate, but keeping it for context
    const elevatorWidth = getVal(elevatorWidthInput);
    const hasRudder = getCheck(hasRudderInput);
    const rudderLength = getVal(rudderLengthInput); // This was a duplicate, but keeping it for context
    const rudderWidth = getVal(rudderWidthInput);
    const rudderAirfoilType = getStr(rudderAirfoilTypeInput);
    const showCg = getCheck(showCgCheckbox);
    const batteryWeightGrams = getRaw(batteryWeightInput);
    const fuelTankHeight = getVal(fuelTankHeightInput);
    const tankCapacityMl = getRaw(fuelTankCapacityInput);
    const tankMaterial = getStr(fuelTankMaterialInput);
    const fuelType = getStr(fuelTypeInput);
    const fuelLevel = getRaw(fuelLevelInput);
    const receiverWeightGrams = getRaw(receiverWeightInput);
    const cameraWeightGrams = getRaw(cameraWeightInput);
    const otherAccessoriesWeightGrams = getRaw(otherAccessoriesWeightInput);
    const receiverPosition = getVal(receiverPositionInput);
    const cameraPosition = getVal(cameraPositionInput);
    // قراءة قيم Y و Z (لا تؤثر حاليًا على حساب CG الطولي ولكنها ضرورية للنموذج)
    const receiverPositionY = getVal(receiverPositionYInput);
    const receiverPositionZ = getVal(receiverPositionZInput);
    const cameraPositionY = getVal(cameraPositionYInput);
    const cameraPositionZ = getVal(cameraPositionZInput);

    // قراءة بيانات مجموعات السيرفو
    const servoG1WeightGrams = getRaw(servoG1WeightInput) * getRaw(servoG1CountInput);
    const servoG1PositionX = getVal(servoG1PositionXInput);
    const servoG1PositionY = getVal(servoG1PositionYInput);
    const servoG1PositionZ = getVal(servoG1PositionZInput);

    const servoG2WeightGrams = getRaw(servoG2WeightInput) * getRaw(servoG2CountInput);
    const servoG2PositionX = getVal(servoG2PositionXInput);
    const servoG2PositionY = getVal(servoG2PositionYInput);
    const servoG2PositionZ = getVal(servoG2PositionZInput);


    
    // تصحيح: قراءة وزن المحرك من الحقل الصحيح لكل نوع
    let engineWeightGrams = (engineType === 'electric') ? getRaw(electricMotorWeightInput) : getRaw(icEngineWeightInput);
    let engineWeightKg = engineWeightGrams / 1000;
    if (enginePlacement === 'wing') {
        engineWeightKg *= 2; // مضاعفة الوزن لوجود محركين
    }

    const pylonHeightMeters = getVal(enginePylonLengthInput);
    const pylonMaterial = getStr(pylonMaterialInput);
    const engineDiameterMeters = (engineType === 'electric' ? getVal(electricMotorDiameterInput) : getVal(icEngineDiameterInput));
    const wingEngineVerticalPos = getStr(engineWingVerticalPosInput);
    const wingEngineForeAft = getStr(engineWingForeAftInput);
    const engineLengthMeters = (engineType === 'electric' ? getVal(electricMotorLengthInput) : getVal(icEngineLengthInput));

    // --- حسابات محدثة ---
    // --- حساب مساحة الجناح الرئيسي (بدون الأطراف) ---
    // تم تعديل المنطق: مساحة الجناح هي مساحة الجزء الثابت + مساحة الجنيحات
    const tipChord = wingChord * taperRatio; // This is needed for both area and weight

    let aileronArea = 0;
    if (hasAileron) {
        // مساحة الجنيحين (مستطيلين)
        aileronArea = 2 * aileronLength * aileronWidth;
    }
    // مساحة الجناح الرئيسية هي مساحة شبه المنحرف الكلي (بما في ذلك منطقة الجنيحات)
    const mainWingArea = wingSpan * (wingChord + tipChord) / 2;

    const alphaRad = angleOfAttack * (Math.PI / 180);

    // حساب مساحة أطراف الجناح (إذا كانت مفعلة)
    let wingtipsArea = 0;
    if (hasWingtip) {
        // تصحيح: حساب المساحة كشبه منحرف بناءً على نسبة الاستدقاق
        const tipChord_wingtip = wingtipWidth * wingtipTaperRatio;
        const singleWingtipsArea = wingtipLength * (wingtipWidth + tipChord_wingtip) / 2;
        wingtipsArea = 2 * singleWingtipsArea;
    }

    // المساحة الكلية للجناح
    const totalWingArea = mainWingArea + wingtipsArea;

    // --- حساب مساحة الذيل ---
    // تم تعديل المنطق: مساحة الذيل هي مجموع مساحة الأجزاء الثابتة ومساحة أسطح التحكم
    let totalTailArea = 0;
    let hStabArea = 0;
    let vStabArea = 0;

    // قراءة نسبة استدقاق الذيل
    const tailTaperRatio = getRaw(tailTaperRatioInput);

    if (tailType === 'conventional' || tailType === 't-tail') {
        // تصحيح: حساب المساحة كشبه منحرف
        const tipChord_h = tailChord * tailTaperRatio;
        hStabArea = tailSpan * (tailChord + tipChord_h) / 2;

        const tipChord_v = vStabChord * tailTaperRatio;
        vStabArea = vStabHeight * (vStabChord + tipChord_v) / 2;

        totalTailArea = hStabArea + vStabArea;
    } else if (tailType === 'v-tail') {
        // للذيل V، تعتبر المساحة الكلية هي مساحة اللوحين
        hStabArea = 0; // لا يوجد مثبت أفقي منفصل
        // تصحيح: حساب المساحة كشبه منحرف
        const tipChord_v = vStabChord * tailTaperRatio;
        const singleVPanelArea = vStabHeight * (vStabChord + tipChord_v) / 2;
        vStabArea = 2 * singleVPanelArea;
        totalTailArea = vStabArea;
    }

    // إضافة مساحة أسطح التحكم إلى المجموع الكلي (بنفس منطق الجناح)
    // تصحيح: حساب مساحة أسطح التحكم كشبه منحرف أيضاً
    const elevatorArea = hasElevator ? (2 * elevatorLength * elevatorWidth) : 0; // approximation as rectangle for now
    const rudderArea = hasRudder ? (rudderLength * rudderWidth) : 0; // approximation as rectangle for now

    totalTailArea += elevatorArea + rudderArea;

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
    // استخدام sweepRad المعرف مسبقاً
    const cl = airfoilLiftFactor * 2 * Math.PI * alphaRad * Math.cos(sweepRad);
    const lift = 0.5 * cl * airDensity * Math.pow(airSpeed, 2) * totalWingArea;

    // 2. قوة السحب (Drag)
    // D = 0.5 * Cd * rho * V^2 * A
    // Cd = Cdp + Cdi (سحب طفيلي + سحب مستحث)
    const aspectRatio = totalWingArea > 0 ? Math.pow(wingSpan, 2) / totalWingArea : 0;

    // --- تعديل كفاءة أوزوالد بناءً على وجود وشكل أطراف الجناح ---
    // أطراف الجناح تقلل من السحب المستحث عن طريق زيادة نسبة العرض إلى الارتفاع الفعالة.
    let oswaldEfficiency = 0.8; // قيمة أساسية بدون أطراف
    if (hasWingtip) {
        if (wingtipShape === 'blended') {
            oswaldEfficiency = 0.90; // الأطراف المدمجة أكثر كفاءة
        } else { // canted
            oswaldEfficiency = 0.85; // الأطراف المائلة توفر تحسينًا معتدلًا
        }
        // إضافة تأثير سحب إضافي بناءً على شكل مقطع طرف الجناح
        if (wingtipAirfoilType === 'rectangular') {
            cdp += 0.002;
        } else if (wingtipAirfoilType === 'wedge') {
            cdp += 0.001;
        }
        // 'symmetrical' is considered the baseline and adds no extra drag compared to the main wing
    }
    const cdi = (aspectRatio > 0) ? (Math.pow(cl, 2) / (Math.PI * aspectRatio * oswaldEfficiency)) : 0;

    // --- حساب السحب الطفيلي (Parasitic Drag) ---
    let cdp = 0.025; // معامل سحب طفيلي أساسي (لجسم الطائرة والذيل وغيرها)

    // إضافة تأثير سحب الجنيحات بناءً على شكلها
    if (hasAileron) {
        if (aileronAirfoilType === 'flat_plate') {
            cdp += 0.005; // أعلى سحب
        } else if (aileronAirfoilType === 'rectangular') {
            cdp += 0.003; // سحب متوسط
        } else if (aileronAirfoilType === 'wedge') {
            cdp += 0.001; // أقل سحب
        }
    }
    // إضافة تأثير سحب الرافع والدفة
    if (hasElevator) {
        if (elevatorAirfoilType === 'flat_plate') {
            cdp += 0.002; // السحب للرافع أصغر لأنه أصغر من الجنيح
        } else if (elevatorAirfoilType === 'rectangular') {
            cdp += 0.001;
        } else if (elevatorAirfoilType === 'wedge') {
            cdp += 0.0005;
        }
    }
    if (hasRudder) {
        if (rudderAirfoilType === 'flat_plate') cdp += 0.002;
        else if (rudderAirfoilType === 'rectangular') cdp += 0.001;
        else if (rudderAirfoilType === 'wedge') cdp += 0.0005;
    }
    const cd = cdp + cdi;
    const aeroDrag = 0.5 * cd * airDensity * Math.pow(airSpeed, 2) * totalWingArea;

    // 3. قوة الدفع (Thrust) وأداء المروحة
    const propDiameterMeters = propDiameter; // تم تحويله بالفعل
    const propPitchMeters = propPitch * 0.0254; // تحويل خطوة المروحة من بوصة إلى متر
    const n_rps = propRpm / 60; // revolutions per second

    // سرعة خطوة المروحة (السرعة النظرية للهواء)
    const V_pitch = propPitchMeters * n_rps;

    // حساب قوة الدفع باستخدام صيغة تعتمد على نظرية الزخم (Glauert's formula)
    // T = (PI/8) * rho * D^2 * (V_pitch^2 - V_pitch * V_air)
    let thrust = (Math.PI / 8) * airDensity * Math.pow(propDiameterMeters, 2) * (V_pitch * (V_pitch - airSpeed));
    if (thrust < 0) {
        thrust = 0; // لا يمكن أن يكون الدفع سالبًا، يصبح فرملة
    }

    // تقدير الطاقة والعزم المطلوبين للمروحة
    // P = k * rho * n^3 * D^5, where k is a prop constant
    const pitch_diameter_ratio = propDiameterMeters > 0 ? propPitchMeters / propDiameterMeters : 0;
    const prop_constant_k = 0.5 + (pitch_diameter_ratio * 1.5); // صيغة تجريبية لمعامل المروحة k
    const power_consumed_watts = prop_constant_k * airDensity * Math.pow(n_rps, 3) * Math.pow(propDiameterMeters, 5);
    const torque_required_Nm = n_rps > 0 ? power_consumed_watts / (2 * Math.PI * n_rps) : 0;

    // حساب سحب المروحة وإضافته إلى السحب الكلي
    const prop_drag = airSpeed > 1 ? power_consumed_watts / airSpeed : 0; // تجنب القسمة على صفر
    const totalDrag = aeroDrag + prop_drag;
    // 4. حساب الوزن (Weight Calculation)
    const structureMaterialDensity = MATERIAL_DENSITIES[structureMaterial]; // Density in kg/m³
    const fuselageMaterialDensity = MATERIAL_DENSITIES[fuselageMaterialValue];
    const controlSurfaceMaterialDensity = MATERIAL_DENSITIES[controlSurfaceMaterial] || structureMaterialDensity; // Fallback to main material


    // حساب وزن أطراف الجناح (Wingtips)
    let wingtipWeightKg = 0;
    if (hasWingtip) {
        // تم حساب المساحة مسبقًا باستخدام المتغيرات الصحيحة (wingtipsArea)
        const singleWingtipsArea = wingtipsArea / 2;

        // Adjust volume based on airfoil shape
        let volumeFactor = 0.7; // Default for symmetrical
        if (wingtipAirfoilType === 'rectangular') {
            volumeFactor = 1.0;
        } else if (wingtipAirfoilType === 'wedge') {
            volumeFactor = 0.5;
        }

        const singleWingtipVolume = singleWingtipsArea * wingtipThickness * volumeFactor;
        wingtipWeightKg = 2 * singleWingtipVolume * structureMaterialDensity; // لليمين واليسار
    }
    // FIX: Hide the separate wingtip weight display as requested by the user. It's now part of the total wing weight.
    // document.getElementById('wingtip-weight-result').textContent = (wingtipWeightKg * 1000).toFixed(0);

    // --- حساب وزن أسطح التحكم ---
    let aileronWeightKg = 0;
    if (hasAileron) {
        // تم حساب aileronArea في الأعلى
        const aileronVolume = aileronArea * aileronThickness;
        aileronWeightKg = aileronVolume * controlSurfaceMaterialDensity;
    }

    // --- حساب وزن الجناح (بشكل دقيق) ---
    // حساب وزن الجزء الثابت من الجناح (مساحة الجناح الكلية مطروحاً منها مساحة الجنيحات)
    const fixedWingVolume = (mainWingArea - aileronArea) * wingThickness;
    const fixedWingWeightKg = fixedWingVolume * structureMaterialDensity;
    const wingWeightKg = fixedWingWeightKg + aileronWeightKg + wingtipWeightKg; // الوزن الإجمالي للجناح هو مجموع الجزء الثابت والجنيحات والأطراف

    // --- Elevator and Rudder Area/Weight Calculation ---
    let elevatorWeightKg = 0;
    if (hasElevator && (tailType === 'conventional' || tailType === 't-tail') && elevatorArea > 0) {
        const singleElevatorVolume = elevatorLength * elevatorWidth * controlSurfaceThickness;
        elevatorWeightKg = 2 * singleElevatorVolume * controlSurfaceMaterialDensity;
    }

    let rudderWeightKg = 0;
    if (hasRudder && (tailType === 'conventional' || tailType === 't-tail') && rudderArea > 0) {
        const rudderVolume = rudderArea * controlSurfaceThickness;
        rudderWeightKg = rudderVolume * controlSurfaceMaterialDensity;
    }
    // ملاحظة: أسطح التحكم للذيل V تعتبر جزءًا من وزن الذيل الرئيسي حاليًا لتبسيط الحسابات.

    // --- حساب وزن الذيل (بشكل دقيق) ---
    let fixedTailWeightKg = 0;
    if (tailType === 'conventional' || tailType === 't-tail') {
        // حساب وزن الأجزاء الثابتة بناءً على مساحتها (التي هي الآن شبه منحرف)
        const fixedTailVolume = (hStabArea + vStabArea) * tailThickness;
        fixedTailWeightKg = fixedTailVolume * structureMaterialDensity;
    } else if (tailType === 'v-tail') {
        // للذيل V، يتم حساب الوزن الكلي بناءً على المساحة الكلية والسماكة الرئيسية للتبسيط
        // (يفترض أن أسطح التحكم مدمجة)
        const vTailVolume = vStabArea * tailThickness; // استخدام مساحة الألواح (التي هي الآن شبه منحرف)
        fixedTailWeightKg = vTailVolume * structureMaterialDensity;
    }

    // الوزن الإجمالي للذيل هو مجموع الأجزاء الثابتة والمتحركة (الرافع والدفة)
    const tailWeightKg = fixedTailWeightKg + elevatorWeightKg + rudderWeightKg;

    // حساب وزن الجسم
    let fuselageWeightKg = 0;
    let fuselageVolume = 0;
    let fuselageSurfaceArea = 0;

    if (fuselageShape === 'rectangular') {
        const frontWidth = fuselageWidth;
        const frontHeight = fuselageHeight;
        const rearWidth = frontWidth * fuselageTaperRatio;
        const rearHeight = frontHeight * fuselageTaperRatio;

        const frontArea = frontWidth * frontHeight;
        const rearArea = rearWidth * rearHeight;

        // Volume of a rectangular frustum
        fuselageVolume = (1 / 3) * fuselageLength * (frontArea + rearArea + Math.sqrt(frontArea * rearArea));

        // Area of the 4 side faces (approximated as simple trapezoids)
        const topBottomArea = fuselageLength * (frontWidth + rearWidth); // 2 * length * (w1+w2)/2
        const leftRightArea = fuselageLength * (frontHeight + rearHeight); // 2 * length * (h1+h2)/2
        fuselageSurfaceArea = frontArea + rearArea + topBottomArea + leftRightArea;

    } else { // Cylindrical or Teardrop with potential rounded/ogival ends
        let bodyLength = fuselageLength;
        let radiusFront, radiusRear;

        if (fuselageShape === 'cylindrical') {
            radiusFront = fuselageDiameter / 2;
            radiusRear = radiusFront * fuselageTaperRatio;
        } else { // teardrop
            radiusFront = fuselageFrontDiameter / 2;
            radiusRear = fuselageRearDiameter / 2;
        }

        // --- Nose Cone Calculation ---
        if (noseShape !== 'flat' && radiusFront > 0) {
            const noseLength = (noseShape === 'ogival') ? radiusFront * 2.0 : radiusFront;
            bodyLength -= noseLength;

            if (noseShape === 'rounded') { // Hemisphere
                fuselageVolume += (2 / 3) * Math.PI * Math.pow(radiusFront, 3);
                fuselageSurfaceArea += 2 * Math.PI * Math.pow(radiusFront, 2); // Curved surface
            } else { // Ogival (approximated as a cone)
                fuselageVolume += (1 / 3) * Math.PI * Math.pow(radiusFront, 2) * noseLength;
                const slantHeight = Math.sqrt(Math.pow(noseLength, 2) + Math.pow(radiusFront, 2));
                fuselageSurfaceArea += Math.PI * radiusFront * slantHeight; // Lateral surface
            }
        } else {
            // Add area of the flat front face
            fuselageSurfaceArea += Math.PI * Math.pow(radiusFront, 2);
        }

        // --- Tail Cone Calculation ---
        if (tailShape !== 'flat' && radiusRear > 0) {
            const tailLength = radiusRear; // For rounded tail
            bodyLength -= tailLength;

            // Currently only 'rounded' is an option for tail
            fuselageVolume += (2 / 3) * Math.PI * Math.pow(radiusRear, 3);
            fuselageSurfaceArea += 2 * Math.PI * Math.pow(radiusRear, 2); // Curved surface
        } else {
            // Add area of the flat rear face
            fuselageSurfaceArea += Math.PI * Math.pow(radiusRear, 2);
        }

        // --- Main Body Calculation ---
        if (bodyLength > 0) {
            // Volume of a conical frustum
            fuselageVolume += (1 / 3) * Math.PI * bodyLength * (Math.pow(radiusFront, 2) + (radiusFront * radiusRear) + Math.pow(radiusRear, 2));
            // Lateral surface area of a conical frustum
            const slantHeight = Math.sqrt(Math.pow(bodyLength, 2) + Math.pow(radiusFront - radiusRear, 2));
            fuselageSurfaceArea += Math.PI * (radiusFront + radiusRear) * slantHeight;
        }
    }
    fuselageWeightKg = fuselageVolume * fuselageMaterialDensity;

    // حساب وزن ومساحة القمرة
    let cockpitWeightKg = 0;
    let cockpitSurfaceArea = 0;
    if (hasCockpit) {
        const cockpitMaterialDensity = MATERIAL_DENSITIES[cockpitMaterial];

        // Volume of a half-ellipsoid: (2/3) * PI * a * b * c
        const cockpitVolume = (2 / 3) * Math.PI * (cockpitLength / 2) * cockpitHeight * (cockpitWidth / 2);
        cockpitWeightKg = cockpitVolume * cockpitMaterialDensity;

        // Approximate surface area of the cockpit (half-ellipsoid) using Knud Thomsen formula
        const a = cockpitLength / 2;
        const b = cockpitHeight;
        const c = cockpitWidth / 2;
        if (a > 0 && b > 0 && c > 0) {
            const p = 1.6075;
            // Area of the full ellipsoid
            const fullEllipsoidArea = 4 * Math.PI * Math.pow( (Math.pow(a*b, p) + Math.pow(a*c, p) + Math.pow(b*c, p)) / 3, 1/p);
            // Area of the base ellipse
            const baseArea = Math.PI * a * c;
            // Total area is half the ellipsoid's surface + the base
            cockpitSurfaceArea = (fullEllipsoidArea / 2) + baseArea;
        }
    }

    // حساب وزن المروحة
    const bladeRadius = (propDiameter / 2) - (spinnerDiameter / 2);
    const avgBladeChord = propChord * 0.75; // تقدير متوسط عرض الشفرة
    const singleBladeVolume = bladeRadius > 0 ? bladeRadius * avgBladeChord * propThickness : 0; // حجم شفرة واحدة
    const spinnerVolume = (4 / 3) * Math.PI * Math.pow(spinnerDiameter / 2, 3);
    const propVolume = (singleBladeVolume * propBlades) + spinnerVolume;
    const propMaterialDensity = MATERIAL_DENSITIES[propMaterial];
    const propWeightKg = propVolume * propMaterialDensity;

    let landingGearWeightKg = 0;
    let singleWheelWeightKg = 0;
    let singleStrutWeightKg = 0;
    if (hasLandingGear) {
        const gearMaterialDensity = MATERIAL_DENSITIES['plastic']; // Assuming plastic/nylon for gear

        const mainWheelVolume = Math.PI * Math.pow(wheelDiameter / 2, 2) * wheelThickness;
        const strutVolume = Math.PI * Math.pow(strutThickness / 2, 2) * strutLength;

        let totalGearVolume = 0;
        if (gearType === 'tricycle' || gearType === 'taildragger' || gearType === 'main-only') {
            totalGearVolume += 2 * (mainWheelVolume + strutVolume); // Two main gears
        }
        if (gearType === 'tricycle') {
            totalGearVolume += mainWheelVolume + strutVolume; // Add nose gear
        } else if (gearType === 'taildragger') {
            const tailWheelVolume = Math.PI * Math.pow(wheelDiameter / 3 / 2, 2) * (wheelThickness * 0.8);
            totalGearVolume += tailWheelVolume; // Add tail wheel (no strut for simplicity)
        }
        landingGearWeightKg = totalGearVolume * gearMaterialDensity;
        singleWheelWeightKg = mainWheelVolume * gearMaterialDensity;
        singleStrutWeightKg = strutVolume * gearMaterialDensity;
    }

    let energySourceWeightKg = 0;
    if (engineType === 'electric') {
        // إظهار/إخفاء الحقول المناسبة
        document.getElementById('energy-source-weight-item').style.display = 'flex'; // إظهار وزن البطارية
        document.getElementById('fuel-tank-area-item').style.display = 'none'; // إخفاء مساحة الخزان

        energySourceWeightKg = batteryWeightGrams / 1000; // This is correct
    } else { // ic - محرك ميكانيكي
        // إظهار/إخفاء الحقول المناسبة
        document.getElementById('energy-source-weight-item').style.display = 'flex'; // إظهار وزن الخزان
        document.getElementById('fuel-tank-area-item').style.display = 'flex'; // إظهار مساحة الخزان
        
        // حساب وزن مصدر الطاقة (الوقود + الخزان) بشكل دقيق
        const fuelTankLength = getVal(fuelTankLengthInput);
        const fuelTankWidth = getVal(fuelTankWidthInput);
        const tankMaterialDensity = MATERIAL_DENSITIES[tankMaterial];
        const fuelDensity = FUEL_DENSITIES[fuelType] || FUEL_DENSITIES['methanol_nitro'];

        // 1. حساب وزن الوقود الفعلي بناءً على السعة والمستوى
        const currentFuelVolumeMl = tankCapacityMl * fuelLevel;
        const currentFuelVolumeM3 = currentFuelVolumeMl / 1e6; // تحويل من مل (سم^3) إلى م^3
        const fuelWeightKg = currentFuelVolumeM3 * fuelDensity;

        // 2. حساب وزن هيكل الخزان نفسه بناءً على أبعاده ومادته
        const surfaceArea = 2 * ((fuelTankLength * fuelTankWidth) + (fuelTankLength * fuelTankHeight) + (fuelTankWidth * fuelTankHeight));
        const wallThickness = 0.002; // افتراض سمك جدار 2 مم
        const shellVolume = surfaceArea * wallThickness;
        const shellWeightKg = shellVolume * tankMaterialDensity;

        // 3. الوزن الإجمالي لمصدر الطاقة هو مجموع وزن الوقود ووزن الخزان
        energySourceWeightKg = fuelWeightKg + shellWeightKg;

        // تحديث حقل مساحة السطح
        document.getElementById('fuel-tank-area-result').textContent = (surfaceArea * 10000).toFixed(0); // تحويل من م² إلى سم²
    }

    // حساب وزن الملحقات الإضافية
    const totalAccessoriesWeightGrams = receiverWeightGrams + servoG1WeightGrams + servoG2WeightGrams + cameraWeightGrams + otherAccessoriesWeightGrams;
    const totalAccessoriesWeightKg = totalAccessoriesWeightGrams / 1000;

    // حساب وزن الحامل (Pylon) قبل حساب الوزن الإجمالي
    let pylonWeightKg = 0;
    if (enginePlacement === 'wing' && pylonHeightMeters > 0.001) {
        const pylonForeAftLength = engineDiameterMeters * 0.6;
        if (pylonForeAftLength > 0) {
            const pylonWidth = engineDiameterMeters * 0.4;
            const pylonVolume = pylonForeAftLength * pylonHeightMeters * pylonWidth;
            const pylonMaterialDensity = MATERIAL_DENSITIES[pylonMaterial] || MATERIAL_DENSITIES['plastic'];
            pylonWeightKg = pylonVolume * pylonMaterialDensity * 2; // For both pylons
        }
    }

    const totalWeightKg = wingWeightKg + tailWeightKg + fuselageWeightKg + propWeightKg + landingGearWeightKg + engineWeightKg + energySourceWeightKg + cockpitWeightKg + totalAccessoriesWeightKg + pylonWeightKg;

    // 5. نسبة الدفع إلى الوزن (Thrust-to-Weight Ratio)
    const weightInNewtons = totalWeightKg * 9.81;
    const twr = weightInNewtons > 0 ? (thrust / weightInNewtons) : 0;

    // --- حساب سرعة الانهيار (Stall Speed) ---
    // V_s = sqrt( (2 * W) / (Cl_max * rho * A) )
    // تقدير معامل الرفع الأقصى (Cl_max) بناءً على شكل المقطع
    let cl_max = 1.2; // قيمة افتراضية (شبه متماثل)
    if (airfoilType === 'flat-bottom') {
        cl_max = 1.5; // أعلى معامل رفع، جيد للتدريب
    } else if (airfoilType === 'semi-symmetrical') {
        cl_max = 1.3;
    } else if (airfoilType === 'symmetrical') {
        cl_max = 1.1; // أقل معامل رفع، جيد للاستعراض
    } else if (airfoilType === 'rectangular') {
        cl_max = 1.0; // بسيط وأقل كفاءة
    }

    let stallSpeed = 0;
    if (totalWingArea > 0 && airDensity > 0 && cl_max > 0 && weightInNewtons > 0) {
        stallSpeed = Math.sqrt((2 * weightInNewtons) / (cl_max * airDensity * totalWingArea));
    }
    // --- حساب مركز الجاذبية (CG) والمركز الهوائي (AC) ---
    let totalMoment = 0;
    const conversionFactorToDisplay = 1 / conversionFactor; // للتحويل من متر إلى الوحدة المعروضة
    // Re-add Y and Z moments for 3D CG calculation
    let totalMomentY = 0;
    let totalMomentZ = 0;

    // 1. حساب الوتر الديناميكي الهوائي المتوسط (MAC) وموقعه
    const mac = (2 / 3) * wingChord * ((1 + taperRatio + Math.pow(taperRatio, 2)) / (1 + taperRatio));
    const mac_y = (wingSpan / 6) * ((1 + 2 * taperRatio) / (1 + taperRatio));
    // استخدام sweepRad المعرف مسبقاً
    const mac_x_le = mac_y * Math.tan(sweepRad); // موضع الحافة الأمامية للـ MAC

    // موضع الجناح على المحور X (من updatePlaneModel)
    const wingPositionX = (fuselageLength / 2) - wingPropDistance;
    const tailPositionX = wingPositionX - wingTailDistance;

    // دالة مساعدة لحساب العزم
    const addMoment = (weightKg, positionX, positionY = 0, positionZ = 0) => {
        if (weightKg > 0) {
            totalMoment += weightKg * positionX; // حساب العزم حول نقطة الأصل (0,0,0)
            totalMomentY += weightKg * positionY;
            totalMomentZ += weightKg * positionZ;
        }
    };

    // 3. حساب العزم لكل مكون (الوزن * الذراع)
    // إضافة عزم كل مكون
    // --- تحسين دقة مركز ثقل الجسم (Fuselage CG) ---
    let fuselageCgX = 0;
    if (fuselageShape === 'rectangular' || fuselageShape === 'cylindrical') {
        // استخدام صيغة مركز الثقل للمخروط الناقص (Frustum)
        const L = fuselageLength;
        let r_front, r_rear;

        if (fuselageShape === 'rectangular') {
            // استخدام "نصف القطر الفعال" للمساحات المربعة
            r_front = Math.sqrt(fuselageWidth * fuselageHeight);
            r_rear = r_front * fuselageTaperRatio;
        } else { // cylindrical
            const fuselageDiameter = getVal(fuselageDiameterInput);
            r_front = fuselageDiameter / 2;
            r_rear = r_front * fuselageTaperRatio;
        }

        if (Math.abs(r_front - r_rear) < 1e-6) { // Case of a perfect cylinder/box
            fuselageCgX = 0; // Center is at the geometric middle
        } else {
            // Centroid of a frustum from the large base (front)
            const x_from_front = (L / 4) * (Math.pow(r_front, 2) + 2 * r_front * r_rear + 3 * Math.pow(r_rear, 2)) / (Math.pow(r_front, 2) + r_front * r_rear + Math.pow(r_rear, 2));
            // Convert to model coordinates (origin at center, front at +L/2)
            fuselageCgX = (L / 2) - x_from_front;
        }
    } else if (fuselageShape === 'teardrop') {
        // For teardrop, the CG is shifted towards the wider front part.
        // A simple approximation is to shift it forward by a fraction of the length.
        fuselageCgX = fuselageLength * 0.1; // 10% forward shift
    }
    // ملاحظة: هذا الحساب لا يأخذ في الاعتبار الأغطية الطرفية (nose/tail cones) بعد.
    // سيتم تحسينه في المستقبل لفصل وزن الجسم الرئيسي عن الأغطية.
    addMoment(fuselageWeightKg, fuselageCgX, 0, 0);

    // --- تحسين دقة مركز ثقل الجناح والذيل (فصل الأجزاء الثابتة والمتحركة) ---
    // عزم الجزء الثابت من الجناح
    // The geometric centroid of a uniform wing is closer to 42% of the MAC.
    // This is a better approximation for the center of *mass* than the aerodynamic center (25%).
    // --- حساب الموضع النسبي لمركز ثقل نصف الجناح (قبل دوران الميلان) ---
    const wingCgSpanwise = (wingSpan / 6) * ((1 + 2 * taperRatio) / (1 + taperRatio)); // الموضع العرضي لمركز ثقل نصف الجناح
    const halfWingCgX_offset = wingCgSpanwise * Math.tan(sweepRad);
    const wingCgY_offset_dihedral = wingCgSpanwise * Math.tan(dihedralAngle * Math.PI / 180);
    const wingCgX_offset_sweep = halfWingCgX_offset + (0.42 * mac);

    // --- تطبيق دوران زاوية الميلان (Incidence) على موضع مركز الثقل ---
    const wingIncidenceRad = wingIncidenceAngle * (Math.PI / 180);
    const cosIncidence = Math.cos(wingIncidenceRad);
    const sinIncidence = Math.sin(wingIncidenceRad);

    // حساب الموضع النسبي بعد الدوران
    const rotatedCgX_offset = wingCgX_offset_sweep * cosIncidence - wingCgY_offset_dihedral * sinIncidence;
    const rotatedCgY_offset = wingCgX_offset_sweep * sinIncidence + wingCgY_offset_dihedral * cosIncidence;

    // حساب الموضع Y العام للجناح
    let wingYPosition;
    if (wingPosition === 'high') wingYPosition = currentFuselageHeight / 2;
    else if (wingPosition === 'mid') wingYPosition = 0;
    else if (wingPosition === 'low') wingYPosition = -currentFuselageHeight / 2;

    // حساب الموضع النهائي لمركز ثقل كل نصف جناح وإضافة عزمه
    const finalCgX = wingPositionX + rotatedCgX_offset;
    const finalCgY = wingYPosition + rotatedCgY_offset;

    addMoment(fixedWingWeightKg / 2, finalCgX, finalCgY, wingCgSpanwise); // Right half
    addMoment(fixedWingWeightKg / 2, finalCgX, finalCgY, -wingCgSpanwise); // Left half

    if (hasAileron && aileronWeightKg > 0) {
        // حساب أكثر دقة لمركز الجاذبية للجنيح مع الأخذ في الاعتبار الميلان والاستدقاق
        const halfSpan = wingSpan / 2;
        const aileronZStart = halfSpan - aileronPosition - aileronLength;
        const aileronZEnd = halfSpan - aileronPosition;

        // حساب موضع الحافة الأمامية للجنيح عند بدايته ونهايته
        const chordAtStart = wingChord + (wingChord * taperRatio - wingChord) * (aileronZStart / halfSpan);
        const sweepAtStart = aileronZStart * Math.tan(sweepRad);
        const hingeX_start = (wingPositionX + sweepAtStart - (chordAtStart / 2)) + aileronWidth;

        const chordAtEnd = wingChord + (wingChord * taperRatio - wingChord) * (aileronZEnd / halfSpan);
        const sweepAtEnd = aileronZEnd * Math.tan(sweepRad);
        const hingeX_end = (wingPositionX + sweepAtEnd - (chordAtEnd / 2)) + aileronWidth;

        // مركز الجاذبية للجنيح يقع في منتصف المسافة بين بداية ونهاية الحافة الأمامية، ومزاح للخلف بمقدار نصف عرضه
        const aileronCgX = ((hingeX_start + hingeX_end) / 2) - (aileronWidth / 2);
        // --- حساب المسافة الجانبية من مركز الجسم للجنيح ---
        const aileronCenterZ = (aileronZStart + aileronZEnd) / 2;
        
        // The Y position of the aileron is the same as the wing's
        const aileronCgY = finalCgY; // FIX: Use the correct variable name for the wing's final Y position

        // إضافة العزم لكل جنيح على حدة
        addMoment(aileronWeightKg / 2, aileronCgX, aileronCgY, aileronCenterZ); // Right aileron
        addMoment(aileronWeightKg / 2, aileronCgX, aileronCgY, -aileronCenterZ); // Left aileron
    }

    // --- FIX: Calculate tail assembly CG and apply incidence rotation ---
    const tailIncidenceRad = getRaw(tailIncidenceAngleInput) * (Math.PI / 180);
    const tailAssemblyWeightKg = tailWeightKg; // الوزن الإجمالي للذيل (ثابت + متحرك)
    let tailAssemblyLocalMomentX = 0;
    let tailAssemblyLocalMomentY = 0;

    // عزم الجزء الثابت من الذيل (نسبة إلى نقطة ارتكاز الذيل)
    let baseTailY = 0;
    if (tailType === 't-tail') {
        baseTailY = vStabHeight + currentFuselageHeight / 2;
    }
    const tailCgSpanwise = (tailSpan / 6) * ((1 + 2 * tailTaperRatio) / (1 + tailTaperRatio));
    const tailCgY_dihedral = tailCgSpanwise * Math.tan(tailDihedralAngle * Math.PI / 180);
    const tailCgY = baseTailY + tailCgY_dihedral;
    const tailCgX_local = -(tailChord * 0.42);
    tailAssemblyLocalMomentX += fixedTailWeightKg * tailCgX_local;
    tailAssemblyLocalMomentY += fixedTailWeightKg * tailCgY;

    // عزم الرافع (نسبة إلى نقطة ارتكاز الذيل)
    if (hasElevator && elevatorWeightKg > 0) {
        const hStabRootChordEffective = tailChord - elevatorWidth;
        const elevatorCgX_local = -hStabRootChordEffective - (elevatorWidth / 2);
        tailAssemblyLocalMomentX += elevatorWeightKg * elevatorCgX_local;
        tailAssemblyLocalMomentY += elevatorWeightKg * tailCgY; // يفترض نفس ارتفاع الجزء الثابت
    }

    // عزم الدفة (نسبة إلى نقطة ارتكاز الذيل)
    if (hasRudder && rudderWeightKg > 0) {
        const vStabRootChordEffective = vStabChord - rudderWidth;
        const rudderCgX_local = -vStabRootChordEffective - (rudderWidth / 2);
        const rudderCgY = (currentFuselageHeight / 2) + (vStabHeight / 2);
        tailAssemblyLocalMomentX += rudderWeightKg * rudderCgX_local;
        tailAssemblyLocalMomentY += rudderWeightKg * rudderCgY;
    }

    if (tailAssemblyWeightKg > 0) {
        // 1. حساب مركز الثقل المحلي لمجموعة الذيل (قبل الدوران)
        const localCgX = tailAssemblyLocalMomentX / tailAssemblyWeightKg;
        const localCgY = tailAssemblyLocalMomentY / tailAssemblyWeightKg;

        // 2. تطبيق دوران زاوية الميلان (Incidence) على مركز الثقل المحلي
        // الدوران حول المحور Z في النموذج ثلاثي الأبعاد
        const cosInc = Math.cos(tailIncidenceRad);
        const sinInc = Math.sin(tailIncidenceRad);
        const rotatedLocalCgX = localCgX * cosInc - localCgY * sinInc;
        const rotatedLocalCgY = localCgX * sinInc + localCgY * cosInc;

        // 3. حساب الموضع العالمي النهائي وإضافة العزم
        const finalTailCgX = tailPositionX + rotatedLocalCgX;
        const finalTailCgY = rotatedLocalCgY;
        addMoment(tailAssemblyWeightKg, finalTailCgX, finalTailCgY, 0);
    }
    // --- نهاية تعديل حساب عزم الذيل ---

    // عزم أطراف الجناح (يُضاف فقط إذا كانت مُفعّلة)
    if (hasWingtip && wingtipWeightKg > 0) {
        // --- FIX: Correctly calculate moment for BOTH wingtips ---
        const singleWingtripWeight = wingtipWeightKg / 2;
        const wingtipLength = getVal(wingtipLengthInput);
        const wingtipWidth = getVal(wingtipWidthInput);
        const wingtipTaperRatio = getRaw(wingtipTaperRatioInput);
        const wingtipSweepRad = getRaw(wingtipSweepAngleInput) * Math.PI / 180;
        const wingtipCantRad = getRaw(wingtipAngleInput) * Math.PI / 180;
        const wingtipTwistRad = getRaw(wingtipTwistAngleInput) * Math.PI / 180;

        // --- Universal Logic for Wingtip CG Calculation ---

        // 1. Calculate the wingtip's LOCAL CG (relative to its own root)
        let local_cg_x_unrotated, local_cg_z_unrotated;

        if (wingtipAirfoilType === 'rectangular' || wingtipAirfoilType === 'wedge') {
            // Geometric centroid of a trapezoid (which is what a tapered winglet is)
            const a = wingtipWidth; // root chord
            const b = wingtipWidth * wingtipTaperRatio; // tip chord
            const h = wingtipLength; // span (height of trapezoid)
            
            // Centroid along the span (local Z)
            local_cg_z_unrotated = (h / 3) * ((a + 2 * b) / (a + b));
            
            // Centroid along the chord (local X), considering sweep
            const x_offset_due_to_sweep = local_cg_z_unrotated * Math.tan(wingtipSweepRad);
            const chord_at_centroid = a + (b - a) * (local_cg_z_unrotated / h);
            local_cg_x_unrotated = x_offset_due_to_sweep - (chord_at_centroid / 2) + (a / 2); // Relative to root chord center

        } else {
            // Aerodynamic center based calculation for airfoil shapes
            const wt_mac = (2 / 3) * wingtipWidth * ((1 + wingtipTaperRatio + Math.pow(wingtipTaperRatio, 2)) / (1 + wingtipTaperRatio));
            local_cg_z_unrotated = (wingtipLength / 6) * ((1 + 2 * wingtipTaperRatio) / (1 + wingtipTaperRatio));
            const wt_mac_le_x = local_cg_z_unrotated * Math.tan(wingtipSweepRad);
            local_cg_x_unrotated = wt_mac_le_x + (0.42 * wt_mac); // Local X CG relative to wingtip's own root LE
        }

        // 2. Apply wingtip's own rotations (Cant & Twist) to its local CG to get rotated local coordinates
        const cosCant = Math.cos(wingtipCantRad);
        const sinCant = Math.sin(wingtipCantRad);
        const cosTwist = Math.cos(wingtipTwistRad);
        const sinTwist = Math.sin(wingtipTwistRad);

        // Apply Twist (rotation around Y-axis) first
        const twisted_x = local_cg_x_unrotated * cosTwist - local_cg_z_unrotated * sinTwist;
        const twisted_z = local_cg_x_unrotated * sinTwist + local_cg_z_unrotated * cosTwist;

        // Apply Cant (rotation around X-axis) to the twisted coordinates
        const local_cg_x_rotated = twisted_x;
        const local_cg_y_rotated = -twisted_z * sinCant; // Y is affected by cant
        const local_cg_z_rotated = twisted_z * cosCant;

        // 3. Find the global mounting point on the main wing, considering sweep and dihedral
        const mainWingTipLE_X_global = wingPositionX + (wingSpan / 2) * Math.tan(sweepRad);
        const mainWingTipMountY_dihedral = (wingSpan / 2) * Math.tan(dihedralAngle * Math.PI / 180);
        const mainWingTipMountZ = wingSpan / 2;

        // 4. Calculate the final global CG position for the wingtip
        const final_cg_x = mainWingTipLE_X_global + local_cg_x_rotated;
        const final_cg_y = wingYPosition + mainWingTipMountY_dihedral + local_cg_y_rotated;
        const final_cg_z = mainWingTipMountZ + local_cg_z_rotated;

        // Add moment for both wingtips (right and left)
        addMoment(singleWingtripWeight, final_cg_x, final_cg_y, final_cg_z); // Right
        addMoment(singleWingtripWeight, final_cg_x, final_cg_y, -final_cg_z); // Left
    }

    // عزم القمرة
    if (hasCockpit) {
        const cockpitCenterX = (fuselageLength / 2) - cockpitPosition - (cockpitLength / 2);
        const cockpitCenterY = currentFuselageHeight / 2 + cockpitHeight / 2;
        addMoment(cockpitWeightKg, cockpitCenterX, cockpitCenterY, 0);
    }

    // --- عزم الملحقات (بطريقة دقيقة) ---
    const fuselageDatum = fuselageLength / 2; // مقدمة الجسم هي نقطة الصفر للمستخدم

    if (receiverWeightGrams > 0) {
        const receiverX = fuselageDatum - receiverPosition;
        addMoment(receiverWeightGrams / 1000, receiverX, receiverPositionY, receiverPositionZ);
    }
    if (servoG1WeightGrams > 0) {
        const servoG1X = fuselageDatum - servoG1PositionX;
        addMoment(servoG1WeightGrams / 1000, servoG1X, servoG1PositionY, servoG1PositionZ);
    }
    if (servoG2WeightGrams > 0) {
        const servoG2X = fuselageDatum - servoG2PositionX;
        addMoment(servoG2WeightGrams / 1000, servoG2X, servoG2PositionY, servoG2PositionZ);
    }

    if (cameraWeightGrams > 0) {
        const cameraX = fuselageDatum - cameraPosition;
        addMoment(cameraWeightGrams / 1000, cameraX, cameraPositionY, cameraPositionZ);
    }
    if (otherAccessoriesWeightGrams > 0) {
        // بما أن الغراء والمواد الأخرى موزعة، نفترض أن مركز كتلتها
        // يقع في المركز الهندسي لجسم الطائرة (x=0 في إحداثيات النموذج).
        addMoment(otherAccessoriesWeightGrams / 1000, 0, 0, 0);
    }

    if (engineType === 'electric') {
        const batteryPositionFromNose = getVal(batteryPositionInput);
        const batteryPositionX = (fuselageLength / 2) - batteryPositionFromNose;
        // نفترض أن البطارية في المنتصف عمودياً وجانبياً، يمكن إضافة حقول إدخال لموضعها Y و Z في المستقبل
        addMoment(batteryWeightGrams / 1000, batteryPositionX, 0, 0);
    } else { // ic
        const tankPositionFromNose = getVal(fuelTankPositionInput);
        const tankPositionX = (fuselageLength / 2) - tankPositionFromNose;
        // نفترض أن الخزان في المنتصف عمودياً وجانبياً
        addMoment(energySourceWeightKg, tankPositionX, 0, 0);
    }

    // عزم المحرك والمروحة بناءً على الموضع
    if (enginePlacement === 'front' || enginePlacement === 'rear') {
        // استخدام الموضع الدقيق من النموذج ثلاثي الأبعاد
        const enginePos = engineGroup.position;
        const propPos = propellerGroup.position;
        addMoment(engineWeightKg, enginePos.x, enginePos.y, enginePos.z);
        addMoment(propWeightKg, propPos.x, propPos.y, propPos.z);

    } else if (enginePlacement === 'wing') {
        // الوزن الإجمالي للمحركين والمروحتين
        const totalWingPropulsionWeight = engineWeightKg + (propWeightKg * 2); // engineWeightKg is already doubled

        // حساب موضع المحرك على الجناح من المدخلات بدلاً من النموذج ثلاثي الأبعاد
        const wingEngineDist = getVal(engineWingDistanceInput);
        const posOnWingZ_abs = wingEngineDist + (currentFuselageWidth / 2);

        // Get the local Y position of the engine relative to the wing's center
        const pylonHeightMeters = getVal(enginePylonLengthInput);
        const engineDiameterMeters = (engineType === 'electric' ? getVal(electricMotorDiameterInput) : getVal(icEngineDiameterInput));
        const wingEngineVerticalPos = getStr(engineWingVerticalPosInput);
        const engineY_local = (wingEngineVerticalPos === 'above') ? (wingThickness / 2) + pylonHeightMeters + (engineDiameterMeters / 2) : -(wingThickness / 2) - pylonHeightMeters - (engineDiameterMeters / 2);
        const wingEngineY_global = wingGroup.position.y + engineY_local; // Add wing's global Y position

        const spanProgress = wingEngineDist / (wingSpan / 2);
        const chordAtPylon = wingChord * (1 - spanProgress * (1 - taperRatio));
        const sweepAtPylon = wingEngineDist * Math.tan(sweepRad);
        const leadingEdgeX_at_pylon = wingPositionX + sweepAtPylon;

        // تصحيح: استخدام طول الحامل الأفقي بدلاً من ارتفاعه العمودي لحساب الموضع
        const pylonForeAftLength = engineDiameterMeters * 0.6;
        const wingEngineX = (wingEngineForeAft === 'leading') ? (leadingEdgeX_at_pylon + pylonForeAftLength + (engineLengthMeters / 2)) : ((leadingEdgeX_at_pylon - chordAtPylon) - pylonForeAftLength - (engineLengthMeters / 2));
        // Add moments for both engines/props
        addMoment((engineWeightKg / 2) + propWeightKg, wingEngineX, wingEngineY_global, posOnWingZ_abs);
        addMoment((engineWeightKg / 2) + propWeightKg, wingEngineX, wingEngineY_global, -posOnWingZ_abs);

        // --- حساب وزن وعزم حوامل المحركات (Pylons) ---
        // تم حساب الوزن مسبقًا، هنا نحسب العزم فقط
        if (pylonWeightKg > 0) {
            const pylonForeAftLength = engineDiameterMeters * 0.6;
            const pylonX = (wingEngineForeAft === 'leading') ? (leadingEdgeX_at_pylon + pylonForeAftLength / 2) : ((leadingEdgeX_at_pylon - chordAtPylon) - pylonForeAftLength / 2);
            const pylonY_local = (wingEngineVerticalPos === 'above') ? (wingThickness / 2) + (pylonHeightMeters / 2) : -(wingThickness / 2) - (pylonHeightMeters / 2);
            const pylonY_global = wingGroup.position.y + pylonY_local;
            addMoment(pylonWeightKg / 2, pylonX, pylonY_global, posOnWingZ_abs);
            addMoment(pylonWeightKg / 2, pylonX, pylonY_global, -posOnWingZ_abs);
        }
    }

    // --- عزم عجلات الهبوط (حساب دقيق) ---
    if (hasLandingGear && landingGearWeightKg > 0) {
        const mainGearAssemblyWeight = singleWheelWeightKg + singleStrutWeightKg;
        const mainGearX = (fuselageLength / 2) - mainGearPosition;
        const mainGearY = -currentFuselageHeight / 2 - strutLength / 2;
        const mainGearWidth = getVal(mainGearWidthInput);
        const mainGearZ_offset = mainGearWidth / 2;

        // إضافة عزم العجلات الرئيسية
        addMoment(mainGearAssemblyWeight, mainGearX, mainGearY, mainGearZ_offset);  // اليمنى
        addMoment(mainGearAssemblyWeight, mainGearX, mainGearY, -mainGearZ_offset); // اليسرى

        if (gearType === 'tricycle') {
            const noseGearX = fuselageLength / 2 - (wheelDiameter);
            // نفترض أن وزن عجلة الأنف بنفس وزن العجلة الرئيسية
            addMoment(mainGearAssemblyWeight, noseGearX, mainGearY, 0);
        } else if (gearType === 'taildragger') {
            // حساب وزن عجلة الذيل المتبقي
            const tailWheelWeight = landingGearWeightKg - (2 * mainGearAssemblyWeight);
            if (tailWheelWeight > 0) {
                const tailWheelY = -currentFuselageHeight / 2;
                // يتم وضع عجلة الذيل عند موضع الذيل العام
                addMoment(tailWheelWeight, tailPositionX, tailWheelY, 0);
            }
        }
    }

    // 4. حساب الموضع النهائي لمركز الجاذبية
    const cg_x = totalWeightKg > 0 ? totalMoment / totalWeightKg : 0;
    const cg_y = totalWeightKg > 0 ? totalMomentY / totalWeightKg : 0;
    const cg_z = totalWeightKg > 0 ? totalMomentZ / totalWeightKg : 0;

    // تحديث الكرات في النموذج ثلاثي الأبعاد
    cgSphere.position.x = cg_x;
    cgSphere.position.y = cg_y;
    cgSphere.position.z = cg_z;

    // تحديث حالة إظهار مجموعة CG/AC
    cgAcGroup.visible = showCg;

    // --- تحديث علامة مركز الثقل على جسم الطائرة (CG Marker) ---
    while (cgFuselageMarkerGroup.children.length > 0) {
        const child = cgFuselageMarkerGroup.children[0];
        cgFuselageMarkerGroup.remove(child);
        if (child.geometry) child.geometry.dispose(); // Clean up geometry
        if (child.material) child.material.dispose(); // Clean up material
    }

    if (showCg) {
        const cgMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, side: THREE.DoubleSide });
        cgMarkerMaterial.renderOrder = 1; // Ensure it's drawn on top

        // حساب أبعاد الجسم عند موضع مركز الثقل لضبط حجم العلامة
        const t = (cg_x + fuselageLength / 2) / fuselageLength; // 0 at rear, 1 at front

        if (fuselageShape === 'rectangular') {
            const frontWidth = fuselageWidth;
            const rearWidth = fuselageWidth * fuselageTaperRatio;
            const currentWidth = rearWidth + t * (frontWidth - rearWidth);

            const frontHeight = fuselageHeight;
            const rearHeight = fuselageHeight * fuselageTaperRatio;
            const currentHeight = rearHeight + t * (frontHeight - rearHeight);

            const halfW = currentWidth / 2;
            const halfH = currentHeight / 2;
            const points = [new THREE.Vector3(0, halfH, halfW), new THREE.Vector3(0, halfH, -halfW), new THREE.Vector3(0, -halfH, -halfW), new THREE.Vector3(0, -halfH, halfW)];
            const frameGeom = new THREE.BufferGeometry().setFromPoints(points);
            const cgFrame = new THREE.LineLoop(frameGeom, new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false, renderOrder: 1 }));
            cgFuselageMarkerGroup.add(cgFrame);

        } else { // Cylindrical or Teardrop
            let radiusFront, radiusRear;
            if (fuselageShape === 'cylindrical') { radiusFront = fuselageDiameter / 2; radiusRear = radiusFront * fuselageTaperRatio; }
            else { radiusFront = fuselageFrontDiameter / 2; radiusRear = fuselageRearDiameter / 2; }
            const currentRadius = Math.max(0.001, radiusRear + t * (radiusFront - radiusRear));

            const tubeRadius = 0.005; // Thickness of the ring itself
            const ringGeom = new THREE.TorusGeometry(currentRadius + tubeRadius, tubeRadius, 8, 48);
            ringGeom.rotateY(Math.PI / 2); // Rotate to wrap around the X-axis
            cgFuselageMarkerGroup.add(new THREE.Mesh(ringGeom, cgMarkerMaterial));
        }
    }
    cgFuselageMarkerGroup.position.x = cg_x;
    // عرض النتائج
    liftResultEl.textContent = lift > 0 ? lift.toFixed(2) : '0.00';
    dragResultEl.textContent = totalDrag > 0 ? totalDrag.toFixed(2) : '0.00';
    thrustResultEl.textContent = thrust > 0 ? thrust.toFixed(2) : '0.00';
    wingAreaResultEl.textContent = totalWingArea > 0 ? `${totalWingArea.toFixed(2)}` : '0.00';
    wingWeightResultEl.textContent = (wingWeightKg * 1000).toFixed(0);
    tailAreaResultEl.textContent = totalTailArea > 0 ? totalTailArea.toFixed(2) : '0.00';
    tailWeightResultEl.textContent = (tailWeightKg * 1000).toFixed(0);

    // --- دمج نتائج الجسم والقمرة للعرض ---
    const fuselageWeightLabel = document.querySelector('#fuselage-weight-result').parentElement.querySelector('p');
    const fuselageAreaLabel = document.querySelector('#fuselage-area-result').parentElement.querySelector('p');
    let totalFuselageSectionWeightKg = fuselageWeightKg;
    let totalFuselageSectionAreaM2 = fuselageSurfaceArea;

    if (hasCockpit) {
        totalFuselageSectionWeightKg += cockpitWeightKg;
        totalFuselageSectionAreaM2 += cockpitSurfaceArea;
        fuselageWeightLabel.textContent = 'وزن الجسم والقمرة (جرام):';
        fuselageAreaLabel.textContent = 'مساحة سطح الجسم والقمرة (م²):';
    } else {
        fuselageWeightLabel.textContent = 'وزن الجسم التقديري (جرام):';
        fuselageAreaLabel.textContent = 'مساحة سطح الجسم (م²):';
    }
    fuselageAreaResultEl.textContent = totalFuselageSectionAreaM2 > 0 ? totalFuselageSectionAreaM2.toFixed(2) : '0.00';
    fuselageWeightResultEl.textContent = (totalFuselageSectionWeightKg * 1000).toFixed(0);

    energySourceWeightResultEl.textContent = (energySourceWeightKg * 1000).toFixed(0);
    accessoriesWeightResultEl.textContent = totalAccessoriesWeightGrams.toFixed(0);
    if (hasLandingGear) {
        wheelWeightResultEl.parentElement.style.display = 'flex';
        strutWeightResultEl.parentElement.style.display = 'flex';
        wheelWeightResultEl.textContent = (singleWheelWeightKg * 1000).toFixed(1);
        strutWeightResultEl.textContent = (singleStrutWeightKg * 1000).toFixed(1);
    } else {
        wheelWeightResultEl.parentElement.style.display = 'none';
        strutWeightResultEl.parentElement.style.display = 'none';
    }
    landingGearWeightResultEl.textContent = (landingGearWeightKg * 1000).toFixed(0);

    // إظهار/إخفاء نتيجة وزن الحوامل
    const pylonResultItem = document.getElementById('pylon-weight-result-item');
    if (enginePlacement === 'wing' && pylonWeightKg > 0) {
        pylonResultItem.style.display = 'flex';
        pylonWeightResultEl.textContent = (pylonWeightKg * 1000).toFixed(0);
    } else {
        pylonResultItem.style.display = 'none';
    }

    engineWeightResultEl.textContent = (engineWeightKg * 1000).toFixed(0);
    propWeightResultEl.textContent = (propWeightKg * 1000).toFixed(0);
    propPowerResultEl.textContent = power_consumed_watts.toFixed(1);
    propTorqueResultEl.textContent = torque_required_Nm.toFixed(3);
    totalWeightResultEl.textContent = (totalWeightKg * 1000).toFixed(0);
    twrResultEl.textContent = twr > 0 ? twr.toFixed(2) : '0.00';
    stallSpeedResultEl.textContent = stallSpeed > 0 ? stallSpeed.toFixed(2) : '0.00';

    // عرض نتائج CG و AC (محسوبة من مقدمة الطائرة)
    const datum = fuselageLength / 2; // مقدمة الطائرة هي نقطة الصفر للمستخدم
    const cg_from_nose = fuselageDatum - cg_x;

    document.getElementById('cg-position-y-result').textContent = (cg_y * conversionFactorToDisplay).toFixed(1);
    document.getElementById('cg-position-z-result').textContent = (cg_z * conversionFactorToDisplay).toFixed(1);
    cgPositionResultEl.textContent = (cg_from_nose * conversionFactorToDisplay).toFixed(1);
}

/**
 * يقرأ قيم أشرطة التحكم ويطبق الدوران على أسطح التحكم المرئية.
 */
function updateControlSurfacesFromSliders() {
    const aileronValue = parseFloat(aileronControlSlider.value);
    const elevatorValue = parseFloat(elevatorControlSlider.value);
    const rudderValue = parseFloat(rudderControlSlider.value);

    // تحديث النصوص التي تعرض القيم
    document.getElementById('aileron-control-value').textContent = aileronValue.toFixed(2);
    document.getElementById('elevator-control-value').textContent = elevatorValue.toFixed(2);
    document.getElementById('rudder-control-value').textContent = rudderValue.toFixed(2);

    const maxDeflection = 0.4; // أقصى زاوية انحراف بالراديان (تقريبا 23 درجة)

    const rightAileron = scene.getObjectByName('rightAileron');
    const leftAileron = scene.getObjectByName('leftAileron');
    if (rightAileron && leftAileron) {
        rightAileron.parent.rotation.z = aileronValue * maxDeflection;
        leftAileron.parent.rotation.z = -aileronValue * maxDeflection;
    }

    const rightElevator = scene.getObjectByName('rightElevator');
    const leftElevator = scene.getObjectByName('leftElevator');
    if (rightElevator && leftElevator) {
        const rotationAmount = elevatorValue * maxDeflection;
        rightElevator.parent.rotation.z = rotationAmount;
        leftElevator.parent.rotation.z = rotationAmount;
    }

    const rudder = scene.getObjectByName('rudder');
    if (rudder) {
        rudder.parent.rotation.y = rudderValue * maxDeflection;
    }
}

function initCharts() {
    const liftChartCanvas = document.getElementById('lift-chart');
    const dragChartCanvas = document.getElementById('drag-chart');
    const thrustChartCanvas = document.getElementById('thrust-chart');

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

    thrustChart = new Chart(thrustChartCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'الدفع المتاح',
                    data: [],
                    borderColor: 'rgba(40, 167, 69, 1)', // Green
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                },
                {
                    label: 'الدفع المطلوب (السحب)',
                    data: [],
                    borderColor: 'rgba(220, 53, 69, 1)', // Red
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                }
            ]
        },
        options: {
            ...commonOptions,
            plugins: {
                legend: {
                    display: true // Show legend for this chart
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            }
        }
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
    const propDiameterMeters = getValidNumber(propDiameterInput) * 0.0254;
    const propPitchMeters = getValidNumber(propPitchInput) * 0.0254;
    const propRpm = getValidNumber(propRpmInput);

    const tipChord = wingChord * taperRatio;
    const wingArea = wingSpan * (wingChord + tipChord) / 2;
    if (wingArea <= 0) return;

    // --- حسابات لمعاملات الديناميكا الهوائية ---
    const alphaRad = angleOfAttack * (Math.PI / 180);
    let airfoilLiftFactor = 1.0;
    if (airfoilType === 'flat-bottom') airfoilLiftFactor = 1.1;
    else if (airfoilType === 'symmetrical') airfoilLiftFactor = 0.95;
    const cl = airfoilLiftFactor * 2 * Math.PI * alphaRad;
    const aspectRatio = Math.pow(wingSpan, 2) / wingArea;
    const oswaldEfficiency = 0.8; // قيمة تقديرية
    const cdi = (aspectRatio > 0) ? (Math.pow(cl, 2) / (Math.PI * aspectRatio * oswaldEfficiency)) : 0;
    const cdp = 0.025; // سحب طفيلي تقديري
    const cd_aero = cdp + cdi;

    // --- حسابات المروحة ---
    const n_rps = propRpm / 60;
    const V_pitch = propPitchMeters * n_rps;
    const pitch_diameter_ratio = propDiameterMeters > 0 ? propPitchMeters / propDiameterMeters : 0;
    const prop_constant_k = 0.5 + (pitch_diameter_ratio * 1.5);
    const power_consumed_watts = prop_constant_k * airDensity * Math.pow(n_rps, 3) * Math.pow(propDiameterMeters, 5);

    const speedPoints = [], liftPoints = [], dragPoints = [], thrustAvailablePoints = [];
    for (let i = 0; i <= 25; i++) {
        const speed = i * 2; // from 0 to 50 m/s
        speedPoints.push(speed);
        const dynamicPressure = 0.5 * airDensity * Math.pow(speed, 2);

        // حساب الرفع
        liftPoints.push(dynamicPressure * wingArea * cl);

        // حساب السحب الكلي (الدفع المطلوب)
        const aeroDrag = dynamicPressure * wingArea * cd_aero;
        const prop_drag = speed > 1 ? power_consumed_watts / speed : 0;
        const totalDrag = aeroDrag + prop_drag;
        dragPoints.push(totalDrag);

        // حساب الدفع المتاح
        let thrust = (Math.PI / 8) * airDensity * Math.pow(propDiameterMeters, 2) * (V_pitch * (V_pitch - speed));
        if (thrust < 0) {
            thrust = 0;
        }
        thrustAvailablePoints.push(thrust);
    }

    liftChart.data.labels = speedPoints;
    liftChart.data.datasets[0].data = liftPoints;
    liftChart.update();

    dragChart.data.labels = speedPoints;
    dragChart.data.datasets[0].data = dragPoints;
    dragChart.update();

    thrustChart.data.labels = speedPoints;
    thrustChart.data.datasets[0].data = thrustAvailablePoints; // الدفع المتاح
    thrustChart.data.datasets[1].data = dragPoints; // الدفع المطلوب (السحب)
    thrustChart.update();
}

/**
 * Creates a custom ShaderMaterial for realistic particle rendering.
 * This allows for per-particle size and opacity.
 * @param {THREE.Color | number} color The base color of the particles.
 * @returns {THREE.ShaderMaterial} The configured shader material.
 */
function createAirflowMaterial(color) {
    return new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(color) },
        },
        vertexShader: `
            attribute float scale;
            attribute float customOpacity;
            varying float vOpacity;
            void main() {
                vOpacity = customOpacity;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                // Make particles smaller farther away, and apply our custom scale
                gl_PointSize = scale * (150.0 / -mvPosition.z); // تم تقليل الحجم العام للجسيمات
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            varying float vOpacity;
            void main() {
                // Create a circular point, not a square
                if (length(gl_PointCoord - vec2(0.5, 0.5)) > 0.475) discard;
                gl_FragColor = vec4(color, vOpacity);
            }
        `,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
    });
}

function setAirflowVisibility(isSpinning) {
    if (propParticleSystem) {
        propParticleSystem.visible = isSpinning;
    }
    if (wingAirflowParticleSystem) {
        wingAirflowParticleSystem.visible = isSpinning;
        if (!isSpinning) { // Reset only when stopping the whole simulation
            // Re-initializing is a robust way to reset all particle states
            wingAirflowParticleSystem.geometry.dispose();
            scene.remove(wingAirflowParticleSystem);
            initWingAirflowParticles();
        }
    }
    if (vortexParticleSystem) {
        vortexParticleSystem.visible = isSpinning;
    }
    if (smokeParticleSystem) {
        smokeParticleSystem.visible = isSpinning;
    }
    if (heatHazeParticleSystem) {
        heatHazeParticleSystem.visible = isSpinning;
    }
}

function updateAll() {
    try {
        updatePlaneModel(); // تحديث النموذج ثلاثي الأبعاد أولاً
        calculateAerodynamics(); // ثم إجراء الحسابات بناءً على النموذج المحدث
        updatePlaneParameters(); // تخزين المعلمات المؤقتة للرسوم المتحركة
        if (liftChart && dragChart && thrustChart) {
            updateCharts();
        }
    } catch (error) {
        console.error("Error in updateAll:", error);
        // Optionally, display an error message to the user or log it more prominently
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
    // استثناء حقول اختيار النوع والمواد من التأخير
    if (control.tagName.toLowerCase() === 'select' || control.type === 'checkbox' || control.type === 'color') {
        control.addEventListener('change', updateAll);
    } else { // للمدخلات الأخرى (range, number, text)، استخدم التأخير
        control.addEventListener('input', debouncedUpdate);
    }
});

temperatureInput.addEventListener('input', () => {
    updateAirDensity();
    debouncedUpdate();
});
pressureInput.addEventListener('input', () => {
    updateAirDensity();
    debouncedUpdate();
});
engineTypeInput.addEventListener('change', updateEngineUI);
batteryVoltageInput.addEventListener('input', debouncedUpdate); // إعادة الحساب عند تغيير الفولتية
fuelLevelInput.addEventListener('input', debouncedUpdate);

fuelTypeInput.addEventListener('change', () => {
    const fuelType = fuelTypeInput.value;
    if (fuelType === 'methanol_nitro') {
        smokeColorInput.value = '#CCCCCC'; // دخان أبيض-رمادي فاتح
    } else { // gasoline
        smokeColorInput.value = '#555555'; // دخان رمادي أغمق
    }
});
electricMotorTypeInput.addEventListener('change', updateEngineUI);
icEngineTypeInput.addEventListener('change', updateEngineUI);
engineWingDistanceInput.addEventListener('input', debouncedUpdate);

// Accessories Listeners
enginePylonLengthInput.addEventListener('input', debouncedUpdate);

pylonMaterialInput.addEventListener('change', () => {
    const material = pylonMaterialInput.value;
    let defaultColor;
    if (material === 'aluminum') {
        defaultColor = '#afb8c1'; // Silvery gray
    } else if (material === 'carbon_fiber') {
        defaultColor = '#444444'; // Dark gray
    } else { // plastic
        defaultColor = '#555555'; // Default plastic gray
    }
    pylonColorInput.value = defaultColor;
    updateAll(); // تحديث النموذج والحسابات
});

// تحديث عرض قيم شريط التمرير
sweepAngleInput.addEventListener('input', () => sweepValueEl.textContent = sweepAngleInput.value);
taperRatioInput.addEventListener('input', () => taperValueEl.textContent = parseFloat(taperRatioInput.value).toFixed(2));
dihedralAngleInput.addEventListener('input', () => dihedralValueEl.textContent = dihedralAngleInput.value);
wingIncidenceAngleInput.addEventListener('input', () => wingIncidenceValueEl.textContent = parseFloat(wingIncidenceAngleInput.value).toFixed(1));
fuelLevelInput.addEventListener('input', () => fuelLevelValueEl.textContent = Math.round(fuelLevelInput.value * 100));
tailSweepAngleInput.addEventListener('input', () => tailSweepValueEl.textContent = tailSweepAngleInput.value);
tailIncidenceAngleInput.addEventListener('input', () => tailIncidenceValueEl.textContent = parseFloat(tailIncidenceAngleInput.value).toFixed(1));
tailDihedralAngleInput.addEventListener('input', () => tailDihedralValueEl.textContent = tailDihedralAngleInput.value);
vStabSweepAngleInput.addEventListener('input', () => vStabSweepValueEl.textContent = vStabSweepAngleInput.value);
wingtipTaperRatioInput.addEventListener('input', () => wingtipTaperValueEl.textContent = parseFloat(wingtipTaperRatioInput.value).toFixed(2));
wingtipSweepAngleInput.addEventListener('input', () => wingtipSweepValueEl.textContent = wingtipSweepAngleInput.value);
tailTaperRatioInput.addEventListener('input', () => tailTaperValueEl.textContent = parseFloat(tailTaperRatioInput.value).toFixed(2));
particleDensityInput.addEventListener('input', () => particleDensityValueEl.textContent = Math.round(particleDensityInput.value * 100));
fuselageTaperRatioInput.addEventListener('input', () => fuselageTaperValueEl.textContent = parseFloat(fuselageTaperRatioInput.value).toFixed(2));
fuselageOpacityInput.addEventListener('input', () => fuselageOpacityValueEl.textContent = Math.round(fuselageOpacityInput.value * 100));
airflowTransparencyInput.addEventListener('input', () => airflowTransparencyValueEl.textContent = Math.round(airflowTransparencyInput.value * 100));
particleSizeInput.addEventListener('input', () => particleSizeValueEl.textContent = Math.round(particleSizeInput.value * 100));
vibrationIntensityInput.addEventListener('input', () => vibrationValueEl.textContent = Math.round(vibrationIntensityInput.value * 100));
cockpitOpacityInput.addEventListener('input', () => cockpitOpacityValueEl.textContent = Math.round(cockpitOpacityInput.value * 100));
unitSelector.addEventListener('change', updateUnitLabels);

togglePropSpinBtn.addEventListener('click', () => {
    isPropSpinning = !isPropSpinning;
    if (isPropSpinning) {
        updatePlaneParameters(); // Cache the parameters right before starting the animation
        togglePropSpinBtn.textContent = 'إيقاف';
        togglePropSpinBtn.style.backgroundColor = '#ffc107'; // لون مميز للإشارة إلى التشغيل
        togglePropSpinBtn.style.color = '#000';
        // تشغيل الصوت فقط إذا كان متوقفًا مؤقتًا
        if (engineSound && engineSound.paused) {
            engineSound.play().catch(e => console.error("فشل تشغيل الصوت:", e));
        }
    } else {
        togglePropSpinBtn.textContent = 'تشغيل';
        togglePropSpinBtn.style.backgroundColor = '#e9ecef'; // اللون الافتراضي
        togglePropSpinBtn.style.color = '#333';
        if (engineSound) {
            engineSound.pause();
            engineSound.currentTime = 0; // إعادة الصوت إلى البداية
        }
    }
    setAirflowVisibility(isPropSpinning);
});

toggleSoundBtn.addEventListener('click', () => {
    engineSound.muted = !engineSound.muted;
    if (engineSound.muted) {
        toggleSoundBtn.textContent = 'تشغيل الصوت';
        toggleSoundBtn.style.backgroundColor = '#ffc107';
    } else {
        toggleSoundBtn.textContent = 'كتم الصوت';
        toggleSoundBtn.style.backgroundColor = '#e9ecef';
    }
});
// ربط الأحداث لأشرطة التحكم الجديدة
aileronControlSlider.addEventListener('input', updateControlSurfacesFromSliders);
elevatorControlSlider.addEventListener('input', updateControlSurfacesFromSliders);
rudderControlSlider.addEventListener('input', updateControlSurfacesFromSliders);

resetControlsBtn.addEventListener('click', () => {
    aileronControlSlider.value = 0;
    elevatorControlSlider.value = 0;
    rudderControlSlider.value = 0;
    updateControlSurfacesFromSliders();
    planeGroup.rotation.set(0, 0, 0); // إعادة تعيين دوران جسم الطائرة أيضًا
});

// Event listener for toggling charts visibility
toggleChartsBtn.addEventListener('click', () => {
    const isHidden = chartsContainer.style.display === 'none';
    chartsContainer.style.display = isHidden ? 'grid' : 'none'; // Use 'grid' as defined in CSS
    toggleChartsBtn.textContent = isHidden ? 'إخفاء' : 'إظهار';

    if (isHidden) {
        updateCharts(); // Force update to render correctly when shown
    }
});

// --- حلقة العرض ---
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta(); // الوقت المنقضي منذ الإطار الأخير (بالثواني)

    // Check for NaN in planeGroup.rotation and reset if found
    if (isNaN(planeGroup.rotation.x) || isNaN(planeGroup.rotation.y) || isNaN(planeGroup.rotation.z)) {
        console.warn("Detected NaN in planeGroup rotation. Resetting rotation.");
        planeGroup.rotation.set(0, 0, 0);
        lastVibrationRotation.set(0, 0, 0); // Also reset the vibration tracking
    }

    // إعادة تعيين موضع الطائرة فقط، للحفاظ على الدوران التراكمي للمحاكاة
    planeGroup.position.set(0, 0, 0);

    if (isPropSpinning) {

        // --- [تصحيح] تحديث رؤية التأثيرات البصرية بشكل فوري ---
        // يتم التحقق من حالة مربعات الاختيار في كل إطار وتحديث الرؤية مباشرة.
        if (propParticleSystem) {
            propParticleSystem.visible = true; // مرئي دائمًا عند التشغيل
        }
        if (wingAirflowParticleSystem) {
            wingAirflowParticleSystem.visible = showAmbientWindInput.checked;
        }
        if (vortexParticleSystem) {
            vortexParticleSystem.visible = showVorticesInput.checked;
        }
        if (smokeParticleSystem) {
            const engineType = engineTypeInput.value;
            smokeParticleSystem.visible = showSmokeInput.checked && engineType === 'ic';
        }
        if (heatHazeParticleSystem) {
            const engineType = engineTypeInput.value;
            heatHazeParticleSystem.visible = showHeatHazeInput.checked && engineType === 'ic';
        }

        // --- قراءة قيم المحرك مباشرة من المدخلات للتحديث الفوري ---
        const currentRpm = getValidNumber(propRpmInput);
        const currentPitch = getValidNumber(propPitchInput) * 0.0254; // to meters

        // --- تحديث صوت المحرك ---
        if (engineSound && !engineSound.paused) {
            const minRpm = 1000; // أقل سرعة دوران يبدأ عندها الصوت
            const maxRpm = 15000; // أقصى سرعة دوران لضبط الصوت
            const rpmRatio = Math.max(0, Math.min(1, (currentRpm - minRpm) / (maxRpm - minRpm)));

            // ربط سرعة الدوران بمستوى الصوت (مثلاً من 0.2 إلى 1.0)
            // تم تعطيل هذا السطر مؤقتاً لحل مشكلة تعارض محتملة مع حدة الصوت
            // const minVolume = 0.2;
            // const maxVolume = 1.0;
            // engineSound.volume = minVolume + (rpmRatio * (maxVolume - minVolume));

            // ربط سرعة الدوران بسرعة التشغيل (حدة الصوت) (مثلاً من 0.8 إلى 2.0)
            const minPlaybackRate = 0.7;
            const maxPlaybackRate = 2.5;
            engineSound.playbackRate = minPlaybackRate + (rpmRatio * (maxPlaybackRate - minPlaybackRate));
        }

        // سرعة الهواء الرئيسية يتم حسابها الآن ديناميكيًا من المروحة
        const mainAirSpeed = (currentRpm / 60) * currentPitch;

        // --- قراءة قيم التحكم في الجسيمات مباشرة من المدخلات للتحديث الفوري ---
        const userParticleDensity = getValidNumber(particleDensityInput);
        const userParticleSize = getValidNumber(particleSizeInput);
        const userVibrationIntensity = getValidNumber(vibrationIntensityInput);
        const airflowTransparency = getValidNumber(airflowTransparencyInput);

        const densityFactor = userParticleDensity * 2; // مضاعفة لجعل 50% هو الافتراضي
        const sizeFactor = userParticleSize * 2;       // مضاعفة لجعل 50% هو الافتراضي

        const enginePlacement = enginePlacementInput.value;
        const rotationPerSecond = (currentRpm / 60) * Math.PI * 2;

        // --- دوران المروحة ---
        if (enginePlacement === 'wing') { // This logic was duplicated, removing the duplicate
            const wingPropRotation = wingPropRotationInput.value;
            // البحث عن مجموعات المحركات بالاسم
            const rightWingEngineGrp = scene.getObjectByName("rightWingEngineGroup");
            const leftWingEngineGrp = scene.getObjectByName("leftWingEngineGroup");

            if (rightWingEngineGrp && leftWingEngineGrp) {
                // العثور على المروحة (وهي Group) داخل كل مجموعة محرك
                const rightProp = rightWingEngineGrp.getObjectByName("wingProp_right");
                const leftProp = leftWingEngineGrp.getObjectByName("wingProp_left");

                if (rightProp && leftProp) {
                    if (wingPropRotation === 'counter') {
                        rightProp.rotation.x += rotationPerSecond * deltaTime;
                        leftProp.rotation.x -= rotationPerSecond * deltaTime; // تدور في الاتجاه المعاكس
                    } else { // 'same'
                        rightProp.rotation.x += rotationPerSecond * deltaTime;
                        leftProp.rotation.x += rotationPerSecond * deltaTime;
                    }
                }
            }
        } else { // أمامي أو خلفي
            propellerGroup.rotation.x += rotationPerSecond * deltaTime;
        }

        // --- التحكم في دوران جسم الطائرة بناءً على أشرطة التحكم ---
        const aileronValue = parseFloat(aileronControlSlider.value);
        const elevatorValue = parseFloat(elevatorControlSlider.value);
        const rudderValue = parseFloat(rudderControlSlider.value);

        // سرعات الدوران (راديان في الثانية)
        const rollSpeed = aileronValue * -1.0; // عكس الاتجاه ليكون طبيعياً
        const pitchSpeed = elevatorValue * -0.8; // عكس الاتجاه
        const yawSpeed = rudderValue * -1.2; // عكس الاتجاه

        // استخدام الكواتيرنيون لتجنب مشكلة قفل جيمبال (Gimbal Lock)
        const deltaRotationQuaternion = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(
                pitchSpeed * deltaTime,
                yawSpeed * deltaTime,
                rollSpeed * deltaTime,
                'XYZ' // ترتيب تطبيق الدورانات
            ));
        planeGroup.quaternion.multiplyQuaternions(deltaRotationQuaternion, planeGroup.quaternion);

        // --- تأثير اهتزاز الطائرة ---
        const minVibrationRpm = 4000;
        const maxVibrationRpm = 12000; // زيادة النطاق لتدرج أفضل

        let vibrationMagnitude = 0;
        if (currentRpm > minVibrationRpm) {
            vibrationMagnitude = (currentRpm - minVibrationRpm) / (maxVibrationRpm - minVibrationRpm);
            vibrationMagnitude = Math.min(1, Math.max(0, vibrationMagnitude)); // حصر القيمة بين 0 و 1
        }

        // تطبيق شدة الاهتزاز التي يحددها المستخدم
        vibrationMagnitude *= userVibrationIntensity;

        // اهتزاز الموضع (يتم إعادة تعيينه كل إطار لذا نستخدم `+=`)
        const maxPosOffset = 0.002;
        planeGroup.position.x += (Math.random() * 2 - 1) * maxPosOffset * vibrationMagnitude;
        planeGroup.position.y += (Math.random() * 2 - 1) * maxPosOffset * vibrationMagnitude;
        planeGroup.position.z += (Math.random() * 2 - 1) * maxPosOffset * vibrationMagnitude;

        // --- تحديث اهتزاز الدوران ---
        // 1. إزالة اهتزاز الدوران من الإطار السابق للعودة إلى الدوران "النظيف"
        planeGroup.rotation.x -= lastVibrationRotation.x;
        planeGroup.rotation.y -= lastVibrationRotation.y;
        planeGroup.rotation.z -= lastVibrationRotation.z;

        // 2. حساب وتطبيق اهتزاز الدوران الجديد لهذا الإطار
        const maxRotOffset = 0.005; // إزاحة دوران طفيفة
        const currentVibration = new THREE.Euler(
            (Math.random() * 2 - 1) * maxRotOffset * vibrationMagnitude,
            (Math.random() * 2 - 1) * maxRotOffset * vibrationMagnitude,
            (Math.random() * 2 - 1) * maxRotOffset * vibrationMagnitude
        );
        planeGroup.rotation.x += currentVibration.x;
        planeGroup.rotation.y += currentVibration.y;
        planeGroup.rotation.z += currentVibration.z;

        // 3. تخزين اهتزاز الدوران الحالي لإزالته في الإطار التالي
        lastVibrationRotation.copy(currentVibration);

        // --- كل تحديثات الجزيئات تحدث فقط عند تشغيل المروحة ---
        // --- تحديث جزيئات تدفق هواء المروحة ---
        if (propParticleSystem && propParticleSystem.visible) {
            const axialSpeed = mainAirSpeed * 1.5; // أسرع قليلاً للتأثير البصري
            const rotationalSpeed = (currentRpm / 60) * Math.PI * 2 * 0.5; // عامل 0.5 لتقليل سرعة الدوران البصري

            const positions = propParticleSystem.geometry.attributes.position.array;
            const opacities = propParticleSystem.geometry.attributes.customOpacity.array;
            const scales = propParticleSystem.geometry.attributes.scale.array;
            const spiralData = propParticleSystem.geometry.attributes.spiralData.array;
            const emissionRadius = planeParams.propDiameter / 2;
            const travelDistance = 5.0; // مسافة ثابتة لرحلة الجسيمات

            if (enginePlacement === 'wing') {
                // --- تصحيح: البحث عن المراوح بالاسم في المشهد بأكمله ---
                const wingPropRotation = wingPropRotationInput.value;
                const rightProp = scene.getObjectByName("wingProp_right");
                const leftProp = scene.getObjectByName("wingProp_left");

                if (rightProp && leftProp) {
                    // --- تحسين: الحصول على الموضع العالمي وتحويله إلى محلي ---
                    const rightPropPosWorld = new THREE.Vector3();
                    rightProp.getWorldPosition(rightPropPosWorld);
                    const rightPropPosLocal = planeGroup.worldToLocal(rightPropPosWorld);

                    const leftPropPosWorld = new THREE.Vector3();
                    leftProp.getWorldPosition(leftPropPosWorld);
                    const leftPropPosLocal = planeGroup.worldToLocal(leftPropPosWorld);

                    // --- تصحيح: حساب متجه الدفع الصحيح ---
                    const thrustVector = new THREE.Vector3(-1, 0, 0); // متجه أساسي للخلف
                    const worldQuaternion = new THREE.Quaternion();
                    rightProp.getWorldQuaternion(worldQuaternion); // نفترض أن كلا المحركين لهما نفس زاوية الدفع
                    thrustVector.applyQuaternion(worldQuaternion);
                    thrustVector.normalize();

                    for (let i = 0; i < propParticleCount; i++) {
                        const i2 = i * 2;
                        const i3 = i * 3;

                        const isRightSide = i < propParticleCount / 2;
                        const propPos = isRightSide ? rightPropPosLocal : leftPropPosLocal;

                        const age = propPos.distanceTo(new THREE.Vector3(positions[i3], positions[i3+1], positions[i3+2]));

                        if (age > travelDistance || positions[i3] === 0) {
                            positions[i3] = propPos.x;
                            positions[i3+1] = propPos.y;
                            positions[i3+2] = propPos.z;
                            spiralData[i2] = emissionRadius * Math.sqrt(Math.random());
                            spiralData[i2 + 1] = Math.random() * 2 * Math.PI;
                        }

                        // التحرك على طول متجه الدفع
                        positions[i3] += thrustVector.x * axialSpeed * deltaTime;
                        positions[i3 + 1] += thrustVector.y * axialSpeed * deltaTime;
                        positions[i3 + 2] += thrustVector.z * axialSpeed * deltaTime;

                        // تحديث زاوية الدوران بناءً على اختيار المستخدم
                        if (wingPropRotation === 'counter') {
                            spiralData[i2 + 1] += rotationalSpeed * deltaTime * (isRightSide ? 1 : -1);
                        } else { // 'same'
                            spiralData[i2 + 1] += rotationalSpeed * deltaTime;
                        }

                        // حساب الدوران الحلزوني (هذا الجزء يحتاج إلى تحسين ليعمل مع متجه الدفع)
                        // للتبسيط، سنبقي الدوران في مستوى YZ المحلي للمروحة
                        const yOffset = spiralData[i2] * Math.cos(spiralData[i2 + 1]);
                        const zOffset = spiralData[i2] * Math.sin(spiralData[i2 + 1]);
                        positions[i3 + 1] += yOffset * deltaTime * 10; // إضافة إزاحة صغيرة بدلاً من تحديد الموضع
                        positions[i3 + 2] += zOffset * deltaTime * 10;


                        const currentTravel = age;
                        const ageRatio = Math.max(0, Math.min(1, currentTravel / travelDistance));
                        const effectStrength = Math.sin(ageRatio * Math.PI);

                        opacities[i] = effectStrength * 0.25 * densityFactor * airflowTransparency;
                        scales[i] = effectStrength * 0.5 * sizeFactor;
                    }
                }
            } else { // أمامي أو خلفي
                const startX = propellerGroup.position.x - 0.1;
                const endX = startX - travelDistance;
                const startY = propellerGroup.position.y;
                const startZ = propellerGroup.position.z;

                for (let i = 0; i < propParticleCount; i++) {
                    const i2 = i * 2;
                    const i3 = i * 3;

                    if (positions[i3] < endX || positions[i3] === 0) {
                        positions[i3] = startX;
                        spiralData[i2] = emissionRadius * Math.sqrt(Math.random());
                        spiralData[i2 + 1] = Math.random() * 2 * Math.PI;
                    }

                    positions[i3] -= axialSpeed * deltaTime;
                    spiralData[i2 + 1] += rotationalSpeed * deltaTime;
                    positions[i3 + 1] = startY + spiralData[i2] * Math.cos(spiralData[i2 + 1]);
                    positions[i3 + 2] = startZ + spiralData[i2] * Math.sin(spiralData[i2 + 1]);

                    const currentTravel = startX - positions[i3];
                    const ageRatio = Math.max(0, Math.min(1, currentTravel / travelDistance));
                    const effectStrength = Math.sin(ageRatio * Math.PI);

                    opacities[i] = effectStrength * 0.25 * densityFactor * airflowTransparency;
                    scales[i] = effectStrength * 0.5 * sizeFactor;
                }
            }
            propParticleSystem.geometry.attributes.position.needsUpdate = true;
            propParticleSystem.geometry.attributes.customOpacity.needsUpdate = true;
            propParticleSystem.geometry.attributes.scale.needsUpdate = true;
            propParticleSystem.geometry.attributes.spiralData.needsUpdate = true;
        }

        // --- تحديث تدفق الهواء العام وتأثير أسطح التحكم ---
        if (wingAirflowParticleSystem && wingAirflowParticleSystem.visible) {
            const positions = wingAirflowParticleSystem.geometry.attributes.position.array;
            const velocities = wingAirflowParticleSystem.geometry.attributes.velocity.array;
            const opacities = wingAirflowParticleSystem.geometry.attributes.customOpacity.array;
            const scales = wingAirflowParticleSystem.geometry.attributes.scale.array;

            // Get control surface rotations
            const rightAileronRot = scene.getObjectByName('rightAileron')?.parent.rotation.z || 0;
            const leftAileronRot = scene.getObjectByName('leftAileron')?.parent.rotation.z || 0;
            const elevatorRot = scene.getObjectByName('rightElevator')?.parent.rotation.z || 0;
            const rudderRot = scene.getObjectByName('rudder')?.parent.rotation.y || 0;

            const deflectionFactor = 8.0; // How strongly the surface deflects air

            const startX = 2.0; // Corresponds to emission point in init
            const endX = -planeParams.fuselageLength / 2 - 1.0;
            const travelDistance = startX - endX;

            for (let i = 0; i < wingAirflowParticleCount; i++) {
                const i3 = i * 3;
                let px = positions[i3];
                let py = positions[i3 + 1];
                let pz = positions[i3 + 2];

                // Reset particle's vertical/lateral velocity each frame
                velocities[i3 + 1] = 0;
                velocities[i3 + 2] = 0;

                // --- Aileron Influence ---
                const aileronZoneX = -0.1; // Approx X position of ailerons
                const aileronZStart = planeParams.fuselageWidth / 2 + planeParams.aileronPosition;
                const aileronZEnd = aileronZStart + planeParams.aileronLength;
                if (Math.abs(px - aileronZoneX) < 0.2) {
                    // Right Aileron
                    if (pz > aileronZStart && pz < aileronZEnd) {
                        velocities[i3 + 1] -= rightAileronRot * deflectionFactor;
                    }
                    // Left Aileron
                    if (pz < -aileronZStart && pz > -aileronZEnd) {
                        velocities[i3 + 1] -= leftAileronRot * deflectionFactor;
                    }
                }

                // --- Elevator Influence ---
                const elevatorZoneX = -planeParams.fuselageLength / 2;
                const elevatorZStart = planeParams.fuselageWidth / 2;
                const elevatorZEnd = elevatorZStart + planeParams.elevatorLength;
                if (Math.abs(px - elevatorZoneX) < 0.2) {
                    if (Math.abs(pz) > elevatorZStart && Math.abs(pz) < elevatorZEnd) {
                        velocities[i3 + 1] -= elevatorRot * deflectionFactor;
                    }
                }

                // --- Rudder Influence ---
                const rudderZoneX = -planeParams.fuselageLength / 2;
                const rudderYStart = planeParams.fuselageHeight / 2;
                const rudderYEnd = rudderYStart + planeParams.rudderLength;
                if (Math.abs(px - rudderZoneX) < 0.2 && Math.abs(pz) < 0.2) {
                    if (py > rudderYStart && py < rudderYEnd) {
                        velocities[i3 + 2] -= rudderRot * deflectionFactor; // This was a bug, it should affect z-velocity
                    }
                }

                // Update position based on velocity
                positions[i3] -= mainAirSpeed * deltaTime; // Main forward/backward motion
                positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
                positions[i3 + 2] += velocities[i3 + 2] * deltaTime;

                // Update visual properties based on particle's "age" (position)
                const currentTravel = startX - positions[i3];
                const ageRatio = Math.max(0, Math.min(1, currentTravel / travelDistance));
                const effectStrength = Math.sin(ageRatio * Math.PI); // Smooth fade-in and fade-out

                opacities[i] = effectStrength * 0.15 * densityFactor * airflowTransparency; // جعلها شفافة جداً
                scales[i] = effectStrength * 0.4 * sizeFactor;    // جعلها دقيقة جداً

                // Reset particle if it goes too far behind
                if (positions[i3] < endX) {
                    const emissionWidth = planeParams.wingSpan * 1.2;
                    const emissionHeight = 2;
                    positions[i3] = startX; // Reset in front of the plane
                    positions[i3 + 1] = (Math.random() - 0.5) * emissionHeight;
                    positions[i3 + 2] = (Math.random() - 0.5) * emissionWidth;
                }
            }
            wingAirflowParticleSystem.geometry.attributes.position.needsUpdate = true;
            wingAirflowParticleSystem.geometry.attributes.customOpacity.needsUpdate = true;
            wingAirflowParticleSystem.geometry.attributes.scale.needsUpdate = true;
        }

        // --- تحديث دوامات أطراف الجناح ---
        if (vortexParticleSystem && vortexParticleSystem.visible) {
            const positions = vortexParticleSystem.geometry.attributes.position.array;
            const opacities = vortexParticleSystem.geometry.attributes.customOpacity.array;
            const scales = vortexParticleSystem.geometry.attributes.scale.array;
            const spiralData = vortexParticleSystem.geometry.attributes.spiralData.array;
            const lifeData = vortexParticleSystem.geometry.attributes.life.array;

            // قراءة انحراف أسطح التحكم
            const aileronDeflection = Math.abs(parseFloat(aileronControlSlider.value));
            const elevatorDeflection = Math.abs(parseFloat(elevatorControlSlider.value));

            // Vortex strength is proportional to the lift coefficient (read from cached params)
            const baseVortexStrength = Math.max(0, planeParams.cl) * 0.25; // زيادة التأثير قليلاً
            const vortexRotationSpeed = 15; // How fast the particles spiral
            const travelLength = 5.0; // How far back the vortices travel before resetting

            // حساب مواضع الانبعاث
            const wingTipZ = (planeParams.wingSpan / 2);
            const wingTipY = wingGroup.position.y;
            const wingTipX = wingGroup.position.x - (planeParams.wingChord * planeParams.taperRatio * 0.25); // تقريبًا عند ربع الوتر

            const tailTipZ = (getValidNumber(tailSpanInput) * planeParams.conversionFactor) / 2;
            const tailTipY = tailAssembly.position.y;
            const tailTipX = tailAssembly.position.x - (getValidNumber(tailChordInput) * planeParams.conversionFactor * 0.25);

            const vStabTipY = tailAssembly.position.y + (getValidNumber(vStabHeightInput) * planeParams.conversionFactor);
            const vStabTipX = tailAssembly.position.x - (getValidNumber(vStabChordInput) * planeParams.conversionFactor * 0.25);

            const aileronTipZ = planeParams.wingSpan / 2 - planeParams.aileronPosition;
            const aileronTipX = wingTipX; // تقريب
            const aileronTipY = wingTipY;


            for (let i = 0; i < vortexParticleCount; i++) {
                const i2 = i * 2;
                const i3 = i * 3;

                let emitterX, emitterY, emitterZ, side, currentVortexStrength;

                // تقسيم الجسيمات بين المصادر المختلفة
                if (i < 800) { // دوامات الجناح الرئيسية
                    emitterX = wingTipX;
                    emitterY = wingTipY;
                    emitterZ = wingTipZ;
                    side = (i < 400) ? 1 : -1;
                    currentVortexStrength = baseVortexStrength;
                } else if (i < 1600) { // دوامات الذيل الأفقي
                    emitterX = tailTipX;
                    emitterY = tailTipY;
                    emitterZ = tailTipZ;
                    side = (i < 1200) ? 1 : -1;
                    currentVortexStrength = baseVortexStrength * 0.4; // دوامات الذيل أضعف
                } else if (i < 2000) { // دوامة الذيل العمودي
                    emitterX = vStabTipX;
                    emitterY = vStabTipY;
                    emitterZ = 0;
                    side = 1; // جانب واحد فقط
                    currentVortexStrength = baseVortexStrength * 0.3; // أضعف
                } else if (i < 2500) { // دوامات جسم الطائرة
                    emitterX = -planeParams.fuselageLength / 2;
                    emitterY = 0;
                    emitterZ = planeParams.fuselageWidth / 2;
                    side = (i < 2250) ? 1 : -1;
                    currentVortexStrength = baseVortexStrength * 0.1; // ضعيفة جداً
                } else { // دوامات أسطح التحكم
                    if (i < 3000) { // دوامات الجنيحات
                        emitterX = aileronTipX;
                        emitterY = aileronTipY;
                        emitterZ = aileronTipZ;
                        side = (i < 2750) ? 1 : -1;
                        currentVortexStrength = baseVortexStrength * 0.5 * aileronDeflection; // تعتمد على مقدار الانحراف
                    } else { // دوامات الرافع
                        emitterX = tailTipX;
                        emitterY = tailTipY;
                        emitterZ = tailTipZ;
                        side = (i < 3250) ? 1 : -1;
                        currentVortexStrength = baseVortexStrength * 0.3 * elevatorDeflection;
                    }
                }

                // إعادة تعيين الجسيم إذا كان قديمًا
                const age = emitterX - positions[i3];
                if (age > travelLength || age < 0 || lifeData[i2] <= 0) {
                    positions[i3] = emitterX;
                    positions[i3 + 1] = emitterY;
                    positions[i3 + 2] = emitterZ * side;
                    spiralData[i] = Math.random() * Math.PI * 2;
                    lifeData[i2] = 1.0; // إعادة تعيين العمر
                }

                // تحديث العمر
                lifeData[i2] -= deltaTime / (travelLength / mainAirSpeed);

                // Move particle backward
                positions[i3] -= mainAirSpeed * deltaTime;

                // Update spiral angle
                spiralData[i] += vortexRotationSpeed * deltaTime * side;

                // Calculate spiral position
                const ageRatio = Math.max(0, lifeData[i2]);
                const effectStrength = Math.sin(ageRatio * Math.PI);
                const radius = currentVortexStrength * (1 - Math.exp(-age * 1.5));
                const yOffset = radius * Math.cos(spiralData[i]);
                const zOffset = radius * Math.sin(spiralData[i]);

                // تطبيق الإزاحة الحلزونية
                if (emitterZ !== 0) { // دوامات أفقية (جناح وذيل)
                    positions[i3 + 1] = emitterY + yOffset;
                    positions[i3 + 2] = (emitterZ * side) + zOffset;
                } else { // دوامة عمودية (ذيل عمودي)
                    positions[i3 + 1] = emitterY + yOffset;
                    positions[i3 + 2] = emitterZ + zOffset;
                }

                // تعديل: إضافة "تموج" عشوائي لمحاكاة تشوه الهواء
                const shimmerStrength = 0.05 * effectStrength * currentVortexStrength;
                positions[i3 + 1] += (Math.random() - 0.5) * shimmerStrength;
                positions[i3 + 2] += (Math.random() - 0.5) * shimmerStrength;

                // تعديل: جعل التأثير أكثر شفافية ونعومة
                // يتم التحكم في الشفافية بشكل أساسي من خلال قوة الدوامة وعمر الجسيم
                opacities[i] = effectStrength * Math.min(1, currentVortexStrength * 3.0) * 0.5 * densityFactor * airflowTransparency;
                // زيادة الحجم قليلاً لجعله أكثر وضوحًا كتشوه
                scales[i] = effectStrength * 1.5 * sizeFactor;
            }
            vortexParticleSystem.geometry.attributes.position.needsUpdate = true;
            vortexParticleSystem.geometry.attributes.customOpacity.needsUpdate = true;
            vortexParticleSystem.geometry.attributes.scale.needsUpdate = true;
            vortexParticleSystem.geometry.attributes.spiralData.needsUpdate = true;
            vortexParticleSystem.geometry.attributes.life.needsUpdate = true; // تحديث بيانات العمر
        }

        // --- تحديث تأثير حرارة المحرك ---
        if (heatHazeParticleSystem && heatHazeParticleSystem.visible) {
            const positions = heatHazeParticleSystem.geometry.attributes.position.array;
            const opacities = heatHazeParticleSystem.geometry.attributes.customOpacity.array;
            const scales = heatHazeParticleSystem.geometry.attributes.scale.array;
            const lifeData = heatHazeParticleSystem.geometry.attributes.life.array;

            const buoyancy = 0.5; // سرعة ارتفاع الحرارة
            const shimmerStrength = 0.4; // قوة التراقص الجانبي

            const enginePlacement = enginePlacementInput.value;
            const emissionPoints = [];

            if (enginePlacement === 'wing') {
                // تصحيح: البحث عن المحركات في المجموعات الصحيحة الخاصة بكل جناح
                const rightWingEngineGrp = scene.getObjectByName("rightWingEngineGroup");
                const leftWingEngineGrp = scene.getObjectByName("leftWingEngineGroup");

                const findAndAddEngine = (group) => {
                    if (group) {
                        const engine = group.children.find(c => c.type === 'Mesh' && c.geometry.type === 'CylinderGeometry');
                        if (engine) {
                            // الحصول على الموضع العالمي للمحرك لضمان دقة الانبعاث
                            const worldPos = new THREE.Vector3();
                            engine.getWorldPosition(worldPos);
                            emissionPoints.push(worldPos);
                        }
                    }
                };

                findAndAddEngine(rightWingEngineGrp);
                findAndAddEngine(leftWingEngineGrp);

            } else {
                emissionPoints.push(engineGroup.position.clone());
            }

            for (let i = 0; i < heatHazeParticleCount; i++) {
                const i2 = i * 2;
                const i3 = i * 3;

                lifeData[i2] -= deltaTime;

                if (lifeData[i2] <= 0) {
                    // توزيع الجسيمات على نقاط الانبعاث
                    // تصحيح: التأكد من وجود نقاط انبعاث قبل استخدامها
                    if (emissionPoints.length === 0) continue;
                    const emissionPoint = emissionPoints[i % emissionPoints.length] || new THREE.Vector3();


                    positions[i3] = emissionPoint.x + (Math.random() - 0.5) * 0.1;
                    positions[i3 + 1] = emissionPoint.y + (Math.random() - 0.5) * 0.1;
                    positions[i3 + 2] = emissionPoint.z + (Math.random() - 0.5) * 0.1;
                    lifeData[i2] = lifeData[i2 + 1] = 0.5 + Math.random() * 0.5; // عمر قصير جداً
                }

                // تحديث الموضع
                positions[i3] -= mainAirSpeed * deltaTime * 0.5; // تتحرك للخلف ببطء
                positions[i3 + 1] += buoyancy * deltaTime; // ترتفع للأعلى
                positions[i3 + 2] += (Math.random() - 0.5) * shimmerStrength * deltaTime; // تراقص جانبي

                // تحديث الخصائص البصرية
                const lifeRatio = Math.max(0, lifeData[i2] / lifeData[i2 + 1]);
                opacities[i] = Math.sin(lifeRatio * Math.PI) * 0.05 * densityFactor * airflowTransparency; // شفاف جداً
                scales[i] = (1.0 - lifeRatio) * 3.0 * sizeFactor;
            }

            heatHazeParticleSystem.geometry.attributes.position.needsUpdate = true;
            heatHazeParticleSystem.geometry.attributes.customOpacity.needsUpdate = true;
            heatHazeParticleSystem.geometry.attributes.scale.needsUpdate = true;
            heatHazeParticleSystem.geometry.attributes.life.needsUpdate = true;
        }

        // --- تحديث دخان محرك IC ---
        if (smokeParticleSystem && smokeParticleSystem.visible) {
            const positions = smokeParticleSystem.geometry.attributes.position.array;
            const opacities = smokeParticleSystem.geometry.attributes.customOpacity.array;
            const scales = smokeParticleSystem.geometry.attributes.scale.array;
            const lifeData = smokeParticleSystem.geometry.attributes.life.array;

            const buoyancy = 0.3; // سرعة ارتفاع الدخان
            const spread = 0.2;   // مدى انتشار الدخان

            const enginePlacement = enginePlacementInput.value;
            const emissionPoints = [];
            const engineLength = (getValidNumber(icEngineLengthInput) * planeParams.conversionFactor);

            // تصحيح: البحث عن المحركات في المجموعات الصحيحة الخاصة بكل جناح
            if (enginePlacement === 'wing') {
                const rightWingEngineGrp = scene.getObjectByName("rightWingEngineGroup");
                const leftWingEngineGrp = scene.getObjectByName("leftWingEngineGroup");

                const findAndAddEngine = (group) => {
                    if (group) {
                        const engine = group.children.find(c => c.type === 'Mesh' && c.geometry.type === 'CylinderGeometry');
                        if (engine) {
                            const worldPos = new THREE.Vector3();
                            engine.getWorldPosition(worldPos);
                            worldPos.x -= engineLength / 2; // الانبعاث من نهاية المحرك
                            emissionPoints.push(worldPos);
                        }
                    }
                };

                findAndAddEngine(rightWingEngineGrp);
                findAndAddEngine(leftWingEngineGrp);
            } else {
                const pos = engineGroup.position.clone();
                pos.x -= engineLength / 2; // الانبعاث من نهاية المحرك
                emissionPoints.push(pos);
            }

            for (let i = 0; i < smokeParticleCount; i++) {
                const i2 = i * 2;
                const i3 = i * 3;

                // توزيع الجسيمات على نقاط الانبعاث
                let emissionPoint = emissionPoints.length > 0 ? emissionPoints[i % emissionPoints.length] : new THREE.Vector3();

                // تحديث عمر الجسيم
                lifeData[i2] -= deltaTime;

                // إذا انتهى عمر الجسيم، يتم إعادة إنشائه
                if (lifeData[i2] <= 0) {
                    // إعادة الحصول على نقطة الانبعاث في حال تغير موضع الطائرة
                    if (emissionPoints.length > 0) {
                        emissionPoint = emissionPoints[i % emissionPoints.length];
                    }
                    positions[i3] = emissionPoint.x + (Math.random() - 0.5) * 0.05;
                    positions[i3 + 1] = emissionPoint.y + (Math.random() - 0.5) * 0.05;
                    positions[i3 + 2] = emissionPoint.z + (Math.random() - 0.5) * 0.05;

                    lifeData[i2] = lifeData[i2 + 1] = 2.0 + Math.random() * 2.0; // عمر افتراضي من 2-4 ثوانٍ
                }

                // تحديث الموضع
                // 1. التحرك للخلف مع تدفق الهواء
                positions[i3] -= mainAirSpeed * deltaTime;
                // 2. الارتفاع للأعلى بسبب الحرارة
                positions[i3 + 1] += buoyancy * deltaTime;
                // 3. إضافة بعض الاضطراب العشوائي
                positions[i3] += (Math.random() - 0.5) * spread * deltaTime;
                positions[i3 + 1] += (Math.random() - 0.5) * spread * deltaTime;
                positions[i3 + 2] += (Math.random() - 0.5) * spread * deltaTime;

                // تحديث الخصائص البصرية بناءً على العمر
                const lifeRatio = Math.max(0, lifeData[i2] / lifeData[i2 + 1]);

                // التلاشي بمرور الوقت
                opacities[i] = lifeRatio * 0.3 * densityFactor * airflowTransparency; // الدخان ليس كثيفًا جدًا
                // ينمو ثم يتلاشى
                scales[i] = (1.0 - lifeRatio) * 5.0 * sizeFactor;
            }

            smokeParticleSystem.geometry.attributes.position.needsUpdate = true;
            smokeParticleSystem.geometry.attributes.customOpacity.needsUpdate = true;
            smokeParticleSystem.geometry.attributes.scale.needsUpdate = true;
            smokeParticleSystem.geometry.attributes.life.needsUpdate = true;
        }





    }
    else {
        lastVibrationRotation.set(0, 0, 0);
    }
    // إذا لم تكن المحاكاة قيد التشغيل، لا تقم بإعادة تعيين الدوران
    // للسماح للمستخدم برؤية الوضعية الأخيرة التي تركها عليها.
    // يتم إعادة التعيين الآن عبر زر "إعادة تعيين".

    controls.update(); // ضروري إذا تم تفعيل enableDamping

    renderer.render(scene, camera);
}

/** Initializes the particle system for propeller airflow simulation. */
function initPropAirflowParticles() {
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(propParticleCount * 3);
    const opacities = new Float32Array(propParticleCount).fill(0);
    const scales = new Float32Array(propParticleCount).fill(0);
    // بيانات مخصصة لكل جسيم: [نصف القطر، الزاوية]
    const spiralData = new Float32Array(propParticleCount * 2);

    for (let i = 0; i < propParticleCount; i++) {
        // سيتم تهيئة القيم الأولية عند إعادة تعيين الجسيم لأول مرة
        spiralData[i * 2] = 0; // نصف القطر
        spiralData[i * 2 + 1] = 0; // الزاوية
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('customOpacity', new THREE.BufferAttribute(opacities, 1));
    particleGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    particleGeometry.setAttribute('spiralData', new THREE.BufferAttribute(spiralData, 2));

    const particleMaterial = createAirflowMaterial(0x4488ff); // لون أزرق أكثر وضوحًا

    propParticleSystem = new THREE.Points(particleGeometry, particleMaterial);
    propParticleSystem.visible = false;
    planeGroup.add(propParticleSystem);
}

/** Initializes the particle system for wing/tail airflow simulation. */
function initWingAirflowParticles() {
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(wingAirflowParticleCount * 3);
    const velocities = new Float32Array(wingAirflowParticleCount * 3);
    const opacities = new Float32Array(wingAirflowParticleCount).fill(0);
    const scales = new Float32Array(wingAirflowParticleCount).fill(0);

    const emissionWidth = 4; // Span of the airflow sheet
    const emissionHeight = 2; // Height of the airflow sheet

    for (let i = 0; i < wingAirflowParticleCount; i++) {
        const i3 = i * 3;
        // Distribute particles in a plane in front of the aircraft
        positions[i3] = 2.0 + Math.random() * 2; // Start in front
        positions[i3 + 1] = (Math.random() - 0.5) * emissionHeight;
        positions[i3 + 2] = (Math.random() - 0.5) * emissionWidth;

        // Initial velocity (will be updated in animate)
        velocities[i3] = -1; // Moving towards the plane
        velocities[i3 + 1] = 0;
        velocities[i3 + 2] = 0;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    particleGeometry.setAttribute('customOpacity', new THREE.BufferAttribute(opacities, 1));
    particleGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

    const particleMaterial = createAirflowMaterial(0x66ccff); // لون سماوي أكثر وضوحًا

    wingAirflowParticleSystem = new THREE.Points(particleGeometry, particleMaterial);
    wingAirflowParticleSystem.visible = false;
    scene.add(wingAirflowParticleSystem); // Add to the main scene, not the plane group
}

/** Initializes the particle system for wingtip vortex simulation. */
function initVortexParticles() {
    // زيادة عدد الجسيمات لاستيعاب جميع المصادر الجديدة
    vortexParticleCount = 3500; // 1000 للجناح, 1000 للذيل, 500 للجسم, 1000 لأسطح التحكم

    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(vortexParticleCount * 3).fill(0);
    const opacities = new Float32Array(vortexParticleCount).fill(0);
    const scales = new Float32Array(vortexParticleCount).fill(0);
    // Custom attributes
    const spiralData = new Float32Array(vortexParticleCount);
    const lifeData = new Float32Array(vortexParticleCount * 2); // [currentLife, maxLife]

    for (let i = 0; i < vortexParticleCount; i++) {
        // Store a random initial angle
        spiralData[i] = Math.random() * Math.PI * 2;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('customOpacity', new THREE.BufferAttribute(opacities, 1));
    particleGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    particleGeometry.setAttribute('spiralData', new THREE.BufferAttribute(spiralData, 1));
    particleGeometry.setAttribute('life', new THREE.BufferAttribute(lifeData, 2));

    // تعديل: استخدام مادة مخصصة للدوامات لتبدو كتشوه في الهواء بدلاً من جسيمات صلبة
    const vortexMaterial = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0xffffff) } },
        vertexShader: createAirflowMaterial().vertexShader, // استخدام نفس شادر الرأس
        fragmentShader: createAirflowMaterial().fragmentShader, // استخدام نفس شادر الجزء
        blending: THREE.NormalBlending, // استخدام المزج العادي لمظهر أكثر نعومة
        depthWrite: false,
        transparent: true,
    });

    vortexParticleSystem = new THREE.Points(particleGeometry, vortexMaterial);
    vortexParticleSystem.visible = false;
    // إضافة إلى المشهد الرئيسي لأن الدوامات ستنبعث من أماكن متعددة (الجناح والذيل)
    scene.add(vortexParticleSystem);
}

/** Initializes the particle system for IC engine smoke. */
function initSmokeParticles() {
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(smokeParticleCount * 3).fill(0);
    const opacities = new Float32Array(smokeParticleCount).fill(0);
    const scales = new Float32Array(smokeParticleCount).fill(0);
    // Custom attribute for life: [currentLife, maxLife]
    const lifeData = new Float32Array(smokeParticleCount * 2).fill(0);

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('customOpacity', new THREE.BufferAttribute(opacities, 1));
    particleGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    particleGeometry.setAttribute('life', new THREE.BufferAttribute(lifeData, 2));

    // Use a different material for smoke
    const smokeMaterial = createAirflowMaterial(0x999999); // Grayish color
    smokeMaterial.blending = THREE.NormalBlending; // Normal blending looks better for smoke

    smokeParticleSystem = new THREE.Points(particleGeometry, smokeMaterial);
    smokeParticleSystem.visible = false;
    planeGroup.add(smokeParticleSystem); // Add to plane group to move with it
}

/** Initializes the particle system for IC engine heat haze effect. */
function initHeatHazeParticles() {
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(heatHazeParticleCount * 3).fill(0);
    const opacities = new Float32Array(heatHazeParticleCount).fill(0);
    const scales = new Float32Array(heatHazeParticleCount).fill(0);
    const lifeData = new Float32Array(heatHazeParticleCount * 2).fill(0);

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('customOpacity', new THREE.BufferAttribute(opacities, 1));
    particleGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    particleGeometry.setAttribute('life', new THREE.BufferAttribute(lifeData, 2));

    // A very faint, almost white material
    const heatMaterial = createAirflowMaterial(0xDDDDDD);
    heatMaterial.blending = THREE.NormalBlending; // Normal blending is better for a distortion effect

    heatHazeParticleSystem = new THREE.Points(particleGeometry, heatMaterial);
    heatHazeParticleSystem.visible = false;
    planeGroup.add(heatHazeParticleSystem);
}

/**
 * Initializes the collapsible fieldset functionality.
 */
function initCollapsibleFieldsets() {
    const fieldsets = document.querySelectorAll('.collapsible-fieldset');

    fieldsets.forEach((fieldset) => {
        const legend = fieldset.querySelector('.collapsible-legend');
        const content = fieldset.querySelector('.collapsible-content');
        const icon = legend.querySelector('.toggle-icon');

        if (!legend || !content || !icon) return;

        // قائمة بالأقسام التي ستبقى مفتوحة بشكل افتراضي
        const sectionsToKeepOpen = [
            'الوحدات',
            'تصميم الجناح'
        ];

        const sectionTitle = legend.querySelector('span').textContent.trim();
        const isInitiallyCollapsed = !sectionsToKeepOpen.includes(sectionTitle);

        if (isInitiallyCollapsed) {
            content.style.maxHeight = '0px';
            content.classList.add('collapsed');
            icon.classList.replace('fa-chevron-down', 'fa-chevron-left');
        }

        legend.addEventListener('click', () => {
            const isCollapsed = content.style.maxHeight === '0px' || content.classList.contains('collapsed');
            content.style.maxHeight = isCollapsed ? '5000px' : '0px';
            content.classList.toggle('collapsed');
            icon.classList.toggle('fa-chevron-down', isCollapsed);
            icon.classList.toggle('fa-chevron-left', !isCollapsed);
        });
    });
}

/**
 * Initializes the Save/Load design functionality.
 */
function initSaveLoad() {
    const saveBtn = document.getElementById('save-design-btn');
    const loadBtn = document.getElementById('load-design-btn');
    const loadInput = document.getElementById('load-design-input');

    // --- Save Functionality ---
    saveBtn.addEventListener('click', () => {
        const designData = {};
        const formElements = form.querySelectorAll('input, select');

        formElements.forEach(el => {
            if (el.id) {
                switch (el.type) {
                    case 'checkbox':
                        designData[el.id] = el.checked;
                        break;
                    case 'file':
                        // لا تحفظ قيمة حقل الملف
                        break;
                    default:
                        designData[el.id] = el.value;
                }
            }
        });

        const jsonString = JSON.stringify(designData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'rc_plane_design.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // --- Load Functionality ---
    loadBtn.addEventListener('click', () => {
        loadInput.click(); // Trigger the hidden file input
    });

    loadInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const designData = JSON.parse(e.target.result);
                applyDesign(designData);
            } catch (error) {
                console.error("Error parsing design file:", error);
                alert("ملف تصميم غير صالح أو تالف.");
            }
        };
        reader.readAsText(file);
    });
}

// --- التشغيل الأولي ---
initPropAirflowParticles();
initWingAirflowParticles();
initVortexParticles();
initSmokeParticles();
initHeatHazeParticles();
initCharts();
initSaveLoad(); // Initialize Save/Load functionality
chartsContainer.style.display = 'none'; // Hide charts initially
updateUnitLabels();
// استدعاء updateEngineUI أولاً لملء حقول المحرك بالقيم الافتراضية.
// هذه الدالة ستقوم بدورها باستدعاء updateAll() لضمان تحديث كل شيء.
updateAirDensity(); // Calculate initial density based on default temp/pressure
updateEngineUI();
updateControlSurfacesFromSliders(); // ضبط أسطح التحكم على الوضع الأولي (0)
initCollapsibleFieldsets(); // Initialize the new collapsible feature
animate();

// --- التعامل مع تغيير حجم النافذة ---
window.addEventListener('resize', () => {
    // التأكد من أن العارض موجود قبل محاولة الوصول إلى خصائصه
    const viewerDiv = document.querySelector('.viewer');
    if (viewerDiv) {
        camera.aspect = viewerDiv.clientWidth / viewerDiv.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(viewerDiv.clientWidth, viewerDiv.clientHeight);
    }
});
