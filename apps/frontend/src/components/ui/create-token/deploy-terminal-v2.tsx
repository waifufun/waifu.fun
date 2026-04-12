"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface TerminalLine {
	text: string;
	type: "command" | "info" | "success" | "hash" | "link";
	delay: number; // ms from start
}

interface DeployTerminalV2Props {
	agentName: string;
	agentSymbol: string;
	treasuryAddress: string;
	deployedAddress: string | null;
	isComplete: boolean;
}

/* ------------------------------------------------------------------ */
/*  Build lines based on deploy state                                  */
/* ------------------------------------------------------------------ */
function buildLines(
	name: string,
	symbol: string,
	treasury: string,
	deployedAddr: string | null,
	complete: boolean,
): TerminalLine[] {
	const fakeTx = deployedAddr
		? `0x${deployedAddr.slice(2, 10)}...${deployedAddr.slice(-8)}`
		: "0x...";

	const lines: TerminalLine[] = [
		{
			text: "initializing agent deployment...",
			type: "command",
			delay: 0,
		},
		{
			text: `deploying agent token ${name} ($${symbol})...`,
			type: "command",
			delay: 800,
		},
		{
			text: `tx: ${fakeTx}`,
			type: "hash",
			delay: 2000,
		},
		{
			text: "registering with bonding curve...",
			type: "command",
			delay: 3000,
		},
	];

	if (treasury) {
		lines.push({
			text: `setting agent treasury: ${treasury.slice(0, 6)}...${treasury.slice(-4)}`,
			type: "command",
			delay: 4000,
		});
	}

	if (complete) {
		lines.push(
			{
				text: "agent live. bonding curve active.",
				type: "success",
				delay: 5000,
			},
			{
				text: "curve limit: 2,000,000 WAIFU",
				type: "info",
				delay: 5400,
			},
		);

		if (deployedAddr) {
			lines.push({
				text: `[view agent: ${deployedAddr.slice(0, 10)}...]`,
				type: "link",
				delay: 5800,
			});
		}
	}

	return lines;
}

