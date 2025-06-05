import { cn } from "@/lib/utils";

export default function Skeleton({ className }: { className?: string }) {
	return (
		<div
			className={cn([
				"h-5 rounded-sm animate-accumulate w-12 bg-gradient-to-t from-[#121212] to-[#171717]",
				className ? className : "",
			])}
		/>
	);
}
