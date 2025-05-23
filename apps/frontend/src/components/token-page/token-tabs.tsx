'use client';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { IToken } from "@autofun/types";
import { ChartCandlestick, MessagesSquare, Stars, User, Users } from "lucide-react";
import { useParams, usePathname } from "next/navigation";

export default function TokenTabs({ token }: { token: IToken }) {
	const params = useParams();
	const pathname = usePathname();
	console.log(pathname);
	return (
		<Tabs defaultValue="trades">
			<TabsList className="grid w-full grid-cols-5">
				<TabsTrigger value="trades" className="inline-flex gap-2">
					Trades <ChartCandlestick size={24} />
				</TabsTrigger>
				<TabsTrigger value="holders" className="inline-flex gap-2">
					Holders <Users size={24} />
				</TabsTrigger>
				<TabsTrigger value="ai-create" className="inline-flex gap-2">
					AI Create <Stars size={24} />
				</TabsTrigger>
				<TabsTrigger value="chat" className="inline-flex gap-2">
					Chat <MessagesSquare size={24} />
				</TabsTrigger>
				<TabsTrigger value="agents" className="inline-flex gap-2">
					Agents <User size={24} />
				</TabsTrigger>
			</TabsList>
		</Tabs>
	);
}
