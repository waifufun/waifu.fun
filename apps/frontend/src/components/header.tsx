"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import SearchMenu from "./search-menu";
import HeaderConnectWallet from "./header-connect-wallet";

const NAV_LINKS = [
	{ href: "/", label: "explore" },
	{ href: "/create", label: "create" },
	{ href: "/#how-it-works", label: "how it works" },
];

export default function Header() {
	const [logoHover, setLogoHover] = useState(false);
	const [scrolled, setScrolled] = useState(false);
	const { scrollY } = useScroll();

	useMotionValueEvent(scrollY, "change", (latest) => {
		setScrolled(latest > 20);
	});

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
					? "0 4px 24px rgba(139, 92, 246, 0.06), 0 1px 0 rgba(139, 92, 246, 0.08)"
					: "none",
				transition: "background 0.3s ease, box-shadow 0.4s ease",
			}}
		>
			<div className="w-full h-[60px] flex items-center justify-between gap-4 px-4 max-w-7xl mx-auto">
				{/* Left: Logo + Nav */}
				<div className="flex items-center gap-8 min-w-0">
					<Link
						href="/"
						className="shrink-0 font-bold text-xl tracking-tight transition-all duration-200"
						style={{
							color: "#e4e4e7",
							textShadow: logoHover ? "0 0 12px rgba(139, 92, 246, 0.5)" : "none",
						}}
						onMouseEnter={() => setLogoHover(true)}
						onMouseLeave={() => setLogoHover(false)}
						aria-label="waifu.fun home"
					>
						waifu.fun
					</Link>

					{/* Nav links - hidden on mobile */}
					<nav className="hidden lg:flex items-center gap-6">
						{NAV_LINKS.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className="text-sm font-medium transition-colors duration-200"
								style={{ color: "#71717a" }}
								onMouseEnter={(e) => (e.currentTarget.style.color = "#e4e4e7")}
								onMouseLeave={(e) => (e.currentTarget.style.color = "#71717a")}
							>
								{link.label}
							</Link>
						))}
					</nav>
				</div>

				{/* Right: Search + Wallet */}
				<div className="flex items-center gap-3 shrink-0">
					<SearchMenu />
					<HeaderConnectWallet />
				</div>
			</div>
		</motion.header>
	);
}
