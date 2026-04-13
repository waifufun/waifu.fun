"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, useMotionValueEvent, useScroll, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import SearchMenu from "./search-menu";
import HeaderConnectWallet from "./header-connect-wallet";
import HeaderSignIn from "./header-sign-in";
import { HowItWorksModal } from "./how-it-works-modal";
import LanguageSwitcher from "./language-switcher";
import { useTranslation } from "@/contexts/locale-context";

const HOW_IT_WORKS_SEEN_KEY = "waifu_how_it_works_seen";

const NAV_LINKS = [
	{ href: "/#explore", labelKey: "nav.explore" },
	{ href: "/create", labelKey: "nav.create" },
	{ href: "/stake", labelKey: "nav.stake" },
	{ href: "/litepaper", labelKey: "nav.story" },
] as const;

export default function Header() {
	const { t } = useTranslation();
	const pathname = usePathname();
	const [scrolled, setScrolled] = useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [howItWorksOpen, setHowItWorksOpen] = useState(false);
	const { scrollY } = useScroll();
	const { isConnected } = useAccount();

	const isLitepaper = pathname === "/litepaper" || pathname?.startsWith("/litepaper/");

	useMotionValueEvent(scrollY, "change", (latest) => {
		setScrolled(latest > 20);
	});

	// Show "how it works" modal automatically on first login
	// NOTE: this useEffect MUST stay above any early returns to avoid React hooks order violation
	useEffect(() => {
		if (isLitepaper) return;
		if (!isConnected || typeof window === "undefined") return;
		const seen = localStorage.getItem(HOW_IT_WORKS_SEEN_KEY);
		if (seen) return;
		localStorage.setItem(HOW_IT_WORKS_SEEN_KEY, "true");
		setHowItWorksOpen(true);
	}, [isConnected, isLitepaper]);

	if (isLitepaper) return null;

	return (
		<motion.header
			initial={{ opacity: 0, y: -10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
			className="shrink-0 w-full sticky top-0 z-50"
			style={{
				background: scrolled ? "rgba(8, 8, 10, 0.92)" : "rgba(8, 8, 10, 0.85)",
				backdropFilter: "blur(20px)",
				WebkitBackdropFilter: "blur(20px)",
				borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
				boxShadow: scrolled ? "0 4px 24px rgba(0, 255, 135, 0.04), 0 1px 0 rgba(0, 255, 135, 0.06)" : "none",
				transition: "background 0.3s ease, box-shadow 0.4s ease",
			}}
		>
			<div className="w-full h-[60px] flex items-center justify-between gap-4 px-4 sm:px-6">
				{/* Left: Logo + Nav */}
				<div className="flex items-center gap-8 min-w-0">
					<Link href="/" className="shrink-0 flex items-center" aria-label={t("nav.homeAria")}>
						<Image
							src="/brand/icon/icon_128.png"
							alt="waifu.fun"
							width={28}
							height={30}
							priority
							className="h-7 w-auto object-contain sm:hidden"
							unoptimized
						/>
						<Image
							src="/brand/lockup/lockup_waifufun_256.png"
							alt="waifu.fun"
							width={256}
							height={121}
							priority
							className="hidden h-auto w-[138px] object-contain sm:block"
							unoptimized
						/>
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
							{t("nav.howItWorks")}
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
								{t(link.labelKey)}
							</Link>
						))}
					</nav>
				</div>

				<HowItWorksModal open={howItWorksOpen} onOpenChange={setHowItWorksOpen} controlled />

				{/* Right: Language + Search + Wallet + Mobile Menu Button */}
				<div className="flex items-center gap-3 shrink-0">
					<LanguageSwitcher />
					<SearchMenu />
					<div className="hidden lg:flex items-center gap-2">
						<HeaderSignIn />
						<HeaderConnectWallet />
					</div>
					{/* Mobile hamburger button */}
					<button
						type="button"
						className="lg:hidden flex flex-col justify-center items-center w-10 h-10 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(17,17,20,0.4)]"
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
						aria-label={t("common.toggleMenu")}
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
								{t("nav.howItWorks")}
							</button>
							{NAV_LINKS.map((link) => (
								<Link
									key={link.href}
									href={link.href}
									className="text-sm font-medium py-3 px-4 rounded-sm transition-colors duration-200 hover:bg-[rgba(0,255,135,0.08)]"
									style={{ color: "#e4e4e7" }}
									onClick={() => setMobileMenuOpen(false)}
								>
									{t(link.labelKey)}
								</Link>
							))}
							<div className="pt-2 mt-2 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-2">
								<HeaderSignIn />
								<HeaderConnectWallet />
							</div>
						</nav>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.header>
	);
}
