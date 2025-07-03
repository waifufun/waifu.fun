"use client";
import { useQuery } from "@tanstack/react-query";
import type { IToken } from "@autofun/types";
import { useEffect, useRef } from "react";
import {
	CandlestickSeries,
	ColorType,
	createChart,
	type DeepPartial,
	type ChartOptions as LightweightChartOptions,
} from "lightweight-charts";
import { getChartData } from "@/lib/api";

export default function LocalChart({ token }: { token: IToken }) {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const candlestickSeriesRef = useRef<any>(null);
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const chartRef = useRef<any>(null);

	const query = useQuery({
		queryKey: ["chart", token.contractAddress],
		queryFn: async () => {
			const data = await getChartData({
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				chain: token.chain as any,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			});

			if (!data || data.length === 0) {
				const lastKnownPrice = Number(token?.price) || 0;
				if (Number.isNaN(lastKnownPrice)) return [];

				return [
					{
						time: Math.floor(Date.now() / 1000),
						open: lastKnownPrice,
						high: lastKnownPrice,
						low: lastKnownPrice,
						close: lastKnownPrice,
						volume: 0,
					},
				];
			}

			return data
				.filter(
					(candle) =>
						!Number.isNaN(Number(candle.volume)) &&
						!Number.isNaN(Number(candle.close)) &&
						!Number.isNaN(Number(candle.high)) &&
						!Number.isNaN(Number(candle.low)) &&
						!Number.isNaN(Number(candle.open)) &&
						!Number.isNaN(Number(candle.timestamp)) &&
						candle.volume > 0,
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
		},
		staleTime: 60 * 1000,
		refetchInterval: 3_500,
		refetchOnWindowFocus: true,
		refetchIntervalInBackground: false,
		refetchOnReconnect: false,
	});

	const chartData = query?.data;

	useEffect(() => {
		const chartOptions: DeepPartial<LightweightChartOptions> = {
			layout: {
				textColor: "#8c8c8c",
				background: { type: ColorType.Solid, color: "transparent" },
			},
			grid: {
				vertLines: { color: "#262626", visible: true },
				horzLines: { color: "#262626", visible: true },
			},
			rightPriceScale: {
				autoScale: true,
				borderColor: "#262626",
			},
			timeScale: {
				borderColor: "#262626",
				timeVisible: true,
				secondsVisible: false,
			},
			crosshair: {
				horzLine: {
					color: "#262626",
					labelBackgroundColor: "#262626",
				},
				vertLine: {
					color: "#262626",
					labelBackgroundColor: "#262626",
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

		const chartElement = chartContainerRef.current;
		if (!chartElement) return;

		if (chartRef.current) {
			chartRef.current.remove();
			chartRef.current = null;
		}

		const chart = createChart(chartElement, {
			...chartOptions,
			width: chartElement.clientWidth,
			height: chartElement.clientHeight || 500,
		});
		chartRef.current = chart;

		const candlestickSeries = chart.addSeries(CandlestickSeries, {
			wickUpColor: "#03FF24",
			upColor: "#03FF24",
			wickDownColor: "rgb(225, 50, 85)",
			downColor: "rgb(225, 50, 85)",
			baseLineColor: "#212121",
			borderVisible: false,
			priceFormat: {
				minMove: 0.00000001,
			},
		});

		candlestickSeriesRef.current = candlestickSeries;

		if (chartData && chartData.length > 0) {
			// @ts-ignore
			candlestickSeries.setData(chartData);
		}

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
	}, [chartData]);

	return (
		<div ref={chartContainerRef} className="w-full min-h-[500px] relative" style={{ width: "100%", height: "500px" }} />
	);
}
