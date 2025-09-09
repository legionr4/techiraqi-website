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

// --- إنشاء أجزاء الطائرة ---
const planeGroup = new THREE.Group();
const material = new THREE.MeshStandardMaterial({ color: 0x0056b3 });
const wingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });

// جسم الطائرة
const fuselageGeom = new THREE.BoxGeometry(1, 0.15, 0.15);
const fuselage = new THREE.Mesh(fuselageGeom, material);
planeGroup.add(fuselage);

// الجناح الرئيسي
// (width: chord, height: thickness, depth: span)
const wingGeom = new THREE.BoxGeometry(1, 1, 1); // Unit cube
const wing = new THREE.Mesh(wingGeom, wingMaterial);
wing.position.y = 0.05;
planeGroup.add(wing);

// الذيل الأفقي
// (width: chord, height: thickness, depth: span)
const tailGeom = new THREE.BoxGeometry(1, 1, 1); // Unit cube
const tail = new THREE.Mesh(tailGeom, wingMaterial);
tail.position.set(-0.5, 0.05, 0);
planeGroup.add(tail);

// الذيل العمودي
const vTailGeom = new THREE.BoxGeometry(0.1, 0.2, 0.015);
const vTail = new THREE.Mesh(vTailGeom, material);
vTail.position.set(-0.5, 0.15, 0);
planeGroup.add(vTail);

// المروحة
const propellerGroup = new THREE.Group();
const propBladeGeom = new THREE.BoxGeometry(0.02, 0.25, 0.01);
const propMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

propellerGroup.position.x = 0.55;
planeGroup.add(propellerGroup);

scene.add(planeGroup);

// --- دوال التحديث والحساب ---
const form = document.getElementById('plane-form');
const inputs = form.querySelectorAll('input'); // Keep this for attaching event listeners

// تخزين عناصر الإدخال والنتائج لتحسين الأداء
const wingSpanInput = document.getElementById('wing-span');
const wingChordInput = document.getElementById('wing-chord');
const tailSpanInput = document.getElementById('tail-span');
const tailChordInput = document.getElementById('tail-chord');
const fuselageLengthInput = document.getElementById('fuselage-length');
const propDiameterInput = document.getElementById('prop-diameter');
const propBladesInput = document.getElementById('prop-blades');
const propPitchInput = document.getElementById('prop-pitch');
const propRpmInput = document.getElementById('prop-rpm');
const angleOfAttackInput = document.getElementById('angle-of-attack');
const airSpeedInput = document.getElementById('air-speed');
const airDensityInput = document.getElementById('air-density');

const liftResultEl = document.getElementById('lift-result');
const dragResultEl = document.getElementById('drag-result');
const thrustResultEl = document.getElementById('thrust-result');

function updatePlaneModel() {
    const wingSpan = parseFloat(wingSpanInput.value);
    const wingChord = parseFloat(wingChordInput.value);
    const tailSpan = parseFloat(tailSpanInput.value);
    const tailChord = parseFloat(tailChordInput.value);
    const fuselageLength = parseFloat(fuselageLengthInput.value);
    const propDiameter = parseFloat(propDiameterInput.value) * 0.0254; // to meters
    const propBlades = parseInt(propBladesInput.value);

    // تحديث الأبعاد
    fuselage.scale.x = fuselageLength;
    // The wing/tail geometry is a 1x1x1 cube.
    // We scale it to (chord, thickness, span).
    // Thickness is kept constant as in the original design.
    wing.scale.set(wingChord, 0.02, wingSpan);
    tail.scale.set(tailChord, 0.015, tailSpan);
    vTail.scale.y = (tailChord / 0.15) * 1.5; // Make vertical tail proportional

    // تحديث المواقع
    tail.position.x = -fuselageLength / 2;
    vTail.position.x = -fuselageLength / 2;
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
    const wingSpan = parseFloat(wingSpanInput.value);
    const wingChord = parseFloat(wingChordInput.value);
    const angleOfAttack = parseFloat(angleOfAttackInput.value);
    const airSpeed = parseFloat(airSpeedInput.value);
    const airDensity = parseFloat(airDensityInput.value);
    const propDiameter = parseFloat(propDiameterInput.value) * 0.0254; // to meters
    const propPitch = parseFloat(propPitchInput.value); // inches
    const propRpm = parseFloat(propRpmInput.value);

    // --- حسابات مبسطة جداً ---
    const wingArea = wingSpan * wingChord;
    const alphaRad = angleOfAttack * (Math.PI / 180);

    // 1. قوة الرفع (Lift)
    // L = 0.5 * Cl * rho * V^2 * A
    // Cl (معامل الرفع) ≈ 2 * PI * alpha (تقريب لنظرية الجنيح الرقيق)
    const cl = 2 * Math.PI * alphaRad;
    const lift = 0.5 * cl * airDensity * Math.pow(airSpeed, 2) * wingArea;

    // 2. قوة السحب (Drag)
    // D = 0.5 * Cd * rho * V^2 * A
    // Cd = Cdp + Cdi (سحب طفيلي + سحب مستحث)
    const aspectRatio = Math.pow(wingSpan, 2) / wingArea;
    const oswaldEfficiency = 0.8; // كفاءة أوزوالد (قيمة مفترضة)
    const cdi = Math.pow(cl, 2) / (Math.PI * aspectRatio * oswaldEfficiency);
    const cdp = 0.025; // معامل سحب طفيلي مفترض (لجسم الطائرة والذيل وغيرها)
    const cd = cdp + cdi;
    const drag = 0.5 * cd * airDensity * Math.pow(airSpeed, 2) * wingArea;

    // 3. قوة الدفع (Thrust)
    // صيغة تجريبية مبسطة جداً للدفع الساكن (Static Thrust)
    // لا تعكس الواقع بدقة ولكن تعطي فكرة عن علاقة المتغيرات
    const n_rps = propRpm / 60; // revolutions per second
    const thrust = 4.392399 * Math.pow(10, -8) * propRpm * Math.pow(propDiameter / 0.0254, 3.5) / Math.sqrt(propPitch) * (4.23333 * Math.pow(10, -4) * propRpm * propPitch - airSpeed * 0.5144);
    
    // عرض النتائج
    liftResultEl.textContent = lift > 0 ? lift.toFixed(2) : '0.00';
    dragResultEl.textContent = drag > 0 ? drag.toFixed(2) : '0.00';
    thrustResultEl.textContent = thrust > 0 ? thrust.toFixed(2) : '0.00';
}

function updateAll() {
    updatePlaneModel();
    calculateAerodynamics();
}

// --- ربط الأحداث ---
inputs.forEach(input => input.addEventListener('input', updateAll));

// --- حلقة العرض ---
function animate() {
    requestAnimationFrame(animate);

    controls.update(); // ضروري إذا تم تفعيل enableDamping

    renderer.render(scene, camera);
}

// --- التشغيل الأولي ---
updateAll();
animate();

// --- التعامل مع تغيير حجم النافذة ---
window.addEventListener('resize', () => {
    const viewerDiv = document.querySelector('.viewer');
    camera.aspect = viewerDiv.clientWidth / viewerDiv.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewerDiv.clientWidth, viewerDiv.clientHeight);
});
