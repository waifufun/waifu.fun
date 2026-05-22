/**
 * SurfaceCard. The canonical card primitive for waifu.fun.
 *
 * The visual recipe is lifted directly from `LaunchCard` (the cleanest
 * example of the design language): hairline white/10 border, near-black
 * #08080a fill, `rounded-sm`, optional accent hover ring. Every card-like
 * surface across the app should compose this primitive so the visual
 * grammar stays consistent.
 *
 * Variants
 *  - `default`   static card, no hover state
 *  - `interactive` adds hover (border -> accent, bg -> surface-2)
 *  - `accent`    green-tinted border + faint accent wash, for emphasis
 *  - `danger`    red-tinted border + faint red wash, for destructive context
 *
 * Tones
 *  - `default`   the canonical recipe
 *  - `nested`    slightly elevated (#0a0a0c) for cards-inside-cards
 *  - `panel`     darker fill (#111114) for sidebar / panel surfaces
 *
 * Padding
 *  - `none` | `sm` (p-3) | `md` (p-4) | `lg` (p-5 md:p-6)
 *
 * `asChild` lets you swap the root for a Link or another wrapper while
 * keeping the visual recipe.
 */
import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "./surface-card-variants";

type SurfaceCardProps = React.HTMLAttributes<HTMLDivElement> &
	VariantProps<typeof surfaceCardVariants> & {
		asChild?: boolean;
	};

function SurfaceCard({ className, variant, tone, padding, asChild = false, ...props }: SurfaceCardProps) {
	const Comp = asChild ? Slot : "div";
	return (
		<Comp
			data-slot="surface-card"
			className={cn(surfaceCardVariants({ variant, tone, padding }), className)}
			{...props}
		/>
	);
}

function SurfaceCardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="surface-card-header" className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function SurfaceCardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			data-slot="surface-card-title"
			className={cn("text-sm md:text-base text-white leading-tight", className)}
			{...props}
		/>
	);
}

function SurfaceCardEyebrow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			data-slot="surface-card-eyebrow"
			className={cn("text-[10px] font-mono uppercase tracking-[0.2em] text-white/45", className)}
			{...props}
		/>
	);
}

function SurfaceCardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="surface-card-body" className={cn("text-sm text-white/70", className)} {...props} />;
}

function SurfaceCardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="surface-card-footer" className={cn("mt-auto flex items-center pt-3", className)} {...props} />;
}

export { surfaceCardVariants } from "./surface-card-variants";
export { SurfaceCard, SurfaceCardHeader, SurfaceCardTitle, SurfaceCardEyebrow, SurfaceCardBody, SurfaceCardFooter };

export default SurfaceCard;
