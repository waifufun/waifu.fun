"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function PointsFilter() {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();

	const currentMode = searchParams.get("mode");

	const createQueryString = useCallback(
		(params: { mode: string }) => {
			const urlParams = new URLSearchParams(searchParams.toString());
			urlParams.set("mode", params.mode);
			return urlParams.toString();
		},
		[searchParams],
	);

	const buttons = [
		{ label: "Per Transaction", value: "per-transaction" },
		{ label: "Per Token", value: "per-token" },
	];

	return (
		<div className="w-[303px] h-[44px] place-self-center flex items-center rounded-md bg-gradient-to-t from-[#121212] to-[#171717] p-[2px]">
			{buttons.map((btn) => {
				const isActive = currentMode === btn.value;
				return (
					<button
						key={btn.value}
						type="button"
						onClick={() => router.push(`${pathname}?${createQueryString({ mode: btn.value })}`)}
						className={`flex-1 h-full text-base rounded-md transition-all ${
							isActive
								? "text-white border border-autofun-background-action-highlight font-normal"
								: "text-autofun-icon-secondary"
						} hover:outline-1 hover:outline-autofun-background-action-highlight`}
					>
						{btn.label}
					</button>
				);
			})}
		</div>
	);
}
