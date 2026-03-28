import Hero from "@/components/litepaper/hero";
import Trenches from "@/components/litepaper/trenches";
import Different from "@/components/litepaper/different";
import TheStack from "@/components/litepaper/the-stack";
import TheLoop from "@/components/litepaper/the-loop";
import Tiers from "@/components/litepaper/tiers";
import Closing from "@/components/litepaper/closing";

export default function LitepaperPage() {
	return (
		<div className="relative isolate">
			<Hero />
			<Trenches />
			<Different />
			<TheStack />
			<TheLoop />
			<Tiers />
			<Closing />
		</div>
	);
}
