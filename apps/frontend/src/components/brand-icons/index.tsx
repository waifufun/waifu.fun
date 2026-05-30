/**
 * Brand icon set: lightweight mono SVG icons of platforms/protocols
 * waifu.fun integrates with or surfaces in agent activity.
 *
 * Each icon is a single-color (currentColor) 16x16 viewBox so it can
 * be sized via Tailwind text-sm / w-4 h-4 and tinted via text-{color}.
 *
 * Paths sourced from simple-icons.org and bnb / pcs official press kits.
 */

import type * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

const baseProps = (extra: IconProps, viewBox = "0 0 16 16"): React.SVGAttributes<SVGSVGElement> => ({
	viewBox,
	fill: "currentColor",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	...extra,
});

export function GithubIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>GitHub</title>
			<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
		</svg>
	);
}

export function XIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>X</title>
			<path d="M12.6 0h2.46L9.7 6.13 16 14.4h-4.94L7.19 9.4 2.74 14.4H.28L6.05 7.84 0 0h5.06l3.5 4.62L12.6 0zm-.86 12.94h1.36L4.34 1.38H2.88l8.86 11.56z" />
		</svg>
	);
}

export function HyperliquidIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>Hyperliquid</title>
			<path d="M2 4l6-3.5L14 4v8l-6 3.5L2 12V4zm6-1.7L4 4.6v6.8l4 2.3 4-2.3V4.6L8 2.3z" />
			<path d="M5.5 6.5h5v3h-5z" />
		</svg>
	);
}

export function PolymarketIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>Polymarket</title>
			<circle cx="8" cy="8" r="7.5" fill="none" stroke="currentColor" strokeWidth="1" />
			<path d="M5.5 5.5h2.5c1.4 0 2.5 1 2.5 2.3 0 1.3-1.1 2.3-2.5 2.3H7v2.4H5.5V5.5zm1.5 1.5v2.2h1c.5 0 1-.4 1-1.1 0-.6-.5-1.1-1-1.1H7z" />
		</svg>
	);
}

export function BnbChainIcon(props: IconProps) {
	// Official BNB four-petal diamond mark, traced from BNB Chain's press-kit
	// geometry (the same mark shipped at public/chain-icons/bnb.svg) and
	// retraced onto a 0 0 64 64 grid so it tints via currentColor.
	return (
		<svg {...baseProps(props, "0 0 64 64")}>
			<title>BNB Chain</title>
			<path d="M24.62 26.77 32 19.39l7.39 7.39 4.29-4.29L32 10.81 20.33 22.48l4.29 4.29ZM16.81 32l4.29-4.29L25.39 32l-4.29 4.29L16.81 32Zm7.81 5.23L32 44.61l7.39-7.39 4.29 4.29L32 53.19 20.32 41.52l4.3-4.29ZM38.61 32l4.29-4.29L47.19 32l-4.29 4.29L38.61 32Zm-2.62 0L32 27.99l-2.96 2.96-.34.34-.7.7v.01L32 36l4-4.01Z" />
		</svg>
	);
}

export function PancakeSwapIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>PancakeSwap</title>
			<path d="M8 1.5c-3 0-5.4 1.7-5.4 4 0 1.3.8 2.4 2 3v3.5c0 .6.4 1 1 1h4.8c.6 0 1-.4 1-1V8.5c1.2-.6 2-1.7 2-3 0-2.3-2.4-4-5.4-4zm-2 4c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm4 0c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1z" />
		</svg>
	);
}

export function EthereumIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>Ethereum</title>
			<path d="M8 0L3.5 7.5 8 10l4.5-2.5L8 0zm0 11L3.5 8.5 8 16l4.5-7.5L8 11z" />
		</svg>
	);
}

