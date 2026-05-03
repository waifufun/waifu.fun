"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

export default function NotFound() {
	return (
		<Suspense fallback={<div className="h-[80vh] flex items-center justify-center text-[#a1a1aa]">Loading...</div>}>
			<div className="h-[80vh] flex items-center justify-center px-4">
				<div className="my-auto flex flex-col items-center gap-6 max-w-lg text-center">
					<Image src="/404.png" width={495} height={100} unoptimized priority alt="404" />

					<div className="text-[#e4e4e7] text-4xl font-bold uppercase tracking-widest">Error</div>

					<div className="flex flex-col items-center gap-6">
						<div className="flex flex-col items-center gap-3">
							<div className="text-[#00ff87] text-2xl font-bold capitalize">404 · waifu not found</div>
							<div className="text-[#a1a1aa] text-base leading-relaxed">
								Looks like this waifu has gone missing. Navigate back to waifu.fun and continue where the real action
								happens.
							</div>
						</div>
						<Link href="/">
							<button
								type="button"
								className="px-6 py-3 bg-[#00ff87] hover:bg-[#00ff87] text-[#08080a] font-semibold rounded-sm transition-colors"
							>
								Back to Trading
							</button>
						</Link>
					</div>
				</div>
			</div>
		</Suspense>
	);
}
