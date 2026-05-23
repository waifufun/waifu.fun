// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3

import type { CSSProperties, PropsWithChildren } from "react";

// Soft fade mask so digits scroll in/out without a hard clip edge.
// Technique reference: https://expensive.toys/blog/blur-vignette
export const maskHeight = "var(--mask-height, 0.15em)";
const maskWidth = "var(--mask-width, 0.5em)";
const cornerGradient = "#000 0, transparent 71%";
const mask =
	`linear-gradient(to right, transparent 0, #000 ${maskWidth}, #000 calc(100% - ${maskWidth}), transparent),` +
	`linear-gradient(to bottom, transparent 0, #000 ${maskHeight}, #000 calc(100% - ${maskHeight}), transparent 100%),` +
	`radial-gradient(at bottom right, ${cornerGradient}),` +
	`radial-gradient(at bottom left, ${cornerGradient}), ` +
	`radial-gradient(at top left, ${cornerGradient}), ` +
	`radial-gradient(at top right, ${cornerGradient})`;

const maskSize =
	`100% calc(100% - ${maskHeight} * 2),` +
	`calc(100% - ${maskWidth} * 2) 100%,` +
	`${maskWidth} ${maskHeight},` +
	`${maskWidth} ${maskHeight},` +
	`${maskWidth} ${maskHeight},` +
	`${maskWidth} ${maskHeight}`;

export function Mask({ children }: PropsWithChildren) {
	return (
		<span
			aria-hidden={true}
			style={
				{
					display: "inline-flex",
					margin: `0 calc(-1*${maskWidth})`,
					padding: `calc(${maskHeight}/2) ${maskWidth}`,
					position: "relative",
					zIndex: -1,
					overflow: "clip",
					WebkitMaskImage: mask,
					WebkitMaskSize: maskSize,
					WebkitMaskPosition: "center, center, top left, top right, bottom right, bottom left",
					WebkitMaskRepeat: "no-repeat",
				} as CSSProperties
			}
		>
			{children}
		</span>
	);
}
