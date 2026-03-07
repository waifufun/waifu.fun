"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function TokensFilter() {
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
		// { label: "Tokens Bought", value: "tokens-bought" },
		{ label: "Tokens Created", value: "tokens-created" },
	];

	return (
		<div className="w-full justify-around md:justify-start p-2 place-self-center flex items-center">
			{buttons.map((btn) => {
				const isActive = (currentMode ?? "tokens-bought") === btn.value;
				return (
					<button
						key={btn.value}
						type="button"
						onClick={() => router.push(`${pathname}?${createQueryString({ mode: btn.value })}`)}
						className={`text-xs px-3 cursor-pointer py-1 h-auto rounded-sm border ${isActive ? "border-black bg-[#00ff87] text-black hover:bg-[#00ff87]" : "border-transparent text-gray-300 hover:text-[#00ff87] hover:bg-[rgba(0,255,135,0.08)] hover:border-[#00ff87]/30"}`}
					>
						{btn.label}
					</button>
				);
			})}
		</div>
	);
}
