// rc-design.js

// هذا الملف هو نسخة مبسطة جدًا بناءً على طلبك، لعرض مجسم أساسي والتأكد من عمل الواجهة.
import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
    let scene, camera, renderer, controls, cube;

    function init() {
        try {
            const viewerContainer = document.getElementById('viewer-container');
            if (!viewerContainer) {
                alert('خطأ: لم يتم العثور على حاوية العرض (viewer-container).');
                return;
            }

            // 1. إعداد المشهد (Scene)
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x2a3b4c); // خلفية داكنة للوضوح

            // 2. إعداد الكاميرا (Camera)
            camera = new THREE.PerspectiveCamera(75, viewerContainer.clientWidth / viewerContainer.clientHeight, 0.1, 1000);
            camera.position.set(1.5, 1.5, 3); // تعديل موضع الكاميرا لرؤية أفضل

            // 3. إعداد الـ Renderer
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
            viewerContainer.appendChild(renderer.domElement);

            // إضافة متحكمات الماوس (OrbitControls)
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true; // لإعطاء حركة سلسة

            // 4. إنشاء المجسم (مكعب كمثال)
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            // استخدام مادة تتأثر بالإضاءة
            const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.5 });
            cube = new THREE.Mesh(geometry, material);
            scene.add(cube);

            // إضافة إضاءة للمشهد (ضروري لـ MeshStandardMaterial)
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(5, 10, 7.5);
            scene.add(directionalLight);

            // 5. بدء حلقة الرسوم المتحركة
            animate();

            // 6. التعامل مع تغيير حجم النافذة
            window.addEventListener('resize', () => {
                if (!camera || !renderer) return;
                camera.aspect = viewerContainer.clientWidth / viewerContainer.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
            });

        } catch (error) {
            console.error("حدث خطأ فادح أثناء تهيئة العارض:", error);
            alert("حدث خطأ فادح. يرجى التحقق من الكونسول لمزيد من التفاصيل.");
        }
    }

    function animate() {
        requestAnimationFrame(animate);

        // تحديث دوران المكعب لإعطاء مؤشر بصري بأن الحلقة تعمل
        if (cube) {
            cube.rotation.x += 0.005;
            cube.rotation.y += 0.005;
        }

        if (controls) controls.update(); // تحديث متحكمات الماوس
        if (renderer) renderer.render(scene, camera); // رسم المشهد
    }

    // بدء تشغيل كل شيء
    init();
});

