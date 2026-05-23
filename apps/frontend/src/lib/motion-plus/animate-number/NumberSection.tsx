// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3

"use client";

import { AnimatePresence, type AnimatePresenceProps, MotionConfigContext, animate } from "framer-motion";
import {
	type CSSProperties,
	type HTMLAttributes,
	type Ref,
	forwardRef,
	useContext,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import { NumberDigit } from "./NumberDigit";
import { NumberSymbol } from "./NumberSymbol";
import { SectionContext } from "./SectionContext";
import { useIsInitialRender } from "./hooks/use-is-initial-render";
import type { Justify, KeyedNumberPart } from "./types";
import { getWidthInEm } from "./utils/get-width-in-ems";
import { targetWidths } from "./utils/target-widths";

type AnimationOptions = NonNullable<Parameters<typeof animate>[2]>;

export const NumberSection = forwardRef<
	HTMLSpanElement,
	Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
		parts: KeyedNumberPart[];
		justify?: Justify;
		mode?: AnimatePresenceProps["mode"];
		name?: string;
		trend?: number;
	}
>(function NumberSection({ parts, justify = "left", mode, style, name, trend, ...rest }, _ref) {
	const ref = useRef<HTMLSpanElement>(null);
	useImperativeHandle(_ref as Ref<HTMLSpanElement>, () => ref.current as HTMLSpanElement, []);

	const context = useMemo(() => ({ justify }), [justify]);

	const measuredRef = useRef<HTMLSpanElement>(null);
	const isInitialRender = useIsInitialRender();
	const { transition } = useContext(MotionConfigContext);

	// Lock the section to a known width before AnimatePresence reshuffles
	// children, so new digits enter at the right edge without a width pop.
	// biome-ignore lint/correctness/useExhaustiveDependencies: digits string is the cache key
	useEffect(() => {
		if (!measuredRef.current || !ref.current) return;
		if (isInitialRender) {
			ref.current.style.width = getWidthInEm(measuredRef.current);
			return;
		}

		// Find the new width by removing exiting elements, measuring, then re-adding.
		// Better than reading parts[] directly because of negative margins.
		const undos = Array.from(measuredRef.current.children).map((child) => {
			if (!(child instanceof HTMLElement)) return;

			if (child.dataset.state === "exiting") {
				const next = child.nextSibling;
				child.remove();
				return () => {
					if (measuredRef.current) {
						measuredRef.current.insertBefore(child, next);
					}
				};
			}

			const newWidth = targetWidths.get(child);
			if (!newWidth) return;
			const oldWidth = child.style.width;
			child.style.width = newWidth;
			return () => {
				child.style.width = oldWidth;
			};
		});
		const newWidth = getWidthInEm(measuredRef.current);
		for (let i = undos.length - 1; i >= 0; i--) {
			const undo = undos[i];
			if (undo) undo();
		}
		animate(ref.current, { width: newWidth }, transition as AnimationOptions);
	}, [parts.map((p) => p.value).join("")]);

	return (
		<SectionContext.Provider value={context}>
			<span
				{...rest}
				ref={ref}
				className={`number-section-${name}`}
				style={
					{
						...style,
						display: "inline-flex",
						justifyContent: justify,
					} as CSSProperties
				}
			>
				<span
					ref={measuredRef}
					style={{
						display: "inline-flex",
						justifyContent: "inherit",
						position: "relative",
					}}
				>
					{/* zero width space to prevent the height from collapsing when empty: */}
					&#8203;
					<AnimatePresence {...(mode ? { mode } : {})} anchorX={justify} initial={false}>
						{parts.map((part) =>
							part.type === "integer" || part.type === "fraction" ? (
								<NumberDigit
									key={part.key}
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									value={part.value}
									{...(isInitialRender ? {} : { initialValue: 0 })}
									{...(trend !== undefined ? { trend } : {})}
								/>
							) : (
								<NumberSymbol
									key={part.type === "literal" ? `${part.key}:${part.value}` : part.key}
									type={part.type}
									partKey={part.key}
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
								>
									{part.value}
								</NumberSymbol>
							),
						)}
					</AnimatePresence>
				</span>
			</span>
		</SectionContext.Provider>
	);
});
