/**
 * Button variant definitions. Lives in its own .ts module so unit tests can
 * import the cva spec without dragging JSX (vitest runs in the node env and
 * the rolldown loader does not parse .tsx out of the box).
 *
 * Canonical pair for new code: `primary` (accent CTA) + `ghost` (low emphasis).
 * `accentOutline` + `danger` cover the two specialty cases. Everything else is
 * a backwards-compat alias that future passes will retire.
 */
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
	"inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap font-medium text-sm transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive rounded-sm",
	{
		variants: {
			variant: {
				// Canonical accent CTA. Solid green on near-black, dark text.
				primary: "bg-[#00ff87] text-black hover:bg-[#00ff87]/90 shadow-xs",
				// Alias for `primary`. Existing call sites that omit `variant` get
				// the same look without a token-resolution gamble.
				default: "bg-[#00ff87] text-black hover:bg-[#00ff87]/90 shadow-xs",
				// Canonical low-emphasis CTA. Transparent fill, hairline ring on
				// hover, matches the rest of the UI surfaces.
				ghost:
					"bg-transparent text-white/80 border border-white/10 hover:bg-white/5 hover:border-white/25 hover:text-white",
				// Accent-bordered chip. Used by deposit-form quick-amount buttons.
				accentOutline:
					"bg-transparent text-[#00ff87] border border-[#00ff87]/30 hover:bg-[#00ff87]/[0.06] hover:border-[#00ff87]/60",
				// Destructive. Same shape as primary, red palette.
				danger: "bg-[#f87171] text-black hover:bg-[#f87171]/90 shadow-xs",

				// Backwards-compatible aliases. Prefer the canonical names above.
				destructive:
					"bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
				outline:
					"border border-white/10 bg-transparent text-white/80 hover:bg-white/5 hover:border-white/25 hover:text-white",
				secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
				glass:
					"bg-white/40 backdrop-blur-sm border border-white/60 text-gray-900 hover:bg-white/60 hover:border-white/80 shadow-sm",
				link: "text-[#00ff87] underline-offset-4 hover:underline",
			},
			size: {
				default: "h-11 px-4 py-2 has-[>svg]:px-3 text-sm font-medium leading-tight antialiased",
				sm: "h-8 gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
				lg: "h-10 px-6 has-[>svg]:px-4",
				icon: "size-11",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);
