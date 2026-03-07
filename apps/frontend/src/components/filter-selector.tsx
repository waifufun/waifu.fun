"use client";
import { Fragment, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "@bprogress/next/app";
import { SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar";
import Link from "next/link";
import { ChartBar, Flame, Hourglass, Sparkles, Star, Zap } from "lucide-react";

const items = [
	{
		title: "ALL",
		value: "/",
		icon: Zap,
	},

	{
		title: "FEATURED",
		value: "featured",
		icon: Star,
	},
	{
		title: "HOT NOW",
		value: "trending",
		icon: Flame,
	},
	{
		title: "NEWEST",
		value: "new",
		icon: Sparkles,
	},
	{
		title: "MARKETCAP",
		value: "marketcap",
		icon: ChartBar,
	},
	{
		title: "BONDING SOON",
		value: "about-to-bond",
		icon: Hourglass,
	},
];

export default function FilterSelector() {
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

	const currentKey = searchParams.get("category");
	const activeKey = currentKey ? currentKey : "new";

	return (
		<Fragment>
			{items?.map((item) => (
				<SidebarMenuItem key={item.title}>
					<SidebarMenuButton
						asChild
						isActive={activeKey === item.value}
						tooltip={item.title}
						className={
							activeKey === item.value
								? "bg-waifufun-background-action-highlight/20"
								: "text-white hover:bg-[rgba(0,255,135,0.08)] hover:text-[#00ff87]"
						}
					>
						<Link href={item?.value ? `/?${createQueryString({ category: item.value })}` : "/"}>
							<item.icon className="h-4 w-4" />
							<span>{item.title}</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
			))}
		</Fragment>
		// <Tabs defaultValue={activeKey} value={activeKey} className="w-full">
		// 	<TabsList className="flex w-full overflow-x-auto no-scrollbar">
		// 		<TabsTrigger
		// 			value="new"
		// 			onClick={() => {
		// 				router.push(
		// 					`${pathname}?${createQueryString({
		// 						category: "new",
		// 					})}`,
		// 				);
		// 			}}
		// 		>
		// 			New
		// 		</TabsTrigger>
		// 		<TabsTrigger
		// 			value="trending"
		// 			onClick={() => {
		// 				router.push(
		// 					`${pathname}?${createQueryString({
		// 						category: "trending",
		// 					})}`,
		// 				);
		// 			}}
		// 		>
		// 			Trending
		// 		</TabsTrigger>
		// 		<TabsTrigger
		// 			value="featured"
		// 			onClick={() => {
		// 				router.push(
		// 					`${pathname}?${createQueryString({
		// 						category: "featured",
		// 					})}`,
		// 				);
		// 			}}
		// 		>
		// 			Featured
		// 		</TabsTrigger>
		// 		<TabsTrigger
		// 			value="marketcap"
		// 			onClick={() => {
		// 				router.push(
		// 					`${pathname}?${createQueryString({
		// 						category: "marketcap",
		// 					})}`,
		// 				);
		// 			}}
		// 		>
		// 			Marketcap
		// 		</TabsTrigger>

		// 	</TabsList>
		// </Tabs>
	);
}
