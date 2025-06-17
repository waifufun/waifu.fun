"use client";

import { Fragment, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Grid, List } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar";

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
		<Fragment>
			{["grid", "list"].map((mode) => {
				const isActive = mode === activeKey;
				return (
					<SidebarMenuItem key={mode}>
						<SidebarMenuButton
							asChild
							isActive={isActive}
							className={
								isActive
									? "bg-autofun-background-action-highlight/20"
									: "text-white hover:bg-[#03FF24]/10 hover:text-[#03FF24]"
							}
						>
							<Link
								href={`${pathname}?${createQueryString({
									view: mode,
								})}`}
							>
								{mode === "list" ? <List className="size-4" /> : <Grid className="size-4" />}

								<span className="uppercase">{mode} view</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				);
			})}
		</Fragment>
	);
}