export function CloudflareIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>Cloudflare</title>
			<path d="M11.3 9.6c.1-.4-.1-.7-.4-.8L8.4 8.5c-.1 0-.1-.1-.1-.2 0-.1 0-.1.1-.2l2.6-.3c.4 0 .6-.4.5-.7l-.6-3.1c-.1-.3-.4-.5-.7-.5h-5.6c-.2 0-.3.1-.4.2L3.4 4.6c-.2.2-.2.5 0 .7L4.8 6c.2.2.3.5.2.8L4.4 9.7c-.1.3.1.6.4.6h6.1c.2 0 .4-.3.4-.7zM1.4 9.6c-.1.3.1.7.4.7H6c0-.1 0-.2.1-.3l.5-1.8c0-.2 0-.4-.2-.6L5 6.3c-.2-.2-.2-.5 0-.7l.7-.7c.1-.1.1-.3 0-.4H2c-.3 0-.5.2-.6.5l-.3 1.5c0 .2 0 .3.1.4l.5.4c.1.1.1.3 0 .4l-.3 1.9z" />
		</svg>
	);
}

export function AnthropicIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>Anthropic</title>
			<path d="M3 14L6.5 2h3L13 14h-2.5l-.8-2.8H6.3L5.5 14H3zm3.8-4.8h2.4L8 5.2 6.8 9.2z" />
		</svg>
	);
}

export function OpenaiIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>OpenAI</title>
			<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
		</svg>
	);
}

export function HetznerIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>Hetzner</title>
			<rect x="2" y="2" width="5" height="5" rx="0.5" />
			<rect x="9" y="2" width="5" height="5" rx="0.5" />
			<rect x="2" y="9" width="5" height="5" rx="0.5" />
			<rect x="9" y="9" width="5" height="5" rx="0.5" />
		</svg>
	);
}

