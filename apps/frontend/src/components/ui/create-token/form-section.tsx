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
				"bg-black/30 border-2 border-[#00FF87]/40 rounded-none shadow-[4px_4px_0px_rgba(0,255,135,0.3)]",
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
								"p-3 md:p-4 hover:no-underline focus-visible:ring-1 focus-visible:ring-[#00FF87] focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-none data-[state=open]:bg-[#00FF87]/10 text-sm font-bold text-[#00FF87] uppercase tracking-wider cursor-pointer",
								"[&>svg]:text-[#00FF87]/70 [&>svg]:hover:text-[#00FF87]",
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
							<h2 className="text-sm font-bold text-[#00FF87] uppercase tracking-wider">{title}</h2>
						</div>
					)}
					<div className="space-y-3">{children}</div>
				</>
			)}
		</div>
	);
}
