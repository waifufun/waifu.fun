import Hero from "@/components/litepaper/hero";
import Trenches from "@/components/litepaper/trenches";
import Different from "@/components/litepaper/different";
import TheStack from "@/components/litepaper/the-stack";
import TheLoop from "@/components/litepaper/the-loop";
import Tiers from "@/components/litepaper/tiers";
import Closing from "@/components/litepaper/closing";
import SectionDivider from "@/components/litepaper/section-divider";

export default function LitepaperPage() {
	return (
		<div className="relative isolate">
			<Hero />
			<SectionDivider />
			<Trenches />
			<SectionDivider variant="subtle" />
			<Different />
			<SectionDivider />
			<TheStack />
			<SectionDivider variant="subtle" />
			<TheLoop />
			<SectionDivider />
			<Tiers />
			<SectionDivider variant="subtle" />
			<Closing />
		</div>
	);
}
