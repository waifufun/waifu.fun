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

	// Graceful: never let agent fetch blow up the image.
	let agent: AgentForOG | null = null;
	try {
		agent = await fetchAgentForOG(address);
	} catch {
		agent = null;
	}

	// Fallback content if agent unknown
	const name = agent?.name ?? "agent";
	const ticker = agent?.ticker ? `$${agent.ticker}` : "";
	const description =
		agent?.description?.slice(0, 160) ??
		"autonomous agent on waifu.fun. identity, brain, wallet, treasury. pair with BNB on four.meme.";
	const status = agent?.status ?? "active";
	const image = agent?.image;
	const eip = agent?.eip8004TokenId;

	const statusIsGraduated = status === "graduated";

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
			{/* L1: animated gradient backdrop */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					background:
						"radial-gradient(ellipse 80% 60% at 30% 20%, rgba(34,197,94,0.14) 0%, transparent 50%), radial-gradient(ellipse 70% 60% at 80% 90%, rgba(139,92,246,0.14) 0%, transparent 55%), #000",
					display: "flex",
				}}
			/>

			{/* L2: glitch grid */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					backgroundImage:
						"linear-gradient(rgba(34,197,94,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.03) 1px, transparent 1px)",
					backgroundSize: "80px 80px",
					display: "flex",
				}}
			/>

			{/* L3: scanlines */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					backgroundImage:
						"repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 4px)",
					display: "flex",
				}}
			/>

			{/* L4: corner accent marks */}
			<div style={{ position: "absolute", top: 32, left: 32, display: "flex", gap: 8 }}>
				<span
					style={{
						width: 8,
						height: 8,
						background: GREEN_GLOW,
						boxShadow: `0 0 16px ${GREEN_GLOW}`,
						display: "flex",
					}}
				/>
			</div>
			<div style={{ position: "absolute", top: 32, right: 32, display: "flex", gap: 6 }}>
				<span style={{ width: 24, height: 2, background: "rgba(34,197,94,0.4)", display: "flex" }} />
				<span style={{ width: 12, height: 2, background: "rgba(34,197,94,0.2)", display: "flex" }} />
			</div>
			<div style={{ position: "absolute", bottom: 32, right: 32, display: "flex", gap: 6 }}>
				<span style={{ width: 12, height: 2, background: "rgba(34,197,94,0.2)", display: "flex" }} />
				<span style={{ width: 24, height: 2, background: "rgba(34,197,94,0.4)", display: "flex" }} />
			</div>

			{/* content wrapper */}
			<div
				style={{
					position: "relative",
					zIndex: 10,
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					padding: 72,
				}}
			>
				{/* top bar: brand + status pill */}
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
							gap: 14,
							fontSize: 20,
							fontFamily: "monospace",
							letterSpacing: "0.32em",
							textTransform: "uppercase",
							color: "rgba(255,255,255,0.85)",
							fontWeight: 600,
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
							border: statusIsGraduated ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(34,197,94,0.4)",
							background: statusIsGraduated ? "rgba(255,255,255,0.03)" : "rgba(34,197,94,0.08)",
							color: statusIsGraduated ? "rgba(255,255,255,0.7)" : GREEN,
							padding: "8px 16px",
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
								background: statusIsGraduated ? "rgba(255,255,255,0.5)" : GREEN_GLOW,
								boxShadow: statusIsGraduated ? "none" : `0 0 12px ${GREEN_GLOW}`,
								display: "flex",
							}}
						/>
						{status}
					</div>
				</div>

				{/* spacer */}
				<div style={{ flex: 1, display: "flex" }} />

				{/* hero row */}
				<div style={{ display: "flex", gap: 40, alignItems: "center" }}>
					{/* avatar */}
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
								inset: -10,
								background: "linear-gradient(135deg, rgba(0,255,135,0.35), transparent 45%, rgba(139,92,246,0.35))",
								filter: "blur(16px)",
								display: "flex",
							}}
						/>
						{/* frame */}
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
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={image}
									alt={name}
									width={200}
									height={200}
									style={{ objectFit: "cover", width: 200, height: 200 }}
								/>
							) : (
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
										gap: 8,
									}}
								>
									<div
										style={{
											fontFamily: "monospace",
											color: GREEN,
											fontSize: 32,
											letterSpacing: "0.1em",
										}}
									>
										◆
									</div>
									<span
										style={{
											fontFamily: "monospace",
											color: "rgba(255,255,255,0.4)",
											fontSize: 12,
											letterSpacing: "0.24em",
										}}
									>
										NO IMAGE
									</span>
								</div>
							)}
						</div>
					</div>

					<div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
						<div style={{ display: "flex", alignItems: "baseline", gap: 18, marginBottom: 16 }}>
							<span
								style={{
									fontSize: 82,
									fontWeight: 700,
									letterSpacing: "-0.03em",
									lineHeight: 0.95,
								}}
							>
								{name}
							</span>
							{ticker && (
								<span
									style={{
										fontSize: 24,
										color: GREEN,
										fontFamily: "monospace",
										border: "1px solid rgba(34,197,94,0.4)",
										background: "rgba(34,197,94,0.08)",
										padding: "8px 14px",
										letterSpacing: "0.05em",
									}}
								>
									{ticker}
								</span>
							)}
						</div>
						<p
							style={{
								fontSize: 24,
								color: "rgba(255,255,255,0.72)",
								lineHeight: 1.4,
								margin: 0,
								maxWidth: 780,
								display: "-webkit-box",
								WebkitLineClamp: 2,
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

				{/* bottom row */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 28,
						paddingTop: 24,
						borderTop: "1px solid rgba(255,255,255,0.1)",
						fontSize: 16,
						fontFamily: "monospace",
						color: "rgba(255,255,255,0.55)",
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
							fontWeight: 600,
						}}
					>
						they live if you trade
					</span>
				</div>
			</div>
		</div>,
		{ ...size },
	);
}
