import { useQuery } from "@tanstack/react-query";
import type { IToken, TChain } from "@autofun/types";
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type DeepPartial,
  type ChartOptions as LightweightChartOptions,
} from "lightweight-charts";
import { getChartData } from "@/lib/api";


export default function LocalChart({token}: {token: IToken}) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const candlestickSeriesRef = useRef<any>(null);
    const chartRef = useRef<any>(null);


    const query = useQuery({
        queryKey: ["token", token.contractAddress, "chart"],
        queryFn: async () => {
          const to = Math.floor(new Date().getTime() / 1000.0);
          const from = 0;
    
          const data = await getChartData({
            // for now any
            chain: token.chain as any,
            chainId: token.chainId,
            contractAddress: token.contractAddress,
          });
    
          if (!data?.data?.length) {
            const lastKnownPrice = Number(token?.price) || 0;
            if (isNaN(lastKnownPrice)) return [];
    
            return [
              {
                time: Math.floor(Date.now() / 1000) * 1000,
                open: lastKnownPrice,
                high: lastKnownPrice,
                low: lastKnownPrice,
                close: lastKnownPrice,
                volume: 0,
              },
            ];
          }
    
          return data.data.filter(
            (candle) =>
              !isNaN(Number(candle.volume)) &&
              !isNaN(Number(candle.open)) &&
              !isNaN(Number(candle.high)) &&
              !isNaN(Number(candle.low)) &&
              !isNaN(Number(candle.close)) &&
              !isNaN(Number(candle.time)) &&
              candle.volume > 0,
          );
        },
        staleTime: 60 * 1000,
        refetchInterval: 10_000,
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
            // priceFormatter: (price: number) => formatNumber(price, true, false),
            priceFormatter: (price: number) => {
                // Force the price into standard decimal notation (no scientific notation), keeping up to 12 digits after the decimal
                // Example: 3.5898363524445996e-8 → "0.000000035898"
                const normal = Number(price).toFixed(12);
                const decimalsLength =
                normal.split(".")[1]?.replace(/0+$/, "")?.length || 1;
    
                return new Intl.NumberFormat("en-US", {
                notation: "standard",
                style: "currency",
                currency: "USD",
                maximumFractionDigits:
                    Number(decimalsLength || "1") > 8
                    ? 8
                    : Number(decimalsLength || "1"),
                }).format(price);
            },
            },
        };
    
        const chartElement = chartContainerRef.current;
    
        if (!chartElement) return;
    
        const chart = createChart(chartElement, chartOptions);
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
    
        const handleResize = () => {
            const width = chartContainerRef?.current?.clientWidth;
            if (width) {
                chart.applyOptions({ width });
            }
        };
    
        window.addEventListener("resize", handleResize);
    }, []);

    return (
        <div>
            <p>local chart</p>
        </div>
    )
}