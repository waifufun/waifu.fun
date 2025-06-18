import { ImageResponse } from "next/og";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@autofun/types";
import { formatNumberSubscript } from "@/lib/utils";

export const runtime = "edge";
export const alt = "Token Information";
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<ITokenLookUp> }) {
	const token = await getToken(await params);

	const imageResponse = await fetch(token.image);
	if (!imageResponse.ok) {
		throw new Error(`Failed to load token image: ${imageResponse.statusText}`);
	}
	const chainLogo = `${process.env.NEXT_PUBLIC_HOST}/chain-icons/${token.chain.toLowerCase()}.svg`;
	const projectLogo = `${process.env.NEXT_PUBLIC_HOST}/logo_wide.svg`;

	return new ImageResponse(
		<div
			style={{
				background: "linear-gradient(to bottom right, #1a1a1a, #2a2a2a)",
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div
				style={{
					width: "100%",
					height: "340px",
					margin: "0 auto",
					position: "relative",
					overflow: "hidden",
					background: "#111",
					display: "flex",
					flexDirection: "column",
					justifyContent: "flex-start",
				}}
			>
				<div
					style={{
						width: "100%",
						display: "flex",
						flexDirection: "row",
						justifyContent: "space-between",
						alignItems: "flex-start",
						padding: "24px 32px 0 32px",
						position: "relative",
					}}
				>
					<div
						style={{
							width: 56,
							height: 56,
							borderRadius: "50%",
							background: "#181818cc",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<img
							src={chainLogo}
							alt={token.chain}
							width={36}
							height={36}
							style={{ width: 36, height: 36, objectFit: "contain" }}
						/>
					</div>
					<div
						style={{
							width: "400px",
							height: "400px",
							borderRadius: "8px",
							overflow: "hidden",
							display: "flex",
							backgroundColor: "#333",
							border: "4px solid #0A0A0A",
						}}
					>
						<img
							src={token.image}
							alt={token.name}
							width={400}
							height={400}
							style={{
								width: "100%",
								height: "100%",
								objectFit: "cover",
							}}
						/>
					</div>
					<div
						style={{
							background: "#181818cc",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<img
							src={projectLogo}
							alt="AutoFun"
							width={84}
							height={44}
							style={{ width: 84, height: 44, objectFit: "contain" }}
						/>
					</div>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "32px",
					marginBottom: "40px",
				}}
			>
				<div
					style={{
						width: "160px",
						height: "160px",
						borderRadius: "50%",
						overflow: "hidden",
						display: "flex",
						backgroundColor: "#333",
						border: "4px solid #0A0A0A",
						marginTop: "-200px",
					}}
				>
					<img
						src={token.image}
						alt={token.name}
						width={160}
						height={160}
						style={{
							width: "100%",
							height: "100%",
							objectFit: "cover",
						}}
					/>
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "16px",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "8px",
						}}
					>
						<h1
							style={{
								fontSize: "64px",
								fontWeight: "bold",
								color: "white",
								margin: 0,
								display: "flex",
							}}
						>
							{token.name}
						</h1>
						<p
							style={{
								fontSize: "36px",
								color: "#888",
								margin: 0,
								display: "flex",
							}}
						>
							{token.ticker}
						</p>
					</div>
					<div
						style={{
							display: "flex",
							gap: "32px",
							color: "white",
							fontSize: "28px",
						}}
					>
						<div style={{ display: "flex", gap: "8px" }}>
							<span style={{ color: "#888", display: "flex" }}>Price:</span>
							<span style={{ display: "flex" }}>{formatNumberSubscript(token?.price)}</span>
						</div>
						<div style={{ display: "flex", gap: "8px" }}>
							<span style={{ color: "#888", display: "flex" }}>MCap:</span>
							<span style={{ display: "flex" }}>{token.marketcap ? `$${token.marketcap.toLocaleString()}` : "-"}</span>
						</div>
						<div style={{ display: "flex", gap: "8px" }}>
							<span style={{ color: "#888", display: "flex" }}>Vol 24h:</span>
							<span style={{ display: "flex" }}>{token.volume24h ? `$${token.volume24h.toLocaleString()}` : "-"}</span>
						</div>
					</div>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					justifyContent: "flex-end",
					alignItems: "center",
					marginTop: "auto",
					color: "#888",
					fontSize: "24px",
					borderTop: "1px solid #333",
					paddingTop: "20px",
				}}
			>
				<div style={{ display: "flex" }}>
					Created: {token.createdAt ? new Date(token.createdAt).toLocaleDateString() : "-"}
				</div>
			</div>
		</div>,
		{
			...size,
		},
	);
}
