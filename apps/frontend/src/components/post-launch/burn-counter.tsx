"use client";

import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";

import { useTranslation } from "@/contexts/locale-context";
import { useBurnStats } from "@/hooks/use-post-launch";

import { burnedPercent, formatTokenAmount } from "./__lib/format";

type Props = {
	tokenAddress: Address | undefined;
	ticker: string;
};

const TOKEN_DECIMALS = 18;
const ANIMATION_MS = 900;

/**
 * Animated digit display for "X tokens burned (Y% of supply)".
 *
 * Reads `totalSupply()` and `balanceOf(0xdead)` + `balanceOf(0x0)` from
 * the ERC-20 directly. The counter eases to the new value over ~1s when
 * the read updates so the page feels alive when buybacks fire.
 */
export function BurnCounter({ tokenAddress, ticker }: Props) {
	const { t } = useTranslation();
	const stats = useBurnStats(tokenAddress);

	const target = stats.data?.burned ?? 0n;
	const supply = stats.data?.totalSupply ?? 0n;
	const display = useEasingBigint(target);

	if (!tokenAddress) {
		return <Wrapper>{t("post.burn.notDeployed")}</Wrapper>;
	}

	if (stats.isLoading || !stats.data) {
		return (
			<Wrapper>
				<div
					className="h-10 w-48 animate-pulse rounded-sm bg-white/[0.04]"
					role="status"
					aria-label={t("post.burn.loadingAria", { ticker })}
				/>
			</Wrapper>
		);
	}

	const formatted = formatTokenAmount(display, TOKEN_DECIMALS);
	const targetFormatted = formatTokenAmount(target, TOKEN_DECIMALS);
	const burnedPct = burnedPercent(target, supply);

	return (
		<Wrapper>
			<output
				className="flex items-baseline gap-3 flex-wrap"
				aria-label={t("post.burn.totalAria", { amount: targetFormatted, ticker })}
			>
				<span
					className="text-2xl md:text-3xl tracking-tight tabular-nums text-[#ff5d4a]"
					aria-live="polite"
					aria-atomic="true"
				>
					{formatted}
				</span>
				<span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/55">
					{t("post.burn.tokenBurnedSuffix", { ticker })}
				</span>
			</output>
			<div
				className="mt-2 text-[11px] font-mono text-white/45"
				aria-label={t("post.burn.percentAria", { pct: burnedPct.toFixed(2) })}
			>
				<span className="tabular-nums text-white/75">{burnedPct.toFixed(2)}%</span> {t("post.burn.ofSupply")}
			</div>
		</Wrapper>
	);
}

function Wrapper({ children }: { children: React.ReactNode }) {
	const { t } = useTranslation();
	return (
		<section className="border border-white/10 bg-[#08080a] rounded-sm p-5" aria-label={t("post.burn.sectionAria")}>
			{children}
		</section>
	);
}

/**
 * Eases a bigint counter toward `target` over `ANIMATION_MS`. Uses
 * requestAnimationFrame for smooth updates; bigint math (avoid Number
 * precision loss for 18-dec token amounts).
 */
function useEasingBigint(target: bigint): bigint {
	const [value, setValue] = useState<bigint>(target);
	const fromRef = useRef<bigint>(target);
	const valueRef = useRef<bigint>(target);
	valueRef.current = value;
	const startRef = useRef<number>(0);
	const targetRef = useRef<bigint>(target);

	useEffect(() => {
		if (target === targetRef.current) return;
		fromRef.current = valueRef.current;
		targetRef.current = target;
		startRef.current = performance.now();

		let raf = 0;
		const step = (t: number) => {
			const elapsed = t - startRef.current;
			const pct = Math.min(1, elapsed / ANIMATION_MS);
			// ease-out cubic
			const eased = 1 - (1 - pct) ** 3;
			const numer = BigInt(Math.floor(eased * 1_000_000));
			const next = fromRef.current + ((targetRef.current - fromRef.current) * numer) / 1_000_000n;
			setValue(next);
			if (pct < 1) {
				raf = requestAnimationFrame(step);
			} else {
				setValue(targetRef.current);
			}
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [target]);

	return value;
}
