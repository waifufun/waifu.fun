import type { SVGProps } from "react";

const STROKE = 1.5;

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<polyline points="4 12.5 9.5 18 20 6.5" />
		</svg>
	);
}

export function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<line x1="5" y1="12" x2="19" y2="12" />
			<polyline points="13 6 19 12 13 18" />
		</svg>
	);
}

export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<line x1="19" y1="12" x2="5" y2="12" />
			<polyline points="11 6 5 12 11 18" />
		</svg>
	);
}

export function CloudIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 9.5 4.5 4.5 0 0 0 7 18Z" />
		</svg>
	);
}

export function WebhookIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<circle cx="6" cy="18" r="2.5" />
			<circle cx="18" cy="18" r="2.5" />
			<circle cx="12" cy="6" r="2.5" />
			<path d="M14 7.7 17 13" />
			<path d="M10 7.7 7 13" />
			<path d="M8 18h8" />
		</svg>
	);
}

export function PullIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<path d="M12 4v12" />
			<polyline points="6 12 12 18 18 12" />
			<path d="M5 20h14" />
		</svg>
	);
}

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<rect x="8" y="8" width="12" height="12" rx="1" />
			<path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
		</svg>
	);
}

export function ShieldIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" />
		</svg>
	);
}

export function SparkIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<path d="M12 4v6" />
			<path d="M12 14v6" />
			<path d="M4 12h6" />
			<path d="M14 12h6" />
		</svg>
	);
}

export function UploadIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<path d="M12 16V5" />
			<polyline points="6 11 12 5 18 11" />
			<path d="M5 19h14" />
		</svg>
	);
}
