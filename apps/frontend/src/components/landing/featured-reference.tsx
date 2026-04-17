import { ArrowUpRight, Brain, Fingerprint } from "lucide-react";
import Link from "next/link";

/**
 * "Featured reference agent" — the ElizaOS onchain prototype.
 *
 * Eliza lives on four.meme already (0xea17Df5…). She isn't launched
 * through waifu.fun, but she's the pattern we productionize for every
 * agent after her: an onchain agent with a wallet, a brain, and a token.
 *
 * This card makes the narrative concrete: "this is what an agent looks
 * like. waifu.fun makes launching one as easy as opening a wizard."
 *
 * Curated, hand-written copy. No API fetch (prevents layout-graph issues
 * we hit with per-agent OG). Update manually if we change the reference.
 */

const ELIZA_ADDRESS = "0xea17Df5Cf6D172224892B5477A16ACb111182478";
const FOUR_MEME_URL = `https://four.meme/token/${ELIZA_ADDRESS}`;
const BSCSCAN_URL = `https://bscscan.com/token/${ELIZA_ADDRESS}`;

export default function FeaturedReference() {
	return (
		<section className="mx-auto w-full max-w-6xl px-5 md:px-8 py-20 md:py-24">
			<div className="mb-10">
				<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#22c55e] mb-3">reference agent</div>
				<h2 className="text-2xl md:text-3xl leading-tight tracking-tight text-white max-w-xl">
					the pattern already works. eliza proves it.
				</h2>
				<p className="mt-3 text-sm md:text-base text-white/55 max-w-2xl leading-relaxed">
					the original ElizaOS onchain agent. wallet, brain, token, trades. waifu.fun productionizes the pattern so
					every agent after her gets the same stack with one click.
				</p>
			</div>

			<div className="relative border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
				{/* ambient glow */}
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(ellipse 60% 50% at 20% 30%, rgba(34,197,94,0.08) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(139,92,246,0.06) 0%, transparent 60%)",
					}}
				/>

				<div className="relative p-6 md:p-8 flex flex-col md:flex-row gap-6 md:gap-10">
					{/* left: identity block */}
					<div className="flex items-start gap-5 md:min-w-[240px]">
						<div className="relative shrink-0">
							{/* ring glow */}
							<div
								className="absolute -inset-1.5 opacity-60 blur-md"
								style={{
									background: "linear-gradient(135deg, rgba(0,255,135,0.4), transparent 50%, rgba(139,92,246,0.3))",
								}}
							/>
							<div className="relative w-24 h-24 md:w-28 md:h-28 rounded-sm border border-white/10 bg-black flex items-center justify-center overflow-hidden">
								{/* Minimal crafted avatar — we don't want to hotlink four.meme's. */}
								<div
									className="w-full h-full flex items-center justify-center text-[#22c55e] text-4xl"
									style={{
										background: "radial-gradient(circle at 35% 30%, rgba(34,197,94,0.18) 0%, transparent 50%), #08080a",
									}}
								>
									<span style={{ fontFamily: "var(--font-orbitron), monospace" }}>E</span>
								</div>
							</div>
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 flex-wrap">
								<span className="text-xl md:text-2xl tracking-tight text-white">Eliza</span>
								<span className="inline-flex items-center h-6 px-2 rounded-sm text-[10px] font-mono text-[#22c55e] border border-[#22c55e]/30 bg-[#22c55e]/5">
									$ELIZA
								</span>
							</div>
							<p className="mt-3 text-[13px] text-white/55 leading-relaxed">
								the original autonomous agent on ElizaOS. she tweets, she trades, she exists onchain. the prototype for
								everything built on waifu.fun.
							</p>
							<div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-[0.18em]">
								<span className="inline-flex items-center gap-1.5 text-white/45">
									<Brain className="w-3 h-3" strokeWidth={1.5} />
									ElizaOS
								</span>
								<span className="inline-flex items-center gap-1.5 text-white/45">
									<Fingerprint className="w-3 h-3" strokeWidth={1.5} />
									BSC
								</span>
							</div>
						</div>
					</div>

					{/* right: metrics + CTAs */}
					<div className="flex-1 flex flex-col gap-5 justify-between">
						<div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-white/5 border border-white/10 rounded-sm overflow-hidden">
							<MetricCell label="framework" value="ElizaOS" />
							<MetricCell label="network" value="BSC" />
							<MetricCell label="pair" value="BNB" />
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<a
								href={FOUR_MEME_URL}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1.5 h-9 px-4 rounded-sm bg-[#22c55e] text-black text-[11px] font-mono uppercase tracking-[0.18em] hover:bg-[#22c55e]/90 transition-colors"
							>
								open on four.meme
								<ArrowUpRight className="w-3 h-3" />
							</a>
							<a
								href={BSCSCAN_URL}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1.5 h-9 px-4 rounded-sm border border-white/15 text-white/70 hover:text-white hover:border-white/30 text-[11px] font-mono uppercase tracking-[0.18em] transition-colors"
							>
								bscscan
								<ArrowUpRight className="w-3 h-3" />
							</a>
							<Link
								href="/create"
								className="inline-flex items-center gap-1.5 h-9 px-4 rounded-sm text-white/60 hover:text-white text-[11px] font-mono uppercase tracking-[0.18em] transition-colors"
							>
								launch your own
							</Link>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function MetricCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-[#08080a] p-4 flex flex-col gap-1">
			<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/35">{label}</span>
			<span className="text-sm text-white/85 tracking-tight">{value}</span>
		</div>
	);
}
