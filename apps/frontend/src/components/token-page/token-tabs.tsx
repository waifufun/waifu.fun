"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { IToken } from "@autofun/types";
import { ChartCandlestick, MessagesSquare, Stars, User, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRouter } from "@bprogress/next/app";

export default function TokenTabs({ token }: { token: IToken }) {
	const pathname = usePathname();
	const router = useRouter();
	const BASE_URL = `/token/${token.chain}/${token.chainId}/${token.contractAddress}`;
	const splitted = pathname?.split("/") || [];
	// const currentTab = !splitted || splitted.length < 6 ? "trades" : splitted[splitted.length - 1] || "trades";
	const currentTab = "trades";

	return (
		<Tabs value={currentTab} className="hidden lg:block">
			<TabsList className="grid w-full grid-cols-5">
				<TabsTrigger
					value="trades"
					className="inline-flex gap-2"
					onClick={() => {
						router.push(BASE_URL);
					}}
				>
					Trades <ChartCandlestick size={24} />
				</TabsTrigger>
				<TabsTrigger
					value="holders"
					className="inline-flex gap-2"
					onClick={() => {
						router.push(`${BASE_URL}/holders`);
					}}
				>
					Holders <Users size={24} />
				</TabsTrigger>
				<TabsTrigger
					value="create"
					className="inline-flex gap-2"
					onClick={() => {
						router.push(`${BASE_URL}/create`);
					}}
				>
					AI Create <Stars size={24} />
				</TabsTrigger>
				<TabsTrigger
					value="chat"
					className="inline-flex gap-2"
					onClick={() => {
						router.push(`${BASE_URL}/chat`);
					}}
				>
					Chat <MessagesSquare size={24} />
				</TabsTrigger>
				<TabsTrigger
					value="agents"
					className="inline-flex gap-2"
					onClick={() => {
						router.push(`${BASE_URL}/agents`);
					}}
				>
					Agents <User size={24} />
				</TabsTrigger>
			</TabsList>
		</Tabs>
	);
}
