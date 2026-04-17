import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
	return (
		<div className="min-h-[100dvh] bg-black text-white flex items-center justify-center px-6">
			<div className="max-w-md w-full text-center">
				<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#22c55e] mb-3">404 / not found</div>
				<h1 className="text-2xl md:text-3xl tracking-tight mb-3">agent not found</h1>
				<p className="text-sm text-white/50 leading-relaxed mb-8">
					this address doesn't map to any agent we know. maybe it never launched, maybe it's still booting, or maybe the
					address is off.
				</p>
				<Link
					href="/"
					className="inline-flex items-center gap-2 h-10 px-5 rounded-sm border border-white/15 text-[11px] font-mono uppercase tracking-[0.2em] text-white/70 hover:text-white hover:border-white/30 transition-colors"
				>
					<ArrowLeft className="w-3 h-3" />
					back to waifu.fun
				</Link>
			</div>
		</div>
	);
}
