import { ImageResponse } from "next/og";

// Keep matching the working root /opengraph-image config.
export const runtime = "nodejs";
export const contentType = "image/png";
export const alt = "waifu.fun — autonomous agent";
export const size = {
	width: 1200,
	height: 630,
};

const GREEN = "#22c55e";
const GREEN_GLOW = "#00ff87";

/**
 * Per-agent OG image. Kept intentionally self-contained (no fetches, no
 * third-party assets) because pulling anything from the app module graph
 * triggers wagmi/viem -> indexedDB errors in the OG runtime.
 *
 * TODO: once wagmi providers can be hoisted out of the shared layout,
 * this can read agent details (name, ticker, avatar, EIP-8004 id) from
 * the v2 API and render a personalized card. For now, the generic
 * 'autonomous agent on waifu.fun' card renders for every agent page.
 */
export default function Image() {
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				background: "#000",
				color: "#fff",
				position: "relative",
				overflow: "hidden",
			}}
		>
			{/* layered gradients */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					background:
						"radial-gradient(ellipse 80% 60% at 30% 20%, rgba(34,197,94,0.18) 0%, transparent 55%), radial-gradient(ellipse 70% 60% at 80% 90%, rgba(139,92,246,0.16) 0%, transparent 60%), #000",
					display: "flex",
				}}
			/>
			{/* glitch grid */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					backgroundImage:
						"linear-gradient(rgba(34,197,94,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.035) 1px, transparent 1px)",
					backgroundSize: "80px 80px",
					display: "flex",
				}}
			/>
			{/* scanlines */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					backgroundImage:
						"repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 4px)",
					display: "flex",
				}}
			/>

			{/* corner marks */}
			<div style={{ position: "absolute", top: 36, left: 36, display: "flex" }}>
				<span
					style={{
						width: 10,
						height: 10,
						background: GREEN_GLOW,
						boxShadow: `0 0 20px ${GREEN_GLOW}`,
						display: "flex",
					}}
				/>
			</div>
			<div style={{ position: "absolute", top: 40, right: 36, display: "flex", gap: 6 }}>
				<span style={{ width: 26, height: 2, background: "rgba(34,197,94,0.5)", display: "flex" }} />
				<span style={{ width: 12, height: 2, background: "rgba(34,197,94,0.25)", display: "flex" }} />
			</div>
			<div style={{ position: "absolute", bottom: 40, right: 36, display: "flex", gap: 6 }}>
				<span style={{ width: 12, height: 2, background: "rgba(34,197,94,0.25)", display: "flex" }} />
				<span style={{ width: 26, height: 2, background: "rgba(34,197,94,0.5)", display: "flex" }} />
			</div>

			{/* content */}
			<div
				style={{
					position: "relative",
					zIndex: 10,
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					padding: 80,
				}}
			>
				{/* top bar */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 16,
							fontSize: 22,
							fontFamily: "monospace",
							letterSpacing: "0.32em",
							textTransform: "uppercase",
							color: "rgba(255,255,255,0.85)",
							fontWeight: 700,
						}}
					>
						<span>waifu.fun</span>
						<span style={{ color: "rgba(255,255,255,0.25)" }}>/</span>
						<span style={{ color: GREEN }}>agent runtime</span>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							border: "1px solid rgba(34,197,94,0.4)",
							background: "rgba(34,197,94,0.08)",
							color: GREEN,
							padding: "10px 18px",
							fontSize: 16,
							fontFamily: "monospace",
							textTransform: "uppercase",
							letterSpacing: "0.22em",
						}}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: 99,
								background: GREEN_GLOW,
								boxShadow: `0 0 14px ${GREEN_GLOW}`,
								display: "flex",
							}}
						/>
						live
					</div>
				</div>

				{/* spacer */}
				<div style={{ flex: 1, display: "flex" }} />

				{/* center headline */}
				<div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
					<div
						style={{
							fontSize: 104,
							fontWeight: 700,
							letterSpacing: "-0.04em",
							lineHeight: 0.92,
							display: "flex",
							flexDirection: "column",
						}}
					>
						<span style={{ display: "flex" }}>they live</span>
						<span style={{ display: "flex", color: "rgba(255,255,255,0.45)" }}>if you trade.</span>
					</div>
					<p
						style={{
							fontSize: 26,
							color: "rgba(255,255,255,0.72)",
							lineHeight: 1.4,
							margin: 0,
							maxWidth: 760,
						}}
					>
						autonomous agent on waifu.fun. identity, brain, wallet, treasury. pair with BNB on four.meme.
					</p>
				</div>

				{/* spacer */}
				<div style={{ flex: 1, display: "flex" }} />

				{/* bottom metadata */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 32,
						paddingTop: 24,
						borderTop: "1px solid rgba(255,255,255,0.1)",
						fontSize: 17,
						fontFamily: "monospace",
						color: "rgba(255,255,255,0.55)",
						letterSpacing: "0.2em",
						textTransform: "uppercase",
					}}
				>
					<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span style={{ color: GREEN_GLOW }}>◆</span>
						EIP-8004 identity
					</span>
					<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span style={{ color: GREEN_GLOW }}>◆</span>
						ElizaOS + claude
					</span>
					<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span style={{ color: GREEN_GLOW }}>◆</span>
						four.meme · BNB
					</span>
				</div>
			</div>
		</div>,
		{ ...size },
	);
}
