"use client";
import { cn } from "@/lib/utils";
import { HelpCircle, ChevronDown } from "lucide-react";
import { useState } from "react";
interface FAQItem {
	question: string;
	answer: string;
}
const defaultFAQs: FAQItem[] = [
	{
		question: "How much does it cost to create a token?",
		answer:
			"Creating a token costs approximately 0.02-0.04 BNB in network fees. Pre-buy needs additional BNB (up to 28 BNB max).",
	},
	{
		question: "What is the custom address generator?",
		answer:
			"Create a vanity address for your token that ends with custom characters (like 'FUN'). Longer suffixes take more time.",
	},
	{
		question: "What's the difference between Auto and Manual?",
		answer:
			"Auto uses AI to generate images. Manual lets you upload your own and access advanced options like curve limits and trade limits.",
	},
	{
		question: "What is the curve limit?",
		answer: "Determines how much BNB needs to be raised before graduation to PancakeSwap.",
	},
	{
		question: "What is delayed start?",
		answer: "Schedule when trading begins. Choose preset times or set a custom date/time.",
	},
	{
		question: "What are trade limits?",
		answer: "Restrict max BNB per transaction for the first 8 hours. Prevents large wallets from immediately dumping.",
	},
];
export function FAQAccordion({ className, faqs = defaultFAQs }: { className?: string; faqs?: FAQItem[] }) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	return (
		<div
			className={cn("bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 md:p-6", className)}
		>
			<div className="flex items-center gap-2 mb-6">
				<HelpCircle size={18} className="text-[#00ff87]" />
				<h3 className="text-sm font-bold text-[#00ff87] uppercase tracking-wider">frequently asked questions</h3>
			</div>
			<div className="space-y-2">
				{faqs.map((faq, i) => {
					const isOpen = openIndex === i;
					return (
						<div
							key={faq.question}
							className={cn(
								"border rounded-sm transition-all",
								isOpen
									? "border-[rgba(0,255,135,0.2)] bg-[rgba(0,255,135,0.03)]"
									: "border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.08)]",
							)}
						>
							<button
								type="button"
								onClick={() => setOpenIndex(isOpen ? null : i)}
								className="w-full flex items-center justify-between p-4 text-left focus:outline-none focus:ring-2 focus:ring-[#00ff87] focus:ring-inset rounded-sm"
							>
								<span className={cn("text-sm font-medium", isOpen ? "text-[#e4e4e7]" : "text-[#a1a1aa]")}>
									{faq.question}
								</span>
								<ChevronDown
									size={16}
									className={cn(
										"text-[#52525b] transition-transform flex-shrink-0 ml-2",
										isOpen && "rotate-180 text-[#00ff87]",
									)}
								/>
							</button>
							<div
								className={cn("overflow-hidden transition-all", isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0")}
							>
								<p className="px-4 pb-4 text-sm text-[#71717a] leading-relaxed">{faq.answer}</p>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