export function WaifuIcon(props: IconProps) {
	// waifu.fun mark: the anime side-profile head with the glitch / visor band,
	// the real brand icon. Vectorised straight from the shipped brand asset
	// (public/brand/icon/icon_512.png) into a single fill-rule=evenodd path so
	// the face cutout reads as negative space and the whole mark tints via
	// currentColor like every other icon in this set (no neon multi-colour fill
	// that would break the single-accent chip tinting). 16x16 viewBox.
	return (
		<svg {...baseProps(props)}>
			<title>waifu.fun</title>
			<path
				fillRule="evenodd"
				d="M 8.92,0.3 C 8.79,0.33 8.37,0.36 7.99,0.37 C 6.77,0.38 5.74,0.83 4.71,1.8 C 4.11,2.37 3.6,3.08 3.6,3.34 C 3.6,3.43 3.54,3.58 3.45,3.68 C 2.96,4.34 2.38,5.96 2.64,5.96 C 2.68,5.96 2.72,5.86 2.72,5.74 C 2.72,5.61 2.76,5.51 2.8,5.51 C 2.85,5.51 2.88,5.71 2.88,5.96 C 2.88,6.73 3.15,7.18 3.72,7.36 C 4.2,7.51 4.05,7.97 3.33,8.54 C 3.06,8.75 2.71,9.06 2.55,9.22 C 2.37,9.4 2.15,9.52 1.91,9.58 C 1.72,9.62 1.42,9.7 1.26,9.75 C 1.04,9.81 0.88,9.81 0.67,9.75 C 0.39,9.67 0.38,9.68 0.53,9.82 C 0.9,10.2 2.02,10.28 2.89,9.96 C 3.48,9.75 3.46,9.8 2.63,10.42 C 1.13,11.55 0.58,12.62 1.06,13.52 C 1.23,13.85 1.23,13.85 1.29,13.47 C 1.36,12.95 1.62,12.51 2.15,11.98 C 2.55,11.58 2.96,11.28 2.86,11.45 C 2.84,11.48 2.69,11.72 2.53,11.98 C 1.87,13.02 1.85,13.91 2.45,14.6 C 2.75,14.94 2.76,14.94 2.76,14.39 C 2.76,13.84 3.02,13.34 3.6,12.73 C 4.02,12.28 4.1,12.38 3.77,12.94 C 3.46,13.45 3.33,13.99 3.43,14.26 C 3.47,14.36 3.53,14.52 3.56,14.6 C 3.6,14.72 3.66,14.66 3.92,14.26 C 4.74,13 5.04,12.75 6.06,12.57 C 7.46,12.32 7.76,12.15 7.76,11.65 C 7.76,11.43 7.81,11.37 8.12,11.2 C 8.5,11 8.54,10.88 8.4,10.54 C 8.33,10.35 8.32,10.35 7.99,10.45 C 7.45,10.63 7.38,10.61 6.58,9.86 C 5.73,9.08 5.62,8.92 5.52,8.32 C 5.47,8.08 5.42,7.8 5.39,7.68 C 5.36,7.52 5.38,7.47 5.47,7.47 C 5.54,7.47 5.6,7.43 5.6,7.4 C 5.6,7.35 5.53,7.32 5.44,7.32 C 5.35,7.32 5.28,7.28 5.28,7.25 C 5.28,7.2 6,7.18 7.3,7.18 C 8.41,7.19 9.14,7.21 8.92,7.22 C 8.04,7.29 8.39,7.4 9.47,7.4 L 10.58,7.4 L 10.54,8.08 C 10.46,9.14 10.19,10.19 9.75,11.22 C 9.33,12.2 9.08,13.12 9.15,13.43 C 9.17,13.54 9.12,13.82 9.03,14.06 C 8.88,14.48 8.89,14.97 9.04,15.06 C 9.08,15.08 9.09,15.03 9.06,14.95 C 9.02,14.78 9.17,14.29 9.29,14.22 C 9.34,14.2 9.5,14.3 9.65,14.47 C 9.92,14.75 9.92,14.75 9.72,14.38 C 9.46,13.89 9.43,13.96 10.22,13.02 C 10.82,12.29 11.15,11.75 11.58,10.79 C 11.67,10.6 11.67,10.6 11.67,10.79 C 11.7,11.6 12.22,12.42 12.94,12.81 C 13.22,12.96 13.47,13.12 13.5,13.18 C 13.52,13.24 13.57,13.27 13.6,13.25 C 13.64,13.22 13.82,13.34 14.02,13.52 C 14.45,13.9 15.01,14.22 15.16,14.16 C 15.31,14.11 15.41,14.28 15.61,14.97 C 15.77,15.51 15.77,15.51 15.73,15.05 C 15.71,14.79 15.62,14.42 15.52,14.22 C 15.42,14.02 15.33,13.74 15.31,13.61 C 15.27,13.32 15,12.86 14.84,12.8 C 14.78,12.78 14.72,12.71 14.72,12.65 C 14.72,12.54 14.55,12.45 14.3,12.45 C 14.17,12.45 14.15,12.42 14.2,12.28 C 14.23,12.19 14.28,11.74 14.31,11.28 C 14.37,10.45 14.37,10.45 14.51,10.89 C 14.59,11.13 14.69,11.55 14.72,11.83 C 14.79,12.33 14.79,12.32 14.76,11.66 C 14.74,11.18 14.66,10.77 14.49,10.23 C 14.07,8.96 13.86,7.26 14.09,7.04 C 14.14,6.99 14.14,6.94 14.1,6.91 C 14.05,6.89 14.05,6.75 14.09,6.55 C 14.38,5.14 14.02,3.43 13.19,2.29 C 12.22,0.94 10.19,0 8.92,0.3 M 5.94,5 C 6.01,5.45 6.28,6.06 6.5,6.24 C 6.62,6.35 6.66,6.35 6.62,6.26 C 6.43,5.74 6.46,5.68 6.71,6.08 C 6.98,6.51 7.82,6.44 7.61,5.98 C 7.5,5.77 7.5,5.77 7.77,6 C 8.02,6.23 8.02,6.23 7.97,6.04 C 7.56,4.61 7.53,4.01 7.89,4.77 C 8.13,5.27 8.46,5.66 8.65,5.66 C 8.83,5.66 8.83,5.62 8.61,5.09 C 8.47,4.79 8.47,4.79 8.82,5.14 C 9.01,5.34 9.3,5.58 9.46,5.7 C 9.62,5.81 9.74,5.94 9.74,5.98 C 9.73,6.04 9.91,6.17 10.14,6.28 C 10.6,6.5 10.54,6.58 9.96,6.55 C 8.85,6.48 7.84,6.57 7.94,6.72 C 7.99,6.8 8.1,6.88 8.16,6.88 C 8.66,6.92 7.18,6.98 6.2,6.96 C 4.98,6.93 4.98,6.93 4.93,6.72 C 4.9,6.62 4.86,6.45 4.84,6.34 C 4.79,6.16 4.79,6.16 4.92,6.36 C 5.1,6.65 5.2,6.55 5.2,6.09 C 5.2,5.7 5.2,5.7 5.38,5.99 C 5.65,6.43 5.76,6.42 5.67,5.98 C 5.6,5.65 5.62,5.37 5.73,4.68 C 5.78,4.35 5.88,4.49 5.94,5 M 13.99,10.88 C 14.1,11.64 14.04,12.08 13.78,12.35 C 13.5,12.62 13.41,12.38 13.58,11.85 C 13.64,11.66 13.71,11.21 13.74,10.85 C 13.79,10.07 13.87,10.08 13.99,10.88 M 10.21,11.33 C 10.1,11.64 9.86,12.17 9.69,12.53 C 9.36,13.17 9.36,13.17 9.4,12.76 C 9.43,12.37 9.72,11.7 10.13,11.03 C 10.42,10.57 10.44,10.68 10.21,11.33"
			/>
		</svg>
	);
}

