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

// Image-backed brand marks: waifu (anime head) + Steward (gold compass rose)
// render the real PNG marks rather than approximated SVG glyphs. They keep the
// caller's sizing className (h-3.5 etc) and stay colour-accurate (the real
// brand colours), unlike the currentColor mono icons.
const markProps = (extra: IconProps): React.ImgHTMLAttributes<HTMLImageElement> => {
	const { fill: _fill, stroke: _stroke, ...rest } = extra as Record<string, unknown>;
	const merged = rest as React.ImgHTMLAttributes<HTMLImageElement>;
	const className = ["inline-block object-contain", merged.className].filter(Boolean).join(" ");
	return {
		loading: "lazy",
		decoding: "async",
		"aria-hidden": "true",
		...merged,
		className,
	};
};

export function WaifuIcon(props: IconProps) {
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img {...markProps(props)} src="/brand/mark/waifu.png" alt="waifu.fun" />
	);
}

export function StewardIcon(props: IconProps) {
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img {...markProps(props)} src="/brand/mark/steward.png" alt="Steward" />
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
