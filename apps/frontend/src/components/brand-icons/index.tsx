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

const baseProps = (extra: IconProps): React.SVGAttributes<SVGSVGElement> => ({
	viewBox: "0 0 16 16",
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
	return (
		<svg {...baseProps(props)}>
			<title>BNB Chain</title>
			<path d="M8 1L4.4 4.6 5.7 5.9 8 3.6l2.3 2.3 1.3-1.3L8 1zM3 6l-1.3 1.3L3 8.6 4.3 7.3 3 6zm10 0l-1.3 1.3 1.3 1.3L14.3 7.3 13 6zM8 6.4L6.7 7.7 8 9 9.3 7.7 8 6.4zM5.7 9.4L4.4 10.7 8 14.3l3.6-3.6-1.3-1.3L8 11.7l-2.3-2.3z" />
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
	return (
		<svg {...baseProps(props)}>
			<title>waifu.fun</title>
			<path d="M2 4l3 6 1.5-2.5L8 10l1.5-2.5L11 10l3-6h-2L10 8 8.5 5.5 8 6.5l-.5-1L6 8 4 4H2z" />
		</svg>
	);
}

export function StewardIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>Steward</title>
			<path d="M8 1L2 4v4c0 3.5 2.6 6.5 6 7 3.4-.5 6-3.5 6-7V4L8 1zm0 1.6l4.5 2.2v3.2c0 2.6-1.9 4.9-4.5 5.4-2.6-.5-4.5-2.8-4.5-5.4V4.8L8 2.6zM6.5 7.5L7.7 8.7l2.8-2.8L11.5 7l-3.8 3.7L5.5 8.5l1-1z" />
		</svg>
	);
}

export function FlapIcon(props: IconProps) {
	return (
		<svg {...baseProps(props)}>
			<title>FLAP</title>
			<path d="M8 1l-3 6h2v6h2V7h2L8 1z" />
		</svg>
	);
}
