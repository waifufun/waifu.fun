import Architecture from "@/components/litepaper/architecture";
import Closing from "@/components/litepaper/closing";
import Economics from "@/components/litepaper/economics";
import Hero from "@/components/litepaper/hero";
import Moat from "@/components/litepaper/moat";
import Problem from "@/components/litepaper/problem";
import Stack from "@/components/litepaper/stack";
import Tiers from "@/components/litepaper/tiers";
import Vision from "@/components/litepaper/vision";

export default function LitepaperPage() {
	return (
		<div className="relative isolate">
			<Hero />
			<Problem />
			<Vision />
			<Stack />
			<Economics />
			<Tiers />
			<Moat />
			<Architecture />
			<Closing />
		</div>
	);
}
