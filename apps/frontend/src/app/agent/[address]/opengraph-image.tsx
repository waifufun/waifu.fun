import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const contentType = "image/png";
export const alt = "waifu.fun — autonomous agent";
export const size = {
	width: 1200,
	height: 630,
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
const GREEN = "#22c55e";
const GREEN_GLOW = "#00ff87";

/**
 * ArrayBuffer → base64. Node runtime: Buffer is fine.
 */
function arrayBufferToBase64(buf: ArrayBuffer): string {
	return Buffer.from(buf).toString("base64");
}

type AgentForOG = {
	name: string;
	ticker: string;
	image?: string;
	description?: string;
	status: "active" | "graduated" | "pending";
	eip8004TokenId?: string | number;
};

async function fetchAgentForOG(address: string): Promise<AgentForOG | null> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/${address}`, {
			next: { revalidate: 60 },
		});
		if (!res.ok) return null;
		const d = (await res.json()) as Record<string, unknown>;
		const identity = (d.identity ?? null) as Record<string, unknown> | null;
		const status =
			d.status === "graduated" ? "graduated" : d.status === "pending" || d.status === "failed" ? "pending" : "active";
		const result: AgentForOG = {
			name: typeof d.name === "string" ? d.name : "agent",
			ticker: typeof d.ticker === "string" ? d.ticker : typeof d.symbol === "string" ? (d.symbol as string) : "",
			status,
		};
		const avatar =
			typeof d.image === "string" ? d.image : typeof d.avatarUrl === "string" ? (d.avatarUrl as string) : undefined;
		if (avatar) result.image = avatar;
		if (typeof d.description === "string") result.description = d.description;
		if (identity) {
			const tid = identity.eip8004TokenId;
			if (typeof tid === "string" || typeof tid === "number") result.eip8004TokenId = tid;
		}
		return result;
	} catch {
		return null;
	}
}

export default async function Image({
	params,
}: {
	params: Promise<{ address: string }>;
}) {
	const { address } = await params;
	const agent = await fetchAgentForOG(address);

	const host = process.env.NEXT_PUBLIC_HOST || "https://waifu.fun";

	// load assets in parallel; each is wrapped so a single failure doesn't
	// blow up the whole OG render (we fall back to gradient-only).
	async function safeFetch(url: string): Promise<ArrayBuffer | null> {
		try {
			const r = await fetch(url);
			if (!r.ok) return null;
			return await r.arrayBuffer();
		} catch {
			return null;
		}
	}

	const [satoshi, bgBuf, logoBuf] = await Promise.all([
		safeFetch(`${host}/fonts/Satoshi-Regular.otf`),
		safeFetch(`${host}/brand/backgrounds/hero-bg.webp`),
		safeFetch(`${host}/brand/lockup/lockup_waifufun_on_black_1024.png`),
	]);

	const bgDataUrl = bgBuf ? `data:image/webp;base64,${arrayBufferToBase64(bgBuf)}` : null;
	const logoDataUrl = logoBuf ? `data:image/png;base64,${arrayBufferToBase64(logoBuf)}` : null;

	// Fallback if we can't load the agent. Keep OG reasonable.
	const name = agent?.name ?? "agent";
	const ticker = agent?.ticker ? `$${agent.ticker}` : "";
	const description =
		agent?.description?.slice(0, 160) ??
		"autonomous agent on waifu.fun. identity, brain, wallet, treasury. pair with BNB on four.meme.";
	const status = agent?.status ?? "active";
	const image = agent?.image;
	const eip = agent?.eip8004TokenId;

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				background: "#000",
				fontFamily: "Satoshi",
				color: "#fff",
				position: "relative",
				overflow: "hidden",
			}}
		>
			{/* L1: aesthetic bg image */}
			{bgDataUrl && (
				<img
					src={bgDataUrl}
					alt=""
					width={1200}
					height={630}
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
						objectFit: "cover",
						opacity: 0.55,
					}}
				/>
			)}

			{/* L2: dark overlay for readability */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					background: "radial-gradient(ellipse 65% 55% at 50% 55%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.88) 100%)",
					display: "flex",
				}}
			/>

			{/* L3: ambient green glow top-right */}
			<div
				style={{
					position: "absolute",
					top: -240,
					right: -240,
					width: 700,
					height: 700,
					background: `radial-gradient(circle, ${GREEN_GLOW}26 0%, transparent 65%)`,
					display: "flex",
				}}
			/>

			{/* L4: ambient purple glow bottom-left for depth */}
			<div
				style={{
					position: "absolute",
					bottom: -280,
					left: -200,
					width: 600,
					height: 600,
					background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)",
					display: "flex",
				}}
			/>

			{/* L5: scanlines (subtle) */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					backgroundImage:
						"repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 4px)",
					display: "flex",
				}}
			/>

			{/* content wrapper */}
			<div
				style={{
					position: "relative",
					zIndex: 10,
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					padding: 56,
				}}
			>
				{/* top bar: logo + status pill */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					{logoDataUrl ? (
						<img
							src={logoDataUrl}
							alt="waifu.fun"
							height={36}
							style={{ height: 36, width: "auto", objectFit: "contain" }}
						/>
					) : (
						<span
							style={{
								fontSize: 22,
								fontFamily: "monospace",
								letterSpacing: "0.3em",
								textTransform: "uppercase",
								color: "rgba(255,255,255,0.7)",
							}}
						>
							waifu.fun
						</span>
					)}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							border: status === "graduated" ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(34,197,94,0.4)",
							background: status === "graduated" ? "rgba(255,255,255,0.03)" : "rgba(34,197,94,0.08)",
							color: status === "graduated" ? "rgba(255,255,255,0.7)" : GREEN,
							padding: "8px 16px",
							fontSize: 16,
							fontFamily: "monospace",
							textTransform: "uppercase",
							letterSpacing: "0.22em",
							backdropFilter: "blur(8px)",
						}}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: 99,
								background: status === "graduated" ? "rgba(255,255,255,0.5)" : GREEN_GLOW,
								boxShadow: status === "graduated" ? "none" : `0 0 12px ${GREEN_GLOW}`,
							}}
						/>
						{status}
					</div>
				</div>

				{/* spacer */}
				<div style={{ flex: 1, display: "flex" }} />

				{/* hero row */}
				<div style={{ display: "flex", gap: 36, alignItems: "center" }}>
					{/* avatar with glow ring */}
					<div
						style={{
							position: "relative",
							width: 200,
							height: 200,
							flexShrink: 0,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						{/* ring glow */}
						<div
							style={{
								position: "absolute",
								inset: -8,
								borderRadius: 4,
								background: `linear-gradient(135deg, ${GREEN_GLOW}44, transparent 50%, rgba(139,92,246,0.35))`,
								filter: "blur(12px)",
								display: "flex",
							}}
						/>
						{/* avatar frame */}
						<div
							style={{
								position: "relative",
								width: 200,
								height: 200,
								border: "1px solid rgba(255,255,255,0.14)",
								background: "#08080a",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								overflow: "hidden",
							}}
						>
							{image ? (
								<img src={image} alt={name} width={200} height={200} style={{ objectFit: "cover" }} />
							) : (
								<span
									style={{
										fontFamily: "monospace",
										color: "rgba(255,255,255,0.28)",
										fontSize: 13,
										letterSpacing: "0.2em",
									}}
								>
									NO IMAGE
								</span>
							)}
						</div>
					</div>

					<div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
						<div style={{ display: "flex", alignItems: "baseline", gap: 18, marginBottom: 14 }}>
							<span
								style={{
									fontSize: 72,
									fontWeight: 700,
									letterSpacing: "-0.03em",
									lineHeight: 0.95,
									textShadow: "0 2px 24px rgba(0,0,0,0.8)",
								}}
							>
								{name}
							</span>
							{ticker && (
								<span
									style={{
										fontSize: 22,
										color: GREEN,
										fontFamily: "monospace",
										border: "1px solid rgba(34,197,94,0.35)",
										background: "rgba(34,197,94,0.06)",
										padding: "7px 14px",
										letterSpacing: "0.05em",
										backdropFilter: "blur(6px)",
									}}
								>
									{ticker}
								</span>
							)}
						</div>
						<p
							style={{
								fontSize: 22,
								color: "rgba(255,255,255,0.72)",
								lineHeight: 1.4,
								margin: 0,
								maxWidth: 760,
								display: "-webkit-box",
								WebkitLineClamp: 2,
								WebkitBoxOrient: "vertical",
								overflow: "hidden",
								textShadow: "0 1px 12px rgba(0,0,0,0.8)",
							}}
						>
							{description}
						</p>
					</div>
				</div>

				{/* spacer */}
				<div style={{ flex: 1, display: "flex" }} />

				{/* bottom metadata row */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 28,
						paddingTop: 20,
						borderTop: "1px solid rgba(255,255,255,0.08)",
						fontSize: 16,
						fontFamily: "monospace",
						color: "rgba(255,255,255,0.5)",
						letterSpacing: "0.2em",
						textTransform: "uppercase",
					}}
				>
					{eip !== undefined && (
						<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<span style={{ color: GREEN_GLOW }}>◆</span>
							EIP-8004 #{eip}
						</span>
					)}
					<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span style={{ color: GREEN_GLOW }}>◆</span>
						ElizaOS + claude
					</span>
					<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span style={{ color: GREEN_GLOW }}>◆</span>
						four.meme · BNB
					</span>
					<span
						style={{
							marginLeft: "auto",
							color: GREEN,
							textShadow: `0 0 16px ${GREEN_GLOW}66`,
						}}
					>
						they live if you trade
					</span>
				</div>
			</div>
		</div>,
		{
			...size,
			...(satoshi
				? {
						fonts: [
							{
								name: "Satoshi",
								data: satoshi,
								style: "normal",
								weight: 400,
							},
						],
					}
				: {}),
		},
	);
}
