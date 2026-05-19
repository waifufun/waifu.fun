/**
 * SurfaceCard variant definitions. Lives in its own module so unit tests can
 * import the cva spec without dragging the JSX (vitest is configured with the
 * node env and the rolldown loader does not parse .tsx out of the box).
 */
import { cva } from "class-variance-authority";

export const surfaceCardVariants = cva(
	"flex flex-col rounded-sm border transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff87]/40",
	{
		variants: {
			variant: {
				default: "border-white/10 bg-[#08080a]",
				interactive: "group border-white/10 bg-[#08080a] hover:border-[#00ff87]/30 hover:bg-[#0a0a0c] cursor-pointer",
				accent: "border-[#00ff87]/30 bg-[#00ff87]/[0.03]",
				danger: "border-red-500/25 bg-red-500/[0.03]",
			},
			tone: {
				default: "",
				nested: "bg-[#0a0a0c]",
				panel: "bg-[#111114]",
			},
			padding: {
				none: "",
				sm: "p-3",
				md: "p-4",
				lg: "p-5 md:p-6",
			},
		},
		defaultVariants: {
			variant: "default",
			tone: "default",
			padding: "md",
		},
	},
);
