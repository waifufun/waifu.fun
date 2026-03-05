"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, useMotionValueEvent, useScroll, AnimatePresence } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import SearchMenu from "./search-menu";
import HeaderConnectWallet from "./header-connect-wallet";
import { HowItWorksModal } from "./how-it-works-modal";

const HOW_IT_WORKS_SEEN_KEY = "waifu_how_it_works_seen";

const NAV_LINKS = [
	{ href: "/#explore", label: "explore" },
	{ href: "/create", label: "create" },
	{ href: "/story", label: "story" },
];

export default function Header() {
	const [logoHover, setLogoHover] = useState(false);
	const [scrolled, setScrolled] = useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [howItWorksOpen, setHowItWorksOpen] = useState(false);
	const { scrollY } = useScroll();
	const wallet = useWallet();

	useMotionValueEvent(scrollY, "change", (latest) => {
		setScrolled(latest > 20);
	});

	// Show "how it works" modal automatically on first login
	useEffect(() => {
		if (!wallet.connected || typeof window === "undefined") return;
		const seen = localStorage.getItem(HOW_IT_WORKS_SEEN_KEY);
		if (seen) return;
		localStorage.setItem(HOW_IT_WORKS_SEEN_KEY, "true");
		setHowItWorksOpen(true);
	}, [wallet.connected]);

	return (
		<motion.header
			initial={{ opacity: 0, y: -10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
			className="shrink-0 w-full sticky top-0 z-50"
			style={{
				background: scrolled
					? "rgba(8, 8, 10, 0.92)"
					: "rgba(8, 8, 10, 0.85)",
				backdropFilter: "blur(20px)",
				WebkitBackdropFilter: "blur(20px)",
				borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
				boxShadow: scrolled
					? "0 4px 24px rgba(0, 255, 135, 0.04), 0 1px 0 rgba(0, 255, 135, 0.06)"
					: "none",
				transition: "background 0.3s ease, box-shadow 0.4s ease",
			}}
		>
			<div className="w-full h-[60px] flex items-center justify-between gap-4 px-4 sm:px-6">
				{/* Left: Logo + Nav */}
				<div className="flex items-center gap-8 min-w-0">
					<Link
						href="/"
						className="shrink-0 font-bold text-xl tracking-tight transition-all duration-200"
						style={{
							color: "#e4e4e7",
							textShadow: logoHover ? "0 0 12px rgba(0, 255, 135, 0.4)" : "none",
						}}
						onMouseEnter={() => setLogoHover(true)}
						onMouseLeave={() => setLogoHover(false)}
						aria-label="waifu.fun home"
					>
						waifu.fun
					</Link>

					{/* Nav links - hidden on mobile */}
					<nav className="hidden lg:flex items-center gap-6">
						<button
							type="button"
							className="text-sm font-medium transition-colors duration-200"
							style={{ color: "#71717a" }}
							onMouseEnter={(e) => {
								e.currentTarget.style.color = "#e4e4e7";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = "#71717a";
							}}
							onClick={() => setHowItWorksOpen(true)}
						>
							how it works
						</button>
						{NAV_LINKS.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className="text-sm font-medium transition-colors duration-200"
								style={{ color: "#71717a" }}
								onMouseEnter={(e) => {
									e.currentTarget.style.color = "#e4e4e7";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.color = "#71717a";
								}}
							>
								{link.label}
							</Link>
						))}
					</nav>
				</div>

				<HowItWorksModal
					open={howItWorksOpen}
					onOpenChange={setHowItWorksOpen}
					controlled
				/>

				{/* Right: Search + Wallet + Mobile Menu Button */}
				<div className="flex items-center gap-3 shrink-0">
					<SearchMenu />
					<div className="hidden lg:block">
						<HeaderConnectWallet />
					</div>
					{/* Mobile hamburger button */}
					<button
						type="button"
						className="lg:hidden flex flex-col justify-center items-center w-10 h-10 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(17,17,20,0.4)]"
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
						aria-label="Toggle menu"
					>
						<span
							className="block w-5 h-0.5 bg-[#e4e4e7] transition-transform duration-200"
							style={{
								transform: mobileMenuOpen ? "rotate(45deg) translateY(3px)" : "none",
							}}
						/>
						<span
							className="block w-5 h-0.5 bg-[#e4e4e7] my-1 transition-opacity duration-200"
							style={{ opacity: mobileMenuOpen ? 0 : 1 }}
						/>
						<span
							className="block w-5 h-0.5 bg-[#e4e4e7] transition-transform duration-200"
							style={{
								transform: mobileMenuOpen ? "rotate(-45deg) translateY(-3px)" : "none",
							}}
						/>
					</button>
				</div>
			</div>

			{/* Mobile dropdown menu */}
			<AnimatePresence>
				{mobileMenuOpen && (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
						className="lg:hidden absolute top-[60px] left-0 right-0 border-b border-[rgba(255,255,255,0.06)]"
						style={{
							background: "rgba(8, 8, 10, 0.95)",
							backdropFilter: "blur(20px)",
							WebkitBackdropFilter: "blur(20px)",
						}}
					>
						<nav className="flex flex-col p-4 gap-2">
							<button
								type="button"
								className="text-sm font-medium py-3 px-4 rounded-sm transition-colors duration-200 hover:bg-[rgba(0,255,135,0.08)] text-left"
								style={{ color: "#e4e4e7" }}
								onClick={() => {
									setHowItWorksOpen(true);
									setMobileMenuOpen(false);
								}}
							>
								how it works
							</button>
							{NAV_LINKS.map((link) => (
								<Link
									key={link.href}
									href={link.href}
									className="text-sm font-medium py-3 px-4 rounded-sm transition-colors duration-200 hover:bg-[rgba(0,255,135,0.08)]"
									style={{ color: "#e4e4e7" }}
									onClick={() => setMobileMenuOpen(false)}
								>
									{link.label}
								</Link>
							))}
							<div className="pt-2 mt-2 border-t border-[rgba(255,255,255,0.06)]">
								<HeaderConnectWallet />
							</div>
						</nav>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.header>
	);
}
