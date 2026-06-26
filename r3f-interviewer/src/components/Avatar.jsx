import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { viseme } from '../lib/speech.js';

// Renders any glTF/GLB head with ARKit blendshapes, auto-frames the head, drives mouth + blink,
// and shows a concerned expression when viseme.mood === 'concern'.
export default function Avatar({ url }) {
  const { scene } = useGLTF(url);
  const camera = useThree((s) => s.camera);
  const meshes = useRef([]);
  const blink = useRef({ value: 0, next: 2 });

  useEffect(() => {
    const m = [];
    scene.traverse((o) => { if (o.isMesh && o.morphTargetDictionary) m.push(o); });
    meshes.current = m;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const head = new THREE.Vector3(center.x, box.max.y - size.y * 0.15, center.z);
    const dist = Math.max(size.y, 0.25) * 1.05 + 0.15;
    camera.position.set(head.x, head.y, head.z + dist);
    camera.near = Math.max(dist / 100, 0.01);
    camera.far = dist * 100;
    camera.lookAt(head);
    camera.updateProjectionMatrix();
  }, [scene, camera]);

  useFrame((_, dt) => {
    const b = blink.current;
    b.next -= dt;
    if (b.next <= 0) { b.value = 1; if (b.next < -0.12) { b.value = 0; b.next = 2 + Math.random() * 3.5; } }
    const open = viseme.open || 0;
    const concern = viseme.mood === 'concern' ? 0.6 : 0;
    const OPEN = ['jawOpen', 'mouthOpen', 'viseme_aa', 'viseme_O', 'viseme_E', 'mouthFunnel'];
    const BLINK = ['eyeBlinkLeft', 'eyeBlinkRight', 'eyesClosed', 'blink'];
    const CONCERN = ['browDownLeft', 'browDownRight', 'browInnerUp', 'mouthFrownLeft', 'mouthFrownRight'];
    for (const mesh of meshes.current) {
      const d = mesh.morphTargetDictionary, infl = mesh.morphTargetInfluences;
      const set = (name, v) => { const i = d[name]; if (i !== undefined) infl[i] = v; };
      OPEN.forEach((n) => set(n, open));
      BLINK.forEach((n) => set(n, b.value));
      CONCERN.forEach((n) => set(n, concern));
    }
  });

  return <primitive object={scene} />;
}
