import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { SurfaceCard } from "@/components/ui/surface-card";

/**
 * Calm, branded 'agent not found' state. Triggered when fetchAgent
 * returns null (the address resolved nothing across v2/agents or the
 * legacy tokens fallback).
 *
 * Style: matches the AgentHomeV2 panel rhythm (SurfaceCard, mono caps,
 * single accent). No 'oops!' copy, no exclamation marks.
 */
export default function NotFound() {
	return (
		<main className="flex min-h-[100dvh] items-center justify-center px-6 text-white">
			<SurfaceCard padding="lg" className="w-full max-w-md text-center">
				<div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/40">agent / 404</div>
				<h1 className="mt-3 text-2xl tracking-tight md:text-3xl">no agent at this address</h1>
				<p className="mx-auto mt-3 max-w-[44ch] text-sm leading-relaxed text-white/55">
					the address resolved cleanly but nothing on waifu.fun is mapped to it. it may have never launched, may still
					be booting, or the address is off by a character.
				</p>
				<div className="mt-7 flex items-center justify-center">
					<Link
						href="/agents"
						className="inline-flex h-10 items-center gap-2 rounded-sm border border-white/15 px-5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/65 transition-colors duration-200 hover:border-white/30 hover:text-white/95"
					>
						<ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
						browse all agents
					</Link>
				</div>
			</SurfaceCard>
		</main>
	);
}
