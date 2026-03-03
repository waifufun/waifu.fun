import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "waifu.fun - Fair Launchpad & Token Analytics Platform";
export const size = {
	width: 1200,
	height: 630,
};

export const contentType = "image/png";

export default async function Image() {
	const fontResponse = await fetch(
		new URL("/fonts/Satoshi-Regular.otf", process.env.NEXT_PUBLIC_HOST || "http://localhost:3000"),
	);
	if (!fontResponse.ok) {
		throw new Error(`Failed to fetch font: ${fontResponse.statusText}`);
	}
	const satoshiFont = await fontResponse.arrayBuffer();
	return new ImageResponse(
		<div
			style={{
				fontFamily: "Satoshi",
				background: "linear-gradient(to bottom right, #1a1a1a, #2a2a2a)",
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				padding: "40px",
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "24px",
					marginBottom: "40px",
				}}
			>
				<img
					src={`${process.env.NEXT_PUBLIC_HOST}/logo_wide.svg`}
					alt="WaifuFun"
					width={87}
					height={44}
					style={{
						display: "flex",
					}}
				/>
				<div
					style={{
						fontSize: 48,
						fontWeight: "bold",
						color: "#FFFFFF",
						textAlign: "center",
						display: "flex",
					}}
				>
					Fair Launch & Trade & Token Analytics
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "32px",
					flex: 1,
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						gap: "24px",
					}}
				>
					<div
						style={{
							flex: 1,
							backgroundColor: "#0A0A0A",
							borderRadius: "12px",
							padding: "24px",
							display: "flex",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						<div style={{ color: "#888", fontSize: 24, display: "flex" }}>Fair Launch</div>
						<div style={{ color: "#FFFFFF", fontSize: 32, fontWeight: "bold", display: "flex" }}>Launch Your Token</div>
					</div>
					<div
						style={{
							flex: 1,
							backgroundColor: "#0A0A0A",
							borderRadius: "12px",
							padding: "24px",
							display: "flex",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						<div style={{ color: "#888", fontSize: 24, display: "flex" }}>Trading</div>
						<div style={{ color: "#FFFFFF", fontSize: 32, fontWeight: "bold", display: "flex" }}>Swap & Trade</div>
					</div>
				</div>

				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						gap: "24px",
					}}
				>
					<div
						style={{
							flex: 1,
							backgroundColor: "#0A0A0A",
							borderRadius: "12px",
							padding: "24px",
							display: "flex",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						<div style={{ color: "#888", fontSize: 24, display: "flex" }}>Cross-chain</div>
						<div style={{ color: "#FFFFFF", fontSize: 32, fontWeight: "bold", display: "flex" }}>Solana</div>
					</div>
					<div
						style={{
							flex: 1,
							backgroundColor: "#0A0A0A",
							borderRadius: "12px",
							padding: "24px",
							display: "flex",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						<div style={{ color: "#888", fontSize: 24, display: "flex" }}>Market Data</div>
						<div style={{ color: "#FFFFFF", fontSize: 32, fontWeight: "bold", display: "flex" }}>
							Real-time Analytics
						</div>
					</div>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginTop: "40px",
					color: "#888",
					fontSize: "24px",
					borderTop: "1px solid #333",
					paddingTop: "20px",
				}}
			>
				<div style={{ display: "flex" }}>waifu.fun</div>
				<div style={{ display: "flex" }}>Fair Launch, Trade Smart</div>
			</div>
		</div>,
		{
			...size,
			fonts: [
				{
					name: "Satoshi",
					data: satoshiFont,
					style: "normal",
					weight: 400,
				},
			],
		},
	);
}
