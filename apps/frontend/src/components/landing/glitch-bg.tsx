"use client";

import { useRef, useEffect } from "react";

interface GlitchBgProps {
	glitchColors?: string[];
	glitchSpeed?: number;
	smooth?: boolean;
	characters?: string;
	className?: string;
}

export default function GlitchBg({
	glitchColors = ["#0a1a12", "#00ff87", "#0d2818"],
	glitchSpeed = 70,
	smooth = true,
	characters = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン01",
	className = "",
}: GlitchBgProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const animationRef = useRef<number | null>(null);
	const letters = useRef<
		{ char: string; color: string; targetColor: string; colorProgress: number }[]
	>([]);
	const grid = useRef({ columns: 0, rows: 0 });
	const context = useRef<CanvasRenderingContext2D | null>(null);
	const lastGlitchTime = useRef(Date.now());

	const chars = Array.from(characters);
	const fontSize = 14;
	const charWidth = 9;
	const charHeight = 18;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		context.current = canvas.getContext("2d");

		const getRandomChar = (): string => chars[Math.floor(Math.random() * chars.length)] ?? "0";
		const getRandomColor = (): string => glitchColors[Math.floor(Math.random() * glitchColors.length)] ?? "#0a1a12";

		const hexToRgb = (hex: string) => {
			const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
				hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (_, r, g, b) => r + r + g + g + b + b)
			);
			return match
				? { r: parseInt(match[1] ?? "0", 16), g: parseInt(match[2] ?? "0", 16), b: parseInt(match[3] ?? "0", 16) }
				: null;
		};

		const interpolateColor = (
			s: { r: number; g: number; b: number },
			e: { r: number; g: number; b: number },
			f: number
		) => {
			const r = Math.round(s.r + (e.r - s.r) * f);
			const g = Math.round(s.g + (e.g - s.g) * f);
			const b = Math.round(s.b + (e.b - s.b) * f);
			return `rgb(${r},${g},${b})`;
		};

		const resizeCanvas = () => {
			const parent = canvas.parentElement;
			if (!parent) return;
			const dpr = Math.min(window.devicePixelRatio, 2);
			const rect = parent.getBoundingClientRect();
			canvas.width = rect.width * dpr;
			canvas.height = rect.height * dpr;
			canvas.style.width = `${rect.width}px`;
			canvas.style.height = `${rect.height}px`;
			if (context.current) context.current.setTransform(dpr, 0, 0, dpr, 0, 0);

			const columns = Math.ceil(rect.width / charWidth);
			const rows = Math.ceil(rect.height / charHeight);
			grid.current = { columns, rows };
			letters.current = Array.from({ length: columns * rows }, () => ({
				char: getRandomChar(),
				color: getRandomColor(),
				targetColor: getRandomColor(),
				colorProgress: 1,
			}));
		};

		const draw = () => {
			const ctx = context.current;
			if (!ctx || letters.current.length === 0) return;
			const { width, height } = canvas.getBoundingClientRect();
			ctx.clearRect(0, 0, width, height);
			ctx.font = `${fontSize}px monospace`;
			ctx.textBaseline = "top";
			for (let i = 0; i < letters.current.length; i++) {
				const l = letters.current[i];
				if (!l) continue;
				const x = (i % grid.current.columns) * charWidth;
				const y = Math.floor(i / grid.current.columns) * charHeight;
				ctx.fillStyle = l.color;
				ctx.fillText(l.char, x, y);
			}
		};

		const update = () => {
			const count = Math.max(1, Math.floor(letters.current.length * 0.04));
			for (let i = 0; i < count; i++) {
				const idx = Math.floor(Math.random() * letters.current.length);
				const l = letters.current[idx];
				if (!l) continue;
				l.char = getRandomChar();
				l.targetColor = getRandomColor();
				if (!smooth) {
					l.color = l.targetColor;
					l.colorProgress = 1;
				} else {
					l.colorProgress = 0;
				}
			}
		};

		const smoothTransitions = () => {
			let dirty = false;
			for (const l of letters.current) {
				if (l.colorProgress < 1) {
					l.colorProgress = Math.min(l.colorProgress + 0.05, 1);
					const s = hexToRgb(l.color);
					const e = hexToRgb(l.targetColor);
					if (s && e) {
						l.color = interpolateColor(s, e, l.colorProgress);
						dirty = true;
					}
				}
			}
			if (dirty) draw();
		};

		const animate = () => {
			const now = Date.now();
			if (now - lastGlitchTime.current >= glitchSpeed) {
				update();
				draw();
				lastGlitchTime.current = now;
			}
			if (smooth) smoothTransitions();
			animationRef.current = requestAnimationFrame(animate);
		};

		resizeCanvas();
		animate();

		let resizeTimeout: ReturnType<typeof setTimeout>;
		const handleResize = () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				if (animationRef.current) cancelAnimationFrame(animationRef.current);
				resizeCanvas();
				animate();
			}, 100);
		};
		window.addEventListener("resize", handleResize);

		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current);
			window.removeEventListener("resize", handleResize);
		};
	}, [glitchSpeed, smooth, chars, glitchColors]);

	return (
		<div className={`relative w-full h-full overflow-hidden ${className}`}>
			<canvas ref={canvasRef} className="block w-full h-full" />
			{/* Outer vignette */}
			<div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,rgba(0,0,0,0)_40%,rgba(8,8,10,1)_100%)]" />
			{/* Top/bottom fade */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					background: "linear-gradient(180deg, rgba(8,8,10,0.6) 0%, rgba(8,8,10,0.2) 30%, rgba(8,8,10,0.2) 70%, rgba(8,8,10,0.8) 100%)",
				}}
			/>
		</div>
	);
}
