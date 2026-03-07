import { ImageResponse } from "next/og";
import type { ITokenLookUp } from "@waifufun/types";
import { getToken } from "@/lib/api";

const toSubscript = (num: number): string => {
	const subDigits: { [key: string]: string } = {
		"0": "₀",
		"1": "\u2081",
		"2": "\u2082",
		"3": "\u2083",
		"4": "\u2084",
		"5": "\u2085",
		"6": "\u2086",
		"7": "\u2087",
		"8": "\u2088",
		"9": "\u2089",
		"-": "\u207B",
	};
	return num
		.toString()
		.split("")
		.map((digit) => subDigits[digit] || digit)
		.join("");
};

export const formatNumberSubscript = (inputNum: number, decimals = 1): string => {
	let num = inputNum;
	if (num === 0) return "0";
	let sign = "";
	if (num < 0) {
		sign = "-";
		num = Math.abs(num);
	}

	num = Number(num.toFixed(11));

	if (num >= 1) {
		return sign + num.toString();
	}

	const expStr = num.toExponential();
	const [mantissa, exponentStr] = expStr.split("e");
	if (!exponentStr || !mantissa) return "-";
	const exponent = Number.parseInt(exponentStr, 10);
	let totalZeros = -exponent - 1;
	const mantissaDigits = mantissa.replace(".", "").slice(0, 9);

	if (totalZeros < 0) {
		totalZeros = 0;
	}

	if (totalZeros > decimals) {
		return `${sign}0.0${toSubscript(totalZeros)}${mantissaDigits}`;
	}
	return `${sign}0.${"0".repeat(totalZeros)}${mantissaDigits}`;
};

export const runtime = "edge";
export const contentType = "image/png";
export const size = {
	width: 1200,
	height: 630,
};

export default async function Image({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const fontResponse = await fetch(
		new URL("/fonts/Satoshi-Regular.otf", process.env.NEXT_PUBLIC_HOST || "http://localhost:3000"),
	);
	if (!fontResponse.ok) {
		throw new Error(`Failed to fetch font: ${fontResponse.statusText}`);
	}

	const satoshiFont = await fontResponse.arrayBuffer();
	const token = await getToken((await params) as unknown as ITokenLookUp);
	const imageResponse = await fetch(token.image);
	if (!imageResponse.ok) throw new Error(`Failed to load token image: ${imageResponse.statusText}`);

	const chainLogo = `${process.env.NEXT_PUBLIC_HOST}/chain-icons/${token.chain.toLowerCase()}.svg`;
	const projectLogo = `${process.env.NEXT_PUBLIC_HOST}/logo_wide.svg`;

	return new ImageResponse(
		<div
			style={{
				fontFamily: "Satoshi",
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
							alt="WaifuFun"
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
