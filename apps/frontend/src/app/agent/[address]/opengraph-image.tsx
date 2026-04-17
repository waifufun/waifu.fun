import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const alt = "waifu.fun — autonomous agent";
export const size = {
	width: 1200,
	height: 630,
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

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
			d.status === "graduated"
				? "graduated"
				: d.status === "pending" || d.status === "failed"
					? "pending"
					: "active";
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
	const fontResponse = await fetch(new URL("/fonts/Satoshi-Regular.otf", host));
	const satoshi = fontResponse.ok ? await fontResponse.arrayBuffer() : null;

	// Fallback if we can't load the agent (e.g. network hiccup). Keep OG reasonable.
	const name = agent?.name ?? "agent";
	const ticker = agent?.ticker ? `$${agent.ticker}` : "";
	const description = agent?.description?.slice(0, 180) ?? "autonomous agent on waifu.fun";
	const status = agent?.status ?? "active";
	const image = agent?.image;
	const eip = agent?.eip8004TokenId;

	const GREEN = "#22c55e";
	const DIM = "rgba(255,255,255,0.45)";
	const DIMMER = "rgba(255,255,255,0.28)";
	const BORDER = "rgba(255,255,255,0.1)";

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				background: "#000",
				padding: 56,
				fontFamily: "Satoshi",
				color: "#fff",
				position: "relative",
			}}
		>
			{/* ambient glow */}
			<div
				style={{
					position: "absolute",
					top: -200,
					right: -200,
					width: 600,
					height: 600,
					background: "radial-gradient(circle, rgba(34,197,94,0.14), transparent 70%)",
					display: "flex",
				}}
			/>

			{/* top bar: brand + status pill */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 44,
					position: "relative",
				}}
			>
				<div
					style={{
						display: "flex",
						gap: 14,
						fontSize: 18,
						fontFamily: "monospace",
						letterSpacing: "0.28em",
						textTransform: "uppercase",
						color: DIM,
					}}
				>
					<span>waifu.fun</span>
					<span style={{ color: DIMMER }}>/</span>
					<span style={{ color: GREEN }}>agent</span>
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						border: `1px solid ${status === "graduated" ? BORDER : "rgba(34,197,94,0.4)"}`,
						color: status === "graduated" ? DIM : GREEN,
						padding: "8px 14px",
						fontSize: 16,
						fontFamily: "monospace",
						textTransform: "uppercase",
						letterSpacing: "0.2em",
					}}
				>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: 99,
							background: status === "graduated" ? "rgba(255,255,255,0.5)" : GREEN,
						}}
					/>
					{status}
				</div>
			</div>

			{/* hero row */}
			<div style={{ display: "flex", gap: 40, alignItems: "center" }}>
				<div
					style={{
						width: 220,
						height: 220,
						border: `1px solid ${BORDER}`,
						background: "#08080a",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						overflow: "hidden",
						flexShrink: 0,
					}}
				>
					{image ? (
						<img src={image} alt={name} width={220} height={220} style={{ objectFit: "cover" }} />
					) : (
						<span
							style={{
								fontFamily: "monospace",
								color: DIMMER,
								fontSize: 14,
								letterSpacing: "0.2em",
							}}
						>
							NO IMAGE
						</span>
					)}
				</div>
				<div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
					<div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 12 }}>
						<span style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>{name}</span>
						{ticker && (
							<span
								style={{
									fontSize: 22,
									color: GREEN,
									fontFamily: "monospace",
									border: `1px solid rgba(34,197,94,0.3)`,
									background: "rgba(34,197,94,0.05)",
									padding: "6px 12px",
									letterSpacing: "0.05em",
								}}
							>
								{ticker}
							</span>
						)}
					</div>
					<p
						style={{
							fontSize: 22,
							color: "rgba(255,255,255,0.65)",
							lineHeight: 1.4,
							margin: 0,
							maxWidth: 720,
							display: "-webkit-box",
							WebkitLineClamp: 3,
							WebkitBoxOrient: "vertical",
							overflow: "hidden",
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
					gap: 32,
					paddingTop: 24,
					borderTop: `1px solid ${BORDER}`,
					fontSize: 18,
					fontFamily: "monospace",
					color: DIM,
					letterSpacing: "0.18em",
					textTransform: "uppercase",
				}}
			>
				{eip !== undefined && <span>EIP-8004 #{eip}</span>}
				<span>brain: ElizaOS + claude</span>
				<span style={{ marginLeft: "auto", color: GREEN }}>they live if you trade</span>
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
