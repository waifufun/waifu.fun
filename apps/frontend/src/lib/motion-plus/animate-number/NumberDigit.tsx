// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3

import {
	type AnimationPlaybackControls,
	type HTMLMotionProps,
	MotionConfigContext,
	animate,
	motion,
	useIsPresent,
} from "framer-motion";
import {
	type CSSProperties,
	type Ref,
	forwardRef,
	useContext,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
} from "react";
import { maskHeight } from "./Mask";
import { useIsInitialRender } from "./hooks/use-is-initial-render";
import { getWidthInEm } from "./utils/get-width-in-ems";
import { targetWidths } from "./utils/target-widths";

type AnimationOptions = NonNullable<Parameters<typeof animate>[2]>;

function mod(n: number, m: number) {
	return ((n % m) + m) % m;
}

export const NumberDigit = forwardRef<
	HTMLSpanElement,
	Omit<HTMLMotionProps<"span">, "children"> & {
		value: number;
		initialValue?: number;
		trend?: number;
	}
>(function NumberDigit({ value: _value, initialValue: _initialValue = _value, trend = 0, ...rest }, _ref) {
	const { transition } = useContext(MotionConfigContext);
	const initialValue = useRef(_initialValue).current;
	const isInitialRender = useIsInitialRender();

	const scope = useRef<HTMLSpanElement>(null);
	const ref = useRef<HTMLSpanElement>(null);
	useImperativeHandle(_ref as Ref<HTMLSpanElement>, () => ref.current as HTMLSpanElement, []);

	const numberRefs = useRef<Array<HTMLSpanElement | null>>(new Array(10).fill(null));

	// Don't use a normal exit animation here, the resize would race the spring.
	const isPresent = useIsPresent();
	const value = isPresent ? _value : 0;

	// Pin initial width so the next render animates from a known good size.
	useLayoutEffect(() => {
		const initialDigitEl = numberRefs.current[initialValue];
		if (!scope.current || !initialDigitEl) return;
		scope.current.style.width = getWidthInEm(initialDigitEl);
	}, []);

	const prevValue = useRef(_initialValue);
	useLayoutEffect(() => {
		if (!scope.current || value === prevValue.current) return;
		const box = scope.current.getBoundingClientRect();
		const refBox = ref.current?.getBoundingClientRect();

		const oldVal = prevValue.current;
		let delta = value - oldVal;
		if (trend > 0 && value < oldVal) {
			delta = 10 - oldVal + value;
		} else if (trend < 0 && value > oldVal) {
			delta = value - 10 - oldVal;
		}

		const initialY = box.height * delta + (box.top - (refBox ? refBox.top || 0 : box.top));

		animate(scope.current, { y: [initialY, 0] }, transition as AnimationOptions);

		return () => {
			prevValue.current = value;
		};
	}, [value]);

	useEffect(() => {
		if (isInitialRender && initialValue === value) return;
		const targetEl = numberRefs.current[value];
		if (!targetEl) return;
		const w = getWidthInEm(targetEl);
		if (ref.current) targetWidths.set(ref.current, w);
		if (ref.current) {
			animate(ref.current, { width: w }, transition as AnimationOptions) as AnimationPlaybackControls;
		}
	}, [value]);

	const renderNumber = (i: number) => (
		<span
			key={i}
			style={{
				display: "inline-block",
				padding: `calc(${maskHeight}/2) 0`,
			}}
			ref={(r) => {
				numberRefs.current[i] = r;
			}}
		>
			{i}
		</span>
	);

	// 9 above + 9 below so the FLIP can scroll in either direction
	// through the full digit cycle without revealing the seam.
	const aboveDigits: number[] = [];
	const belowDigits: number[] = [];
	for (let offset = 9; offset >= 1; offset--) {
		aboveDigits.push(mod(value - offset, 10));
	}
	for (let offset = 1; offset <= 9; offset++) {
		belowDigits.push(mod(value + offset, 10));
	}

	return (
		<motion.span
			{...rest}
			ref={ref}
			data-state={isPresent ? undefined : "exiting"}
			style={{
				display: "inline-flex",
				justifyContent: "center",
			}}
		>
			<span
				ref={scope}
				style={{
					display: "inline-flex",
					justifyContent: "center",
					flexDirection: "column",
					alignItems: "center",
					position: "relative",
				}}
			>
				{aboveDigits.length > 0 && (
					<span style={{ ...digitFillStyle, bottom: "100%", left: 0 }}>
						{aboveDigits.map((d, idx) => (
							// digits intentionally non-unique by index; the column is read top-to-bottom
							// biome-ignore lint/suspicious/noArrayIndexKey: positional digit column
							<span key={`above-${idx}`}>{renderNumber(d)}</span>
						))}
					</span>
				)}
				{renderNumber(value)}
				{belowDigits.length > 0 && (
					<span style={{ ...digitFillStyle, top: "100%", left: 0 }}>
						{belowDigits.map((d, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: positional digit column
							<span key={`below-${idx}`}>{renderNumber(d)}</span>
						))}
					</span>
				)}
			</span>
		</motion.span>
	);
});

const digitFillStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	position: "absolute",
	width: "100%",
};
