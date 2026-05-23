// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3

import { AnimatePresence, type HTMLMotionProps, motion, useIsPresent } from "framer-motion";
import { type Ref, forwardRef, useContext } from "react";
import { maskHeight } from "./Mask";
import { SectionContext } from "./SectionContext";

export interface NumberSymbolProps extends HTMLMotionProps<"span"> {
	partKey: string;
	type: string;
	children: string;
}

export const NumberSymbol = forwardRef(function NumberSymbol(
	{ partKey: _partKey, type: _type, children, ...rest }: NumberSymbolProps,
	ref: Ref<HTMLSpanElement>,
) {
	const isPresent = useIsPresent();
	const { justify } = useContext(SectionContext);

	return (
		<motion.span
			{...rest}
			data-state={isPresent ? undefined : "exiting"}
			style={{
				display: "inline-flex",
				justifyContent: justify,
				padding: `calc(${maskHeight}/2) 0`,
				position: "relative",
			}}
			ref={ref}
		>
			<AnimatePresence mode="popLayout" anchorX={justify} initial={false}>
				<motion.span
					key={children}
					initial={{ opacity: 0 }}
					animate={{ opacity: [null, 1] }}
					exit={{ opacity: [null, 0] }}
					style={{
						display: "inline-block",
						whiteSpace: "pre",
					}}
				>
					{children}
				</motion.span>
			</AnimatePresence>
		</motion.span>
	);
});
