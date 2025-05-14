import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Trades from "./trades";
import Holders from "./holders";
import AICreate from "./ai-create";
import Chat from "./chat";
import Agents from "./agents";

export default function TokenTabs() {
	return (
		<Tabs defaultValue="trades">
			<TabsList className="grid w-full grid-cols-5">
				<TabsTrigger value="trades">Trades</TabsTrigger>
				<TabsTrigger value="holders">Holders</TabsTrigger>
				<TabsTrigger value="ai-create">AI Create</TabsTrigger>
				<TabsTrigger value="chat">Chat</TabsTrigger>
				<TabsTrigger value="agents">Agents</TabsTrigger>
			</TabsList>
			<TabsContent value="trades">
				<Trades />
			</TabsContent>
			<TabsContent value="holders">
				<Holders />
			</TabsContent>
			<TabsContent value="ai-create">
				<AICreate />
			</TabsContent>
			<TabsContent value="chat">
				<Chat />
			</TabsContent>
			<TabsContent value="agents">
				<Agents />
			</TabsContent>
		</Tabs>
	);
}
