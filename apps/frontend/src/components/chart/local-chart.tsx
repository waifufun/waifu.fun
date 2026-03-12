"use client";
import { useQuery } from "@tanstack/react-query";
import type { IToken } from "@waifufun/types";
import { useEffect, useRef } from "react";
import {
	CandlestickSeries,
	ColorType,
	createChart,
	type DeepPartial,
	type ChartOptions as LightweightChartOptions,
} from "lightweight-charts";
import { getChartData } from "@/lib/api";

type LocalChartData = {
	candles: Array<{
		time: number;
		open: number;
		high: number;
		low: number;
		close: number;
		volume: number;
	}>;
	hasRemoteData: boolean;
};

function buildFallbackCandles(price?: number): LocalChartData {
	const fallbackPrice = Number(price);

	if (!Number.isFinite(fallbackPrice) || fallbackPrice <= 0) {
		return {
			candles: [],
			hasRemoteData: false,
		};
	}

	return {
		candles: [
			{
				time: Math.floor(Date.now() / 1000),
				open: fallbackPrice,
				high: fallbackPrice,
				low: fallbackPrice,
				close: fallbackPrice,
				volume: 0,
			},
		],
		hasRemoteData: false,
	};
}

export default function LocalChart({ token }: { token: IToken }) {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts instance typing here is noisy and stable enough.
	const candlestickSeriesRef = useRef<any>(null);
	// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts instance typing here is noisy and stable enough.
	const chartRef = useRef<any>(null);

	const query = useQuery<LocalChartData>({
		queryKey: ["chart", token.contractAddress],
		queryFn: async () => {
			try {
				const data = await getChartData({
					// biome-ignore lint/suspicious/noExplicitAny: frontend token chain typing is broader than the endpoint today.
					chain: token.chain as any,
					chainId: token.chainId,
					contractAddress: token.contractAddress,
				});

				if (!data || data.length === 0) {
					return buildFallbackCandles(token?.price);
				}

				const candles = data
					.filter(
						(candle) =>
							!Number.isNaN(Number(candle.volume)) &&
							!Number.isNaN(Number(candle.close)) &&
							!Number.isNaN(Number(candle.high)) &&
							!Number.isNaN(Number(candle.low)) &&
							!Number.isNaN(Number(candle.open)) &&
							!Number.isNaN(Number(candle.timestamp)),
					)
					.map((candle) => ({
						time: Math.floor(candle.timestamp / 1000),
						open: Number(candle.open),
						high: Number(candle.high),
						low: Number(candle.low),
						close: Number(candle.close),
						volume: Number(candle.volume),
					}))
					.sort((a, b) => a.time - b.time);

				if (candles.length === 0) {
					return buildFallbackCandles(token?.price);
				}

				return {
					candles,
					hasRemoteData: true,
				};
			} catch (error) {
				console.warn("[waifu-core] Falling back to local chart placeholder", error);
				return buildFallbackCandles(token?.price);
			}
		},
		staleTime: 60 * 1000,
		refetchInterval: 3_500,
		refetchOnWindowFocus: true,
		refetchIntervalInBackground: false,
		refetchOnReconnect: false,
	});

	const chartData = query.data?.candles ?? [];
	const hasRemoteData = query.data?.hasRemoteData ?? false;
	const showEmptyState = !query.isPending && !hasRemoteData;

	useEffect(() => {
		const chartElement = chartContainerRef.current;
		if (!chartElement) return;

		const chartOptions: DeepPartial<LightweightChartOptions> = {
			layout: {
				textColor: "#8c8c8c",
				background: { type: ColorType.Solid, color: "#08080a" },
			},
			grid: {
				vertLines: { color: "#1f1f23", visible: true },
				horzLines: { color: "#1f1f23", visible: true },
			},
			rightPriceScale: {
				autoScale: true,
				borderColor: "#1f1f23",
			},
			timeScale: {
				borderColor: "#1f1f23",
				timeVisible: true,
				secondsVisible: false,
			},
			crosshair: {
				horzLine: {
					color: "#262626",
					labelBackgroundColor: "#111114",
				},
				vertLine: {
					color: "#262626",
					labelBackgroundColor: "#111114",
				},
			},
			localization: {
				priceFormatter: (price: number) => {
					const normal = Number(price).toFixed(12);
					const decimalsLength = normal.split(".")[1]?.replace(/0+$/, "")?.length || 1;

					return new Intl.NumberFormat("en-US", {
						notation: "standard",
						style: "currency",
						currency: "USD",
						maximumFractionDigits: Number(decimalsLength || "1") > 8 ? 8 : Number(decimalsLength || "1"),
					}).format(price);
				},
			},
		};

		const chart = createChart(chartElement, {
			...chartOptions,
			width: chartElement.clientWidth,
			height: chartElement.clientHeight || 500,
		});
		chartRef.current = chart;

		const candlestickSeries = chart.addSeries(CandlestickSeries, {
			wickUpColor: "#00ff87",
			upColor: "#00ff87",
			wickDownColor: "#ef4444",
			downColor: "#ef4444",
			borderVisible: true,
			priceFormat: {
				minMove: 0.000000001,
				precision: 9,
			},
			borderUpColor: "#00ff87",
			borderDownColor: "#ef4444",
			wickVisible: true,
		});
		candlestickSeriesRef.current = candlestickSeries;

		const handleResize = () => {
			const width = chartContainerRef?.current?.clientWidth;
			const height = chartContainerRef?.current?.clientHeight;
			if (width && height && chartRef.current) {
				chartRef.current.applyOptions({ width, height });
			}
		};

		window.addEventListener("resize", handleResize);

		return () => {
			window.removeEventListener("resize", handleResize);
			if (chartRef.current) {
				chartRef.current.remove();
				chartRef.current = null;
			}
			candlestickSeriesRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!candlestickSeriesRef.current) return;
		candlestickSeriesRef.current.setData(chartData);

		if (chartRef.current && chartData.length > 0) {
			chartRef.current.timeScale().fitContent();
		}
	}, [chartData]);

	return (
		<div className="relative min-h-[500px] w-full overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a]">
			<div ref={chartContainerRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />
			{query.isPending && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#08080a]/70 px-4 text-center font-mono text-xs uppercase tracking-[0.2em] text-[#71717a]">
					Loading chart data
				</div>
			)}
			{showEmptyState && (
				<div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114]/90 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717a]">
					Chart unavailable during bonding curve phase
				</div>
			)}
		</div>
	);
}
