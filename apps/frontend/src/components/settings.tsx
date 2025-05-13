import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Cog } from "lucide-react";
import Divider from "./divider";

export default function Settings() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" size="icon">
					<Cog />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="max-w-max w-full" align="end">
				<div className="flex flex-col gap-4">
					<h4 className="font-medium leading-none">Settings</h4>

					<div className="flex flex-col gap-4">
						<Label htmlFor="width">Slippage tolerance</Label>
						<Input id="width" defaultValue="5%" className="col-span-2 h-8" />
					</div>
					<Divider />

					<div className="flex flex-col gap-4">
						<Label htmlFor="width">Default Explorer</Label>
						<div className="flex gap-2">
							{["Solscan", "Explorer", "SolanaFM"].map((item, _) => (
								<Button key={item} variant="outline">
									{item}
								</Button>
							))}
						</div>
					</div>
					<Divider />
					<div className="flex flex-col gap-4">
						<Label htmlFor="width">Language</Label>
						<Input id="width" defaultValue="English" className="col-span-2 h-8" readOnly disabled />
					</div>
					<Divider />
					<div className="flex flex-col gap-4">
						<Label htmlFor="width">RPC Connection</Label>
						<Input id="width" defaultValue="100%" className="col-span-2 h-8" />
					</div>
					<Divider />
					<div className="flex items-center gap-4">
						<Label className="text-xs">v1.0.0</Label>
						<Label className="text-xs text-muted-foreground">b17e4aee837c3db2bdf6</Label>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
