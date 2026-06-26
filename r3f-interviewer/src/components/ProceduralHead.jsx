import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { viseme } from '../lib/speech.js';

// Self-contained 3D head (R3F primitives) — always renders. Lip-syncs from viseme.open,
// blinks, and shows a concerned brow when viseme.mood === 'concern'.
export default function ProceduralHead() {
  const head = useRef();
  const mouth = useRef();
  const eyeL = useRef();
  const eyeR = useRef();
  const browL = useRef();
  const browR = useRef();
  const blink = useRef({ next: 2 });
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    camera.position.set(0, 0.15, 3.4);
    camera.near = 0.1; camera.far = 100;
    camera.lookAt(0, 0.05, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (head.current) head.current.rotation.y = Math.sin(t / 2.2) * 0.12;
    const open = Math.max(0.05, viseme.open || 0);
    if (mouth.current) mouth.current.scale.y = 0.06 + open * 0.95;
    const b = blink.current; b.next -= dt;
    let s = 1;
    if (b.next <= 0) { s = 0.1; if (b.next < -0.12) b.next = 2 + Math.random() * 3; }
    if (eyeL.current) eyeL.current.scale.y = s;
    if (eyeR.current) eyeR.current.scale.y = s;
    const concern = viseme.mood === 'concern';
    if (browL.current) { browL.current.rotation.z = concern ? -0.32 : 0.08; browL.current.position.y = concern ? 0.30 : 0.36; }
    if (browR.current) { browR.current.rotation.z = concern ? 0.32 : -0.08; browR.current.position.y = concern ? 0.30 : 0.36; }
  });

  return (
    <group ref={head}>
      <mesh><sphereGeometry args={[1, 48, 48]} /><meshStandardMaterial color="#f0c49b" roughness={0.65} /></mesh>
      <mesh position={[0, 0.08, -0.04]} scale={[1.05, 1.05, 1.05]}>
        <sphereGeometry args={[1, 48, 48, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color="#3a2417" roughness={0.85} />
      </mesh>
      <group ref={eyeL} position={[-0.33, 0.12, 0.84]}>
        <mesh><sphereGeometry args={[0.17, 24, 24]} /><meshStandardMaterial color="#ffffff" /></mesh>
        <mesh position={[0, 0, 0.12]}><sphereGeometry args={[0.075, 16, 16]} /><meshStandardMaterial color="#2a1a0e" /></mesh>
      </group>
      <group ref={eyeR} position={[0.33, 0.12, 0.84]}>
        <mesh><sphereGeometry args={[0.17, 24, 24]} /><meshStandardMaterial color="#ffffff" /></mesh>
        <mesh position={[0, 0, 0.12]}><sphereGeometry args={[0.075, 16, 16]} /><meshStandardMaterial color="#2a1a0e" /></mesh>
      </group>
      <mesh ref={browL} position={[-0.33, 0.36, 0.9]} rotation={[0, 0, 0.08]}><boxGeometry args={[0.32, 0.06, 0.06]} /><meshStandardMaterial color="#3a2417" /></mesh>
      <mesh ref={browR} position={[0.33, 0.36, 0.9]} rotation={[0, 0, -0.08]}><boxGeometry args={[0.32, 0.06, 0.06]} /><meshStandardMaterial color="#3a2417" /></mesh>
      <mesh position={[0, -0.05, 1.0]}><sphereGeometry args={[0.12, 16, 16]} /><meshStandardMaterial color="#e7b385" /></mesh>
      <mesh ref={mouth} position={[0, -0.45, 0.9]}><boxGeometry args={[0.44, 0.16, 0.1]} /><meshStandardMaterial color="#7a2e36" /></mesh>
      <mesh position={[0, -1.85, 0]}><cylinderGeometry args={[1.05, 1.35, 0.9, 32]} /><meshStandardMaterial color="#2e5a86" roughness={0.8} /></mesh>
    </group>
  );
}
