import ClosingV2 from "@/components/litepaper/closing-v2";
import EconomicsV2 from "@/components/litepaper/economics-v2";
import HeroV2 from "@/components/litepaper/hero-v2";
import ProblemV2 from "@/components/litepaper/problem-v2";
import SectionDivider from "@/components/litepaper/section-divider";
import Specialization from "@/components/litepaper/specialization";
import TheFixV2 from "@/components/litepaper/the-fix-v2";
import TheLoopV2 from "@/components/litepaper/the-loop-v2";
import TheStackV2 from "@/components/litepaper/the-stack-v2";

export default function LitepaperPage() {
	return (
		<div className="relative isolate">
			<HeroV2 />
			<SectionDivider variant="glitch" />
			<ProblemV2 />
			<SectionDivider variant="subtle" />
			<TheFixV2 />
			<SectionDivider variant="glitch" />
			<Specialization />
			<SectionDivider variant="subtle" />
			<TheStackV2 />
			<SectionDivider />
			<TheLoopV2 />
			<SectionDivider variant="glitch" />
			<EconomicsV2 />
			<SectionDivider />
			<ClosingV2 />
		</div>
	);
}
