import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Trades from "./trades";
import Holders from "./holders";
import AICreate from "./ai-create";
import Chat from "./chat";
import Agents from "./agents";
import type { IToken } from "@autofun/types";
import { ChartCandlestick, MessagesSquare, Stars, User, Users } from "lucide-react";

export default function TokenTabs({ token }: { token: IToken }) {
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
			<TabsContent value="trades">
				<Trades token={token} />
			</TabsContent>
			<TabsContent value="holders">
				<Holders token={token} />
			</TabsContent>
			<TabsContent value="ai-create">
				<AICreate />
			</TabsContent>
			<TabsContent value="chat">
				<Chat token={token} />
			</TabsContent>
			<TabsContent value="agents">
				<Agents />
			</TabsContent>
		</Tabs>
	);
}
