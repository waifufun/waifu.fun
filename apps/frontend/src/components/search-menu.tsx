"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "./ui/input";

const PLACEHOLDER = "search agents by name, ticker, or contract...";

export default function SearchMenu() {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const [triggerHover, setTriggerHover] = useState(false);
	const pathname = usePathname();
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (pathname) setValue("");
	}, [pathname]);

	useEffect(() => {
		if (!open) return;
		setValue("");
		const t = setTimeout(() => inputRef.current?.focus(), 50);
		return () => clearTimeout(t);
	}, [open]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((o) => !o);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="hidden md:flex items-center gap-2 w-[320px] xl:w-[400px] h-10 rounded-sm text-left px-3 transition-all duration-200"
					style={{
						background: "#111114",
						border: triggerHover ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(255, 255, 255, 0.06)",
						color: "#71717a",
					}}
					onMouseEnter={() => setTriggerHover(true)}
					onMouseLeave={() => setTriggerHover(false)}
					aria-label="Search"
				>
					<Search className="size-4 shrink-0" style={{ color: "#71717a" }} />
					<span className="flex-1 truncate text-sm font-medium">{PLACEHOLDER}</span>
					<span
						className="flex items-center gap-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
						style={{
							background: "rgba(255, 255, 255, 0.06)",
							color: "#52525b",
						}}
					>
						<Command className="size-3" />K
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				onOpenAutoFocus={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => e.preventDefault()}
				align="start"
				sideOffset={8}
				className="w-[90vw] max-w-2xl p-0 overflow-hidden rounded-sm shadow-2xl"
				style={{
					background: "#111114",
					border: "1px solid rgba(255, 255, 255, 0.06)",
					backdropFilter: "blur(20px)",
					WebkitBackdropFilter: "blur(20px)",
				}}
			>
				{/* Search input inside card */}
				<div className="flex items-center gap-2 p-4" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
					<Search className="size-4 shrink-0" style={{ color: "#71717a" }} />
					<Input
						ref={inputRef}
						placeholder={PLACEHOLDER}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						disabled
						className="flex-1 h-10 rounded-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0 opacity-60"
						style={{
							background: "#0e0e12",
							border: "1px solid rgba(255, 255, 255, 0.06)",
							color: "#e4e4e7",
						}}
						autoComplete="off"
					/>
					<span
						className="hidden sm:inline-flex items-center gap-0.5 rounded-sm px-1.5 py-1 text-xs font-medium"
						style={{
							background: "rgba(255, 255, 255, 0.06)",
							color: "#52525b",
						}}
					>
						<Command className="size-3" />K
					</span>
				</div>

				{/* Body: honest "coming soon" */}
				<div className="min-h-[240px] px-6 py-10 flex flex-col items-center justify-center text-center gap-3">
					<span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-sm border border-[rgba(0,255,135,0.18)] bg-[rgba(0,255,135,0.04)] font-mono text-[10px] uppercase tracking-[0.24em] text-[#00ff87]">
						<span className="w-1 h-1 rounded-full bg-[#00ff87] animate-pulse" />
						coming soon
					</span>
					<p className="text-sm text-[#a1a1aa] max-w-sm leading-relaxed">
						agent search is wiring up. for now, browse the directory.
					</p>
					<a
						href="/agents"
						className="mt-2 inline-flex items-center gap-2 h-9 px-4 rounded-sm text-[11px] font-mono uppercase tracking-[0.18em] bg-[#00ff87] text-[#08080a] hover:bg-[#00ff87]/90 transition-colors"
						onClick={() => setOpen(false)}
					>
						browse agents
					</a>
				</div>
			</PopoverContent>
		</Popover>
	);
}
