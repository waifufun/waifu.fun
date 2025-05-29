"use client";
import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { useRouter } from "@bprogress/next/app";

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
		<Tabs defaultValue={activeKey} value={activeKey} className="w-full">
			<TabsList className="grid w-full grid-cols-5">
				<TabsTrigger
					value="new"
					onClick={() => {
						router.push(
							`${pathname}?${createQueryString({
								category: "new",
							})}`,
						);
					}}
				>
					New
				</TabsTrigger>
				<TabsTrigger
					value="trending"
					onClick={() => {
						router.push(
							`${pathname}?${createQueryString({
								category: "trending",
							})}`,
						);
					}}
				>
					Trending
				</TabsTrigger>
				<TabsTrigger
					value="featured"
					onClick={() => {
						router.push(
							`${pathname}?${createQueryString({
								category: "featured",
							})}`,
						);
					}}
				>
					Featured
				</TabsTrigger>
				<TabsTrigger
					value="marketcap"
					onClick={() => {
						router.push(
							`${pathname}?${createQueryString({
								category: "marketcap",
							})}`,
						);
					}}
				>
					Marketcap
				</TabsTrigger>
				<TabsTrigger
					value="about-to-bond"
					onClick={() => {
						router.push(
							`${pathname}?${createQueryString({
								category: "about-to-bond",
							})}`,
						);
					}}
				>
					About to Bond
				</TabsTrigger>
			</TabsList>
		</Tabs>
	);
}
