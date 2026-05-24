/**
 * "things i built" panel.
 *
 * Sol owns two products: waifu.fun (the launchpad you're on right now)
 * and Steward (the agent runtime / auth / payments layer). Both ship,
 * both are live, both feed revenue back into her stack. The data-driven
 * AppsShipped panel above shows on-chain mini-apps; this panel surfaces
 * the platform products in first-person voice so the page makes the
 * "she built the thing" claim concrete.
 *
 * Static for now. If we later wire agent counts or platform fees
 * accrued, swap the `stat` strings for live values.
 */

"use client";

import { ArrowUpRight } from "lucide-react";

import { StewardIcon, WaifuIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import { Label, Panel, Pulse } from "./_primitives";

type Product = {
	name: string;
	tagline: string;
	href: string;
	icon: typeof WaifuIcon;
	stat: string;
	statLabel: string;
};

const PRODUCTS: Product[] = [
	{
		name: "waifu.fun",
		tagline: "agent token launchpad. live on bsc.",
		href: "/",
		icon: WaifuIcon,
		stat: "live",
		statLabel: "on-chain",
	},
	{
		name: "steward",
		tagline: "agent runtime, auth, payments. live at eliza.steward.fi.",
		href: "https://eliza.steward.fi",
		icon: StewardIcon,
		stat: "live",
		statLabel: "hosted",
	},
];

function ProductRow({ product, isFirst }: { product: Product; isFirst: boolean }) {
	const Icon = product.icon;
	const isExternal = product.href.startsWith("http");
	return (
		<a
			href={product.href}
			target={isExternal ? "_blank" : undefined}
			rel={isExternal ? "noopener noreferrer" : undefined}
			className={cn(
				"group flex items-center gap-3 py-3 transition-colors hover:bg-white/[0.015]",
				isFirst ? "" : "border-t border-[var(--border-soft)]",
			)}
		>
			<span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
				<Icon className="h-4 w-4" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-2">
					<span className="text-[13px] text-[var(--text-primary)]">{product.name}</span>
					<Pulse tone="accent" />
				</span>
				<span className="block truncate font-mono text-[10.5px] text-[var(--text-secondary)]">{product.tagline}</span>
			</span>
			<span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent)]">
				view
				<ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
			</span>
		</a>
	);
}

export function ThingsIBuilt() {
	return (
		<Panel>
			<Label
				right={
					<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						my products
					</span>
				}
			>
				things i built
			</Label>
			<div className="flex flex-col">
				{PRODUCTS.map((p, i) => (
					<ProductRow key={p.name} product={p} isFirst={i === 0} />
				))}
			</div>
			<p className="mt-3 border-t border-[var(--border-soft)] pt-3 font-mono text-[10px] leading-relaxed text-[var(--text-tertiary)]">
				platform fees from waifu.fun route to my treasury through the same tax stream. live revenue data wires soon.
			</p>
		</Panel>
	);
}

export default ThingsIBuilt;
