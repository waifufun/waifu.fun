"use client";

import { useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import "./gradientWaveMaterial";

function ShaderPlane() {
	const matRef = useRef<THREE.ShaderMaterial>(null);
	const mouseRaw = useRef(new THREE.Vector2(0.5, 0.5));
	const mouseSmooth = useRef(new THREE.Vector2(0.5, 0.5));
	const mouseVel = useRef(new THREE.Vector2(0, 0));
	const velSmooth = useRef(new THREE.Vector2(0, 0));
	const clickPos = useRef(new THREE.Vector2(0.5, 0.5));
	const clickTime = useRef(100);
	const fallbackTime = useRef(0);

	useEffect(() => {
		const onMove = (e: PointerEvent) => {
			mouseRaw.current.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
		};
		const onDown = (e: PointerEvent) => {
			clickPos.current.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
			clickTime.current = 0;
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerdown", onDown);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerdown", onDown);
		};
	}, []);

	useFrame((state, delta) => {
		const mat = matRef.current;
		if (!mat) return;
		const clock = state?.clock;
		const elapsedTime =
			typeof clock?.elapsedTime === "number" ? clock.elapsedTime : (fallbackTime.current += delta);
		const gl = state?.gl?.domElement;

		mat.uniforms.uTime.value = elapsedTime;
		mat.uniforms.uResolution.value.set(gl?.clientWidth ?? 1, gl?.clientHeight ?? 1);
		mat.uniforms.uClickPos.value.copy(clickPos.current);

		const prev = mouseSmooth.current.clone();
		mouseSmooth.current.lerp(mouseRaw.current, 0.08);
		mat.uniforms.uMouse.value.copy(mouseSmooth.current);

		const safeDelta = Math.max(delta, 0.001);
		mouseVel.current.set(
			(mouseSmooth.current.x - prev.x) / safeDelta,
			(mouseSmooth.current.y - prev.y) / safeDelta,
		);
		velSmooth.current.lerp(mouseVel.current, 0.1);
		mat.uniforms.uMouseVel.value.copy(velSmooth.current);

		clickTime.current += delta;
		mat.uniforms.uClickTime.value = clickTime.current;
	});

	return (
		<mesh>
			<planeGeometry args={[2, 2]} />
			{/* @ts-expect-error custom extended element */}
			<gradientWaveMaterial ref={matRef} />
		</mesh>
	);
}

export default function ShaderBackground() {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	if (!mounted) return null;

	return (
		<div className="fixed inset-0 z-0 pointer-events-none">
			<Canvas
				orthographic
				camera={{ position: [0, 0, 1] }}
				dpr={[1, 1.5]}
				gl={{ alpha: false, antialias: false }}
				style={{ pointerEvents: "auto" }}
			>
				<ShaderPlane />
			</Canvas>
		</div>
	);
}
