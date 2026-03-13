"use client";
import { type ChartTimeframe, getChartData } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { IToken } from "@waifufun/types";
import {
	CandlestickSeries,
	ColorType,
	type DeepPartial,
	type ChartOptions as LightweightChartOptions,
	createChart,
} from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";

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
	resolvedTimeframe: ChartTimeframe | null;
};

const migratedStatuses = new Set(["dex", "migrated", "locked", "finalized"]);

const toUnixSeconds = (timestamp: number) => Math.floor(timestamp > 1_000_000_000_000 ? timestamp / 1000 : timestamp);

const getChartTimeframeCandidates = (timeframe: ChartTimeframe): ChartTimeframe[] => {
	switch (timeframe) {
		case "1m":
			return ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "all"];
		case "5m":
			return ["5m", "15m", "1h", "4h", "1d", "1w", "all"];
		case "15m":
			return ["15m", "1h", "4h", "1d", "1w", "all"];
		case "1h":
			return ["1h", "4h", "1d", "1w", "all"];
		case "4h":
			return ["4h", "1d", "1w", "all"];
		case "1d":
			return ["1d", "1w", "all"];
		case "1w":
			return ["1w", "all"];
		default:
			return ["all"];
	}
};

const normalizeCandles = (data: Awaited<ReturnType<typeof getChartData>>) =>
	data
		.filter(
			(candle) =>
				Number.isFinite(Number(candle.volume)) &&
				Number.isFinite(Number(candle.close)) &&
				Number.isFinite(Number(candle.high)) &&
				Number.isFinite(Number(candle.low)) &&
				Number.isFinite(Number(candle.open)) &&
				Number.isFinite(Number(candle.timestamp)),
		)
		.map((candle) => ({
			time: toUnixSeconds(Number(candle.timestamp)),
			open: Number(candle.open),
			high: Number(candle.high),
			low: Number(candle.low),
			close: Number(candle.close),
			volume: Number(candle.volume),
		}))
		.sort((a, b) => a.time - b.time);

export default function LocalChart({ token, timeframe = "1d" }: { token: IToken; timeframe?: ChartTimeframe }) {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts instance typing here is noisy and stable enough.
	const candlestickSeriesRef = useRef<any>(null);
	// biome-ignore lint/suspicious/noExplicitAny: lightweight-charts instance typing here is noisy and stable enough.
	const chartRef = useRef<any>(null);
	const isExternalMarketToken = useMemo(() => {
		const normalizedStatus = String(token?.status ?? "")
			.trim()
			.toLowerCase();
		return Boolean(token?.imported || token?.curveCompleted || migratedStatuses.has(normalizedStatus));
	}, [token?.curveCompleted, token?.imported, token?.status]);

	const query = useQuery<LocalChartData>({
		queryKey: ["chart", token.chain, token.chainId, token.contractAddress, timeframe],
		queryFn: async () => {
			for (const candidateTimeframe of getChartTimeframeCandidates(timeframe)) {
				const data = await getChartData({
					// biome-ignore lint/suspicious/noExplicitAny: frontend token chain typing is broader than the endpoint today.
					chain: token.chain as any,
					// biome-ignore lint/suspicious/noExplicitAny: frontend token lookup typing is broader than the endpoint today.
					chainId: token.chainId as any,
					// biome-ignore lint/suspicious/noExplicitAny: frontend token lookup typing is broader than the endpoint today.
					contractAddress: token.contractAddress as any,
					timeframe: candidateTimeframe,
					...(token.createdAt ? { createdAt: token.createdAt } : {}),
				});
				const candles = normalizeCandles(data);

				if (candles.length > 0) {
					return {
						candles,
						hasRemoteData: true,
						resolvedTimeframe: candidateTimeframe,
					};
				}
			}

			return {
				candles: [],
				hasRemoteData: false,
				resolvedTimeframe: null,
			};
		},
		staleTime: 60 * 1000,
		refetchInterval: 3_500,
		refetchOnWindowFocus: true,
		refetchIntervalInBackground: false,
		refetchOnReconnect: false,
	});

	const chartData = query.data?.candles ?? [];
	const hasRemoteData = query.data?.hasRemoteData ?? false;
	const resolvedTimeframe = query.data?.resolvedTimeframe ?? null;
	const showEmptyState = !query.isPending && !hasRemoteData;
	const showingFallbackWindow = Boolean(hasRemoteData && resolvedTimeframe && resolvedTimeframe !== timeframe);

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
			{showingFallbackWindow && resolvedTimeframe ? (
				<div className="pointer-events-none absolute inset-x-4 top-4 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114]/90 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717a]">
					Showing {resolvedTimeframe} candles because {timeframe} is empty right now
				</div>
			) : null}
			{showEmptyState && (
				<div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114]/90 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717a]">
					{isExternalMarketToken
						? "No indexed candles are available for this token yet"
						: "Chart unavailable during bonding curve phase"}
				</div>
			)}
		</div>
	);
}
