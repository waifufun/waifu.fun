import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export const runtime = "nodejs";
export const alt = "waifu.fun — ai agent token launchpad";
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";

export default async function Image() {
	const imageData = await readFile(join(process.cwd(), "public", "brand", "previews", "waifu-fun-og.png"));
	const base64 = imageData.toString("base64");
	const dataUrl = `data:image/png;base64,${base64}`;

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
			}}
		>
			<img
				src={dataUrl}
				alt={alt}
				style={{
					width: "100%",
					height: "100%",
					objectFit: "cover",
				}}
			/>
		</div>,
		{ ...size },
	);
}
