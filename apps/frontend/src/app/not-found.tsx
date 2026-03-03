"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";

export default function NotFound() {
	return (
		<Suspense fallback={<div className="h-[80vh] flex items-center justify-center">Loading...</div>}>
			<div className="h-[80vh] flex items-center justify-center">
				<div className="my-auto flex flex-col items-center gap-6">
					<Image src="/404.png" width={495} height={100} unoptimized priority alt="404" />

					<div className=" text-waifufun-text-primary text-4xl font-bold font-satoshi uppercase tracking-[3.60px]">
						Error
					</div>

					<div className="flex flex-col items-center gap-6">
						<div className="flex flex-col items-center gap-3">
							<div className="text-waifufun-background-action-highlight text-2xl font-bold font-satoshi capitalize">
								You auto-know… this page is gone.
							</div>
							<div className="text-waifufun-text-primary text-lg font-bold font-satoshi capitalize">
								Looks like you’ve reached a dead end. Navigate back to waifu.fun and continue where the real action
								happens.
							</div>
						</div>
						<Link href="/">
							<Button variant="outline">Back to Trading</Button>
						</Link>
					</div>
				</div>
			</div>
		</Suspense>
	);
}