/* ------------------------------------------------------------------ */
/*  Typewriter for a single line                                       */
/* ------------------------------------------------------------------ */
function TypewriterLine({
	text,
	type,
	onComplete,
}: {
	text: string;
	type: TerminalLine["type"];
	onComplete?: (() => void) | undefined;
}) {
	const [displayed, setDisplayed] = useState("");
	const [done, setDone] = useState(false);
	const indexRef = useRef(0);

	useEffect(() => {
		indexRef.current = 0;
		setDisplayed("");
		setDone(false);

		const charDelay = type === "hash" ? 8 : 18;

		const interval = setInterval(() => {
			indexRef.current += 1;
			if (indexRef.current >= text.length) {
				setDisplayed(text);
				setDone(true);
				clearInterval(interval);
				onComplete?.();
			} else {
				setDisplayed(text.slice(0, indexRef.current));
			}
		}, charDelay);

		return () => clearInterval(interval);
	}, [text, type, onComplete]);

	const colorClass = {
		command: "text-[#e4e4e7]",
		info: "text-[#a1a1aa]",
		success: "text-[#00ff87]",
		hash: "text-[#71717a]",
		link: "text-[#00ff87]",
	}[type];

	return (
		<div className="flex items-start gap-2 leading-relaxed">
			<span className="text-[#00ff87] select-none shrink-0">{">"}</span>
			<span className={cn("break-all", colorClass)}>
				{displayed}
				{!done && (
					<span className="inline-block w-[6px] h-[14px] bg-[#00ff87] ml-px animate-pulse align-middle" />
				)}
			</span>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Loading dots between lines                                         */
/* ------------------------------------------------------------------ */
function LoadingDots() {
	return (
		<div className="flex items-center gap-2 pl-5 py-1">
			{[0, 1, 2].map((i) => (
				<motion.span
					key={i}
					className="w-1 h-1 rounded-full bg-[#00ff87]"
					animate={{ opacity: [0.2, 1, 0.2] }}
					transition={{
						duration: 0.8,
						repeat: Number.POSITIVE_INFINITY,
						delay: i * 0.15,
					}}
				/>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Main terminal component                                            */
/* ------------------------------------------------------------------ */
export function DeployTerminalV2({
	agentName,
	agentSymbol,
	treasuryAddress,
	deployedAddress,
	isComplete,
}: DeployTerminalV2Props) {
	const lines = buildLines(
		agentName,
		agentSymbol,
		treasuryAddress,
		deployedAddress,
		isComplete,
	);
	const [visibleCount, setVisibleCount] = useState(0);
	const [currentLineComplete, setCurrentLineComplete] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Staggered reveal of lines based on delay timings
	useEffect(() => {
		if (visibleCount >= lines.length) return;

		const nextLine = lines[visibleCount];
		if (!nextLine) return;
		const prevLine = visibleCount > 0 ? lines[visibleCount - 1] : null;
		const prevDelay = prevLine ? prevLine.delay : 0;
		const wait = nextLine.delay - prevDelay;

		const timer = setTimeout(() => {
			setCurrentLineComplete(false);
			setVisibleCount((c) => c + 1);
		}, Math.max(wait, 200));

		return () => clearTimeout(timer);
	}, [visibleCount, lines, currentLineComplete]);

	// Auto-scroll to bottom
	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [visibleCount, currentLineComplete]);

	const showLoading = visibleCount < lines.length && visibleCount > 0;
	const allDone = isComplete && visibleCount >= lines.length && currentLineComplete;

	return (
		<div className="relative w-full border border-[rgba(255,255,255,0.08)] rounded-sm bg-[#0a0a0c] overflow-hidden">
			{/* scanline overlay */}
			<div
				className="absolute inset-0 pointer-events-none z-10 opacity-[0.03]"
				style={{
					backgroundImage:
						"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,135,0.15) 2px, rgba(0,255,135,0.15) 4px)",
				}}
			/>

			{/* header bar */}
			<div className="flex items-center gap-2 px-4 py-2.5 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(0,255,135,0.02)]">
				<div className="flex gap-1.5">
					<span className="w-2 h-2 rounded-full bg-[#ef4444]/60" />
					<span className="w-2 h-2 rounded-full bg-[#eab308]/60" />
					<span className="w-2 h-2 rounded-full bg-[#00ff87]/60" />
				</div>
				<span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#52525b] ml-2">
					deploy.log
				</span>
				{!allDone && visibleCount > 0 && (
					<motion.span
						className="ml-auto text-[10px] font-mono uppercase tracking-[0.12em] text-[#eab308]"
						animate={{ opacity: [0.5, 1, 0.5] }}
						transition={{
							duration: 1.2,
							repeat: Number.POSITIVE_INFINITY,
						}}
					>
						deploying
					</motion.span>
				)}
				{allDone && (
					<span className="ml-auto text-[10px] font-mono uppercase tracking-[0.12em] text-[#00ff87]">
						complete
					</span>
				)}
			</div>

			{/* terminal body */}
			<div
				ref={containerRef}
				className="p-4 font-mono text-sm space-y-1.5 min-h-[180px] max-h-[320px] overflow-y-auto"
			>
				<AnimatePresence mode="popLayout">
					{lines.slice(0, visibleCount).map((line, i) => (
						<motion.div
							key={`${line.text}-${i}`}
							initial={{ opacity: 0, x: -8 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{
								duration: 0.25,
								ease: [0.25, 1, 0.5, 1],
							}}
						>
							<TypewriterLine
								text={line.text}
								type={line.type}
								{...(i === visibleCount - 1
									? { onComplete: () => setCurrentLineComplete(true) }
									: {}
								)}
							/>
						</motion.div>
					))}
				</AnimatePresence>

				{showLoading && currentLineComplete && <LoadingDots />}
			</div>

			{/* progress glow at bottom */}
			{!allDone && visibleCount > 0 && (
				<motion.div
					className="h-px w-full"
					style={{
						background:
							"linear-gradient(90deg, transparent, #00ff87, transparent)",
					}}
					animate={{ opacity: [0.3, 0.8, 0.3] }}
					transition={{
						duration: 1.5,
						repeat: Number.POSITIVE_INFINITY,
					}}
				/>
			)}

			{/* success state bottom bar */}
			{allDone && (
				<motion.div
					className="h-1 w-full bg-[#00ff87]"
					initial={{ scaleX: 0 }}
					animate={{ scaleX: 1 }}
					transition={{
						duration: 0.6,
						ease: [0.25, 1, 0.5, 1],
					}}
					style={{ transformOrigin: "left" }}
				/>
			)}
		</div>
	);
}
