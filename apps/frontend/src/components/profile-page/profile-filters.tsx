"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ProfileChainSelector from "./profile-chain-selector";

export default function ProfileFilters() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const router = useRouter();

	const createQueryString = useCallback(
		(params: Record<string, string>) => {
			const urlParams = new URLSearchParams(searchParams.toString());

			for (const [name, value] of Object.entries(params)) {
				if (value) {
					urlParams.set(name, String(value));
				} else {
					urlParams.delete(name);
				}
			}

			return urlParams.toString();
		},
		[searchParams],
	);

	const buttons = [
		{ label: "Tokens Bought", value: "tokensBought" },
		{ label: "Tokens Created", value: "tokenCreated" },
	];

	const activeCategory = searchParams.get("category") || "tokensBought";

	return (
		<div className="px-7 py-2">
			<div className="flex w-full items-center">
				<div className="w-[303px] h-[40px] flex items-center rounded-md bg-gradient-to-t from-[#121212] to-[#171717] p-[2px]">
					{buttons.map((btn) => {
						const isActive = btn.value === activeCategory;
						return (
							<button
								key={btn.value}
								type="button"
								onClick={() => router.push(`${pathname}?${createQueryString({ category: btn.value })}`)}
								className={`flex-1 h-full text-base rounded-md transition-all ${
									isActive
										? "text-white border border-autofun-background-action-highlight font-normal"
										: " text-autofun-icon-secondary"
								} hover:outline-1 hover:outline-autofun-background-action-highlight`}
							>
								{btn.label}
							</button>
						);
					})}
				</div>
				<div className="ml-auto">
					<ProfileChainSelector />
				</div>
			</div>
		</div>
	);
}
