// rc-design.js

// Import directly from the CDN URLs to bypass the importmap
import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
 
    // نسخة آمنة ومبسطة لتصحيح الأخطاء
    // الهدف: التأكد من أن الإعداد الأساسي لـ Three.js يعمل بشكل صحيح.
    // هذا الكود لا يعتمد على أي مدخلات من لوحة التحكم.

    let scene, camera, renderer, controls;

    function init() {
        try {
            const viewerContainer = document.getElementById('viewer-container');
            if (!viewerContainer) {
                alert('خطأ فادح: لم يتم العثور على حاوية العرض (viewer-container).');
                return;
            }

            // فحص تشخيصي: التأكد من أن الحاوية لها أبعاد
            if (viewerContainer.clientWidth === 0 || viewerContainer.clientHeight === 0) {
                alert('خطأ في التخطيط: حاوية العرض ثلاثية الأبعاد ليس لها أبعاد (width/height). يرجى التحقق من ملف CSS.');
                viewerContainer.style.border = "2px solid red"; // إظهار حدود حمراء للمساعدة في التشخيص
                return;
            }

            // 1. المشهد
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0xf0f0f0); // لون خلفية محايد للوضوح

            // 2. الكاميرا
            camera = new THREE.PerspectiveCamera(75, viewerContainer.clientWidth / viewerContainer.clientHeight, 0.1, 1000);
            camera.position.set(1, 1, 2);

            // 3. العارض
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
            viewerContainer.appendChild(renderer.domElement);

            // 4. الإضاءة
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(5, 10, 7.5);
            scene.add(directionalLight);

            // 5. متحكمات الماوس
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;

            // 6. محاور مساعدة
            const axesHelper = new THREE.AxesHelper(2);
            scene.add(axesHelper);

            // 7. إنشاء مجسم طائرة بسيط جدًا
            const airplaneGroup = new THREE.Group();

            const fuselageGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 16);
            const fuselageMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
            const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
            fuselage.rotation.z = Math.PI / 2; // محاذاة مع المحور X
            airplaneGroup.add(fuselage);

            const wingGeo = new THREE.BoxGeometry(0.2, 0.02, 1.2); // (عرض الوتر, سماكة, طول الجناح)
            const wingMat = new THREE.MeshStandardMaterial({ color: 0x007bff });
            const wing = new THREE.Mesh(wingGeo, wingMat);
            airplaneGroup.add(wing);

            scene.add(airplaneGroup);

            // 8. بدء حلقة الرسوم المتحركة
            animate();

            // التعامل مع تغيير حجم النافذة
            window.addEventListener('resize', () => {
                if (!camera || !renderer) return;
                camera.aspect = viewerContainer.clientWidth / viewerContainer.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
            });

        } catch (error) {
            console.error("An error occurred during initialization:", error);
            alert("حدث خطأ فادح أثناء تهيئة العارض ثلاثي الأبعاد. يرجى التحقق من الكونسول لمزيد من التفاصيل.");
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        if (controls) controls.update();
        if (renderer) renderer.render(scene, camera);
    }

    // بدء تشغيل كل شيء
    init();
});
