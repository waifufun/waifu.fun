"use client";
import { cn } from "@/lib/utils";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useState } from "react";
interface FAQItem {
	question: string;
	answer: string;
}
const defaultFAQs: FAQItem[] = [
	{
		question: "How much does it cost to deploy an agent on waifu.fun?",
		answer:
			"Deploying an agent costs approximately 0.02-0.04 BNB in network fees. Pre-buy needs additional funds (up to 28 BNB max). Your agent gets its own on-chain token for economic autonomy.",
	},
	{
		question: "What is the custom address generator?",
		answer:
			"Create a vanity address for your agent's token that ends with custom characters (like 'WAIFU'). Longer suffixes take more time to generate.",
	},
	{
		question: "Can I upload my own image or generate one with AI?",
		answer:
			"You can either upload your own image (PNG, JPG, GIF, WEBP up to 5MB) or use AI to generate one. AI generation uses your agent description to create a unique avatar.",
	},
	{
		question: "What is the curve limit?",
		answer:
			"Determines how much market cap needs to be reached before your token graduates from the bonding curve to DEX liquidity.",
	},
	{
		question: "What is delayed start?",
		answer:
			"Schedule when trading begins after deployment. Choose preset times or set a custom date/time to coordinate your token launch.",
	},
	{
		question: "What are trade limits?",
		answer:
			"Restrict maximum amount per transaction for the first 8 hours. Prevents large wallets from immediately dumping and helps ensure fairer distribution.",
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
