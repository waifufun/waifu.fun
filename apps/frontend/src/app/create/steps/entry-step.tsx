"use client";

import { useDraft } from "../draft-context";
import { Rocket, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export function EntryStep() {
	const { setMode } = useDraft();

	return (
		<div className="flex flex-col items-center gap-8 py-8">
			<div className="text-center space-y-2">
				<h1 className="text-2xl font-bold text-[#03FF24] uppercase tracking-widest">
					Create Your Waifu
				</h1>
				<p className="text-sm text-gray-400 max-w-md">
					Launch a new token with an AI agent, or import an existing token to add intelligence.
				</p>
			</div>

			<div className="grid sm:grid-cols-2 gap-6 w-full max-w-2xl">
				{/* Create New */}
				<button
					type="button"
					onClick={() => setMode("create")}
					className={cn(
						"group relative bg-black border-2 border-[#03FF24]/40 rounded-none p-6",
						"shadow-[4px_4px_0px_rgba(3,255,36,0.3)]",
						"hover:border-[#03FF24] hover:shadow-[6px_6px_0px_rgba(3,255,36,0.4)]",
						"hover:bg-[#03FF24]/5 transition-all cursor-pointer",
						"focus:outline-none focus:ring-2 focus:ring-[#03FF24] focus:ring-offset-2 focus:ring-offset-black",
						"text-left",
					)}
				>
					<div className="flex flex-col gap-4">
						<div className="w-12 h-12 bg-[#03FF24]/10 border border-[#03FF24]/30 rounded-none flex items-center justify-center group-hover:bg-[#03FF24]/20 transition-colors">
							<Rocket size={24} className="text-[#03FF24]" />
						</div>
						<div>
							<h2 className="text-lg font-bold text-white uppercase tracking-wider mb-2">
								Create New
							</h2>
							<p className="text-xs text-gray-400 leading-relaxed">
								Design your waifu from scratch. Choose a name, generate AI art,
								configure tokenomics, and launch on-chain.
							</p>
						</div>
						<div className="text-[10px] text-[#03FF24]/60 uppercase tracking-widest font-semibold mt-2">
							Full wizard &rarr; 6 steps
						</div>
					</div>
				</button>

				{/* Import Existing */}
				<button
					type="button"
					onClick={() => setMode("import")}
					className={cn(
						"group relative bg-black border-2 border-[#03FF24]/40 rounded-none p-6",
						"shadow-[4px_4px_0px_rgba(3,255,36,0.3)]",
						"hover:border-[#03FF24] hover:shadow-[6px_6px_0px_rgba(3,255,36,0.4)]",
						"hover:bg-[#03FF24]/5 transition-all cursor-pointer",
						"focus:outline-none focus:ring-2 focus:ring-[#03FF24] focus:ring-offset-2 focus:ring-offset-black",
						"text-left",
					)}
				>
					<div className="flex flex-col gap-4">
						<div className="w-12 h-12 bg-[#03FF24]/10 border border-[#03FF24]/30 rounded-none flex items-center justify-center group-hover:bg-[#03FF24]/20 transition-colors">
							<Download size={24} className="text-[#03FF24]" />
						</div>
						<div>
							<h2 className="text-lg font-bold text-white uppercase tracking-wider mb-2">
								Import Existing
							</h2>
							<p className="text-xs text-gray-400 leading-relaxed">
								Already have a token? Import it by contract address and configure
								an AI agent, runtime, and billing.
							</p>
						</div>
						<div className="text-[10px] text-[#03FF24]/60 uppercase tracking-widest font-semibold mt-2">
							Quick setup &rarr; Provide CA
						</div>
					</div>
				</button>
			</div>
		</div>
	);
}
