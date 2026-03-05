import { cn } from "@/lib/utils";
import type React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
// ChevronDown is automatically included by AccordionTrigger, so direct import is not needed unless for custom use.

interface FormSectionProps {
	title?: string;
	children: React.ReactNode;
	className?: string;
	collapsible?: boolean;
	defaultOpen?: boolean;
}

export function FormSection({ title, children, className, collapsible = false, defaultOpen = true }: FormSectionProps) {
	return (
		<div
			className={cn(
				"bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm",
				// If collapsible and has a title, outer padding is removed as it's handled by trigger/content
				// Otherwise, apply original padding
				collapsible && title ? "p-0" : "p-3 md:p-4",
				className,
			)}
		>
			{collapsible && title ? (
				<Accordion type="single" collapsible defaultValue={defaultOpen ? "item-1" : ""} className="w-full">
					<AccordionItem value="item-1" className="border-b-0">
						<AccordionTrigger
							className={cn(
								"p-3 md:p-4 hover:no-underline focus-visible:ring-1 focus-visible:ring-[#00ff87] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a] rounded-sm text-sm font-bold text-[#00ff87] uppercase tracking-wider cursor-pointer transition-colors",
								"[&>svg]:text-[#00ff87]/70 [&>svg]:hover:text-[#00ff87]",
							)}
						>
							<div className="flex-grow text-left">{title}</div>
						</AccordionTrigger>
						<AccordionContent className="p-3 md:p-4 pt-0">
							<div className="space-y-3">{children}</div>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			) : (
				<>
					{title && (
						<div className="flex justify-between items-center mb-3">
							<h2 className="text-sm font-bold text-[#00ff87] uppercase tracking-wider">{title}</h2>
						</div>
					)}
					<div className="space-y-3">{children}</div>
				</>
			)}
		</div>
	);
}
