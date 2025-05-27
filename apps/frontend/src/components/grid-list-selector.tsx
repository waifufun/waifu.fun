"use client";

import { useCallback } from "react";
import { Button } from "./ui/button";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Grid, List } from "lucide-react";

export default function GridListSelector() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
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

	const currentKey = searchParams.get("view");
	const activeKey = currentKey ? currentKey : "grid";

	return (
		<div className="flex items-center gap-2">
			{["grid", "list"].map((mode) => {
				const isActive = mode === activeKey;
				return (
					<Link
						key={mode}
						href={`${pathname}?${createQueryString({
							view: mode,
						})}`}
					>
						<Button variant={isActive ? "outline" : "secondary"} size="icon">
							{mode === "list" ? <List /> : <Grid />}
						</Button>
					</Link>
				);
			})}
		</div>
	);
}