export function StewardIcon(props: IconProps) {
	// Steward (steward.fi) mark: the 8-point navigational compass rose, matched
	// to the real logo at steward.fi/logo.png. Four long cardinal points
	// (N/E/S/W reaching the edge) and four shorter diagonal points, all meeting
	// at a tight centre hub via concave notches. Built on a true radial grid so
	// the geometry is symmetric, then kept as one solid silhouette that tints
	// via currentColor (steward's gold is applied by the consumer when it stands
	// alone, like the BNB / FLAP marks). 32x32 viewBox.
	return (
		<svg {...baseProps(props, "0 0 32 32")}>
			<title>Steward</title>
			<path d="M16 1 16.84 13.97 23.42 8.58 18.03 15.16 31 16 18.03 16.84 23.42 23.42 16.84 18.03 16 31 15.16 18.03 8.58 23.42 13.97 16.84 1 16 13.97 15.16 8.58 8.58 15.16 13.97Z" />
		</svg>
	);
}

export function FlapIcon(props: IconProps) {
	// FLAP (flap.sh) mark: the butterfly. Real left + right wing paths lifted
	// from flap.sh's own butterfly-loader.svg (0 0 500 500 space), flattened
	// to a single-color silhouette so it tints via currentColor. No purple
	// gradient, no glow, per brand discipline; the butterfly is the brand.
	return (
		<svg {...baseProps(props, "0 0 500 500")}>
			<title>FLAP</title>
			<path d="M 121 117 L 104 123 L 95 132 L 91 140 L 91 166 L 102 190 L 112 204 L 127 219 L 148 233 L 173 244 L 205 252 L 211 256 L 211 261 L 208 264 L 181 272 L 162 281 L 150 289 L 131 307 L 122 320 L 114 337 L 113 346 L 114 365 L 117 370 L 127 379 L 137 382 L 145 382 L 167 376 L 182 368 L 194 359 L 215 335 L 227 313 L 235 288 L 234 241 L 232 217 L 228 206 L 214 177 L 198 156 L 183 142 L 163 128 L 145 120 L 132 117 Z" />
			<path d="M 378 117 L 367 117 L 354 120 L 336 128 L 317 141 L 300 157 L 283 180 L 272 202 L 263 234 L 261 267 L 266 296 L 275 320 L 284 335 L 295 349 L 317 368 L 334 377 L 354 382 L 366 381 L 375 377 L 382 370 L 387 357 L 385 348 L 381 334 L 378 321 L 368 307 L 349 289 L 318 272 L 291 264 L 288 261 L 288 256 L 291 253 L 326 244 L 351 233 L 373 218 L 387 204 L 395 193 L 407 169 L 409 161 L 409 145 L 404 132 L 395 123 Z" />
			<circle cx="210" cy="285" r="7" />
			<circle cx="292" cy="286" r="6.5" />
			<circle cx="235" cy="305" r="5" />
			<circle cx="266" cy="306" r="5" />
		</svg>
	);
}
