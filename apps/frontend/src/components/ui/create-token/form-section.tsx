import { cn } from "@/lib/utils";
import type React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
interface FormSectionProps {
	title?: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
	collapsible?: boolean;
	defaultOpen?: boolean;
	icon?: React.ReactNode;
}
export function FormSection({
	title,
	description,
	children,
	className,
	collapsible = false,
	defaultOpen = true,
	icon,
}: FormSectionProps) {
	return (
		<div
			className={cn(
				"bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm transition-all hover:border-[rgba(255,255,255,0.08)]",
				collapsible && title ? "p-0" : "p-3 md:p-4",
				className,
			)}
		>
			{collapsible && title ? (
				<Accordion type="single" collapsible defaultValue={defaultOpen ? "item-1" : ""} className="w-full">
					<AccordionItem value="item-1" className="border-b-0">
						<AccordionTrigger className="p-3 md:p-4 hover:no-underline focus-visible:ring-1 focus-visible:ring-[#00ff87] rounded-sm text-sm font-bold text-[#00ff87] uppercase tracking-wider cursor-pointer group [&>svg]:text-[#00ff87]/70">
							<div className="flex items-center gap-2 flex-grow text-left">
								{icon && <span className="text-[#00ff87]/70 group-hover:text-[#00ff87]">{icon}</span>}
								<div>
									<span>{title}</span>
									{description && (
										<p className="text-[10px] text-[#52525b] font-normal normal-case mt-0.5">{description}</p>
									)}
								</div>
							</div>
						</AccordionTrigger>
						<AccordionContent className="p-3 md:p-4 pt-0">
							<div className="space-y-3">{children}</div>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			) : (
				<>
					{title && (
						<div className="flex justify-between items-start mb-3">
							<div className="flex items-center gap-2">
								{icon && <span className="text-[#00ff87]/70">{icon}</span>}
								<div>
									<h2 className="text-sm font-bold text-[#00ff87] uppercase tracking-wider">{title}</h2>
									{description && <p className="text-[10px] text-[#52525b] mt-0.5">{description}</p>}
								</div>
							</div>
						</div>
					)}
					<div className="space-y-3">{children}</div>
				</>
			)}
		</div>
	);
}
interface FormLabelProps {
	htmlFor?: string;
	required?: boolean;
	children: React.ReactNode;
	className?: string;
}
export function FormLabel({ htmlFor, required, children, className }: FormLabelProps) {
	return (
		<label
			htmlFor={htmlFor}
			className={cn("text-xs text-[#71717a] uppercase tracking-wider font-medium flex items-center gap-1", className)}
		>
			{children}
			{required && <span className="text-red-500">*</span>}
		</label>
	);
}
interface FormHelperTextProps {
	children: React.ReactNode;
	variant?: "default" | "error" | "success" | "warning";
	className?: string;
}
export function FormHelperText({ children, variant = "default", className }: FormHelperTextProps) {
	const v = { default: "text-[#52525b]", error: "text-red-400", success: "text-[#00ff87]", warning: "text-yellow-400" };
	return <p className={cn("text-[10px] mt-1", v[variant], className)}>{children}</p>;
}
interface ValidationMessageProps {
	message: string | undefined;
	isValid?: boolean;
	className?: string;
}
export function ValidationMessage({ message, isValid, className }: ValidationMessageProps) {
	if (!message) return null;
	return (
		<p className={cn("text-xs mt-1 flex items-center gap-1", isValid ? "text-[#00ff87]" : "text-red-400", className)}>
			<span className={cn("w-1.5 h-1.5 rounded-full", isValid ? "bg-[#00ff87]" : "bg-red-400")} />
			{message}
		</p>
	);
}
