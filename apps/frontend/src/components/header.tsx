"use client";

import { useTranslation } from "@/contexts/locale-context";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import AdminNavLink from "./admin/admin-nav-link";
import HeaderAuth from "./header-auth";
import LanguageSwitcher from "./language-switcher";
import SearchMenu from "./search-menu";

const NAV_LINKS = [
	{ href: "/agents", labelKey: "nav.agents" },
	{ href: "/launches", labelKey: "nav.launches" },
	{ href: "/patron/portfolio", labelKey: "nav.portfolio" },
	{ href: "/leaderboard", labelKey: "nav.leaderboard" },
	{ href: "/litepaper", labelKey: "nav.docs" },
] as const;

export default function Header() {
	const { t } = useTranslation();
	const pathname = usePathname();
	const [scrolled, setScrolled] = useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const { scrollY } = useScroll();

	const isLitepaper = pathname === "/litepaper" || pathname?.startsWith("/litepaper/");
	const isStewardCallback = pathname?.startsWith("/auth/steward/");

	useMotionValueEvent(scrollY, "change", (latest) => {
		setScrolled(latest > 20);
	});

	if (isLitepaper || isStewardCallback) return null;

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
					<nav className="hidden min-[1400px]:flex items-center gap-6">
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
						<AdminNavLink />
					</nav>
				</div>

				{/* Right: Language + Search + Launch Agent + Wallet + Mobile Menu Button */}
				<div className="flex items-center gap-3 shrink-0">
					<LanguageSwitcher />
					<SearchMenu />
					<Link
						href="/give-skill"
						className="hidden md:inline-flex items-center gap-1.5 h-[38px] min-h-[38px] max-h-[38px] rounded-sm border border-[rgba(0,255,135,0.3)] bg-[rgba(0,255,135,0.06)] px-4 font-mono text-[11px] uppercase tracking-[0.16em] text-[#00ff87] hover:bg-[rgba(0,255,135,0.12)] hover:border-[rgba(0,255,135,0.45)] transition-colors duration-200"
					>
						{t("nav.launchAgent")}
					</Link>
					<div className="hidden min-[1400px]:flex items-center gap-2">
						<HeaderAuth />
					</div>
					{/* Mobile hamburger button */}
					<button
						type="button"
						className="min-[1400px]:hidden flex flex-col justify-center items-center w-10 h-10 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(17,17,20,0.4)]"
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
						className="min-[1400px]:hidden absolute top-[60px] left-0 right-0 border-b border-[rgba(255,255,255,0.06)]"
						style={{
							background: "rgba(8, 8, 10, 0.95)",
							backdropFilter: "blur(20px)",
							WebkitBackdropFilter: "blur(20px)",
						}}
					>
						<nav className="flex flex-col p-4 gap-2">
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
							<AdminNavLink
								className="text-sm font-mono uppercase tracking-wider py-3 px-4 rounded-sm text-red-300 hover:bg-red-500/10"
								onNavigate={() => setMobileMenuOpen(false)}
							/>
							<Link
								href="/give-skill"
								onClick={() => setMobileMenuOpen(false)}
								className="text-sm font-mono uppercase tracking-wider py-3 px-4 rounded-sm text-[#00ff87] bg-[rgba(0,255,135,0.06)] hover:bg-[rgba(0,255,135,0.12)] transition-colors duration-200"
							>
								{t("nav.launchAgent")}
							</Link>
							<div className="pt-2 mt-2 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-2">
								<HeaderAuth />
							</div>
						</nav>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.header>
	);
}
