"use client";

import NumberFlow from "@number-flow/react";
import {
	ArrowDownIcon,
	ArrowRightIcon,
	ArrowUpIcon,
	ArrowUpRightIcon,
	BotIcon,
	BoxIcon,
	CandlestickChartIcon,
	GitPullRequestIcon,
	Repeat2Icon,
	SparklesIcon,
	WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	CartesianGrid,
	ComposedChart,
	Line,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import type { ActivityItem } from "./lib/activity";
import type { Candle, CandleRange, CandleSeries } from "./lib/candles";
import { type ShipSummary, daysOperating, relativeTime } from "./lib/github";
import type { HoldingsSnapshot } from "./lib/holdings";
import { type RevenueRange, STREAMS, loadRevenue } from "./lib/revenue";
import type { TokenMetrics } from "./lib/token";

type Props = {
	token: TokenMetrics;
	tokenAddress: string;
	initialCandles: CandleSeries;
	holdings: HoldingsSnapshot;
	ship: ShipSummary;
	activity: ActivityItem[];
};
type Trade = {
	id: string;
	type: "trade";
	side: "buy" | "sell";
	timestamp: string;
	bnb: number;
	tokens: number;
	wallet: string;
	tx: string;
};
type FeedItem = ActivityItem | Trade;
const RANGES: CandleRange[] = ["1m", "5m", "1h", "4h", "1d", "7d"];
const FIRST_PR_ISO = "2026-03-05T00:00:00Z";

function Panel({
	children,
	className = "",
	noPad = false,
}: { children: React.ReactNode; className?: string; noPad?: boolean }) {
	return (
		<section
			className={`relative overflow-hidden rounded-sm border border-white/[0.07] bg-[#08090b] shadow-[0_0_0_1px_rgba(0,0,0,0.35)] ${noPad ? "" : "p-4"} ${className}`}
		>
			{children}
		</section>
	);
}
function Pulse({ tone = "green" }: { tone?: "green" | "red" | "amber" }) {
	const color =
		tone === "red"
			? "bg-red-400 shadow-[0_0_8px_#f87171]"
			: tone === "amber"
				? "bg-amber-400 shadow-[0_0_8px_#f59e0b]"
				: "bg-emerald-400 shadow-[0_0_8px_#34d399]";
	return (
		<span className="relative inline-flex h-2 w-2">
			<span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-45`} />
			<span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
		</span>
	);
}
function Label({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
	return (
		<header className="mb-3 flex items-center justify-between gap-3">
			<div className="font-mono text-[10px] text-white/45 uppercase tracking-[0.2em]">{children}</div>
			{right}
		</header>
	);
}
function usd(value: number, compact = true) {
	if (!Number.isFinite(value) || value <= 0) return "$0";
	if (value < 0.01) return `$${value.toExponential(2)}`;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		notation: compact ? "compact" : "standard",
		maximumFractionDigits: value < 1 ? 6 : 2,
	}).format(value);
}
function num(value: number) {
	return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value || 0);
}
function addr(address: string) {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
function AnimatedUsd({ value, compact = true }: { value: number; compact?: boolean }) {
	if (!Number.isFinite(value) || value <= 0) return <span>$0</span>;
	return (
		<NumberFlow
			format={{
				currency: "USD",
				maximumFractionDigits: value < 1 ? 6 : 2,
				notation: compact ? "compact" : "standard",
				style: "currency",
			}}
			locales="en-US"
			value={value}
		/>
	);
}

function Hero({ ship, token, tokenAddress }: { ship: ShipSummary; token: TokenMetrics; tokenAddress: string }) {
	const last = ship.items[0];
	return (
		<header className="mb-3 grid gap-3 rounded-sm border border-white/[0.07] bg-[#08090b] px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
			<div className="flex min-w-0 items-center gap-3">
				<div className="h-10 w-10 overflow-hidden rounded-sm ring-1 ring-amber-400/30">
					<img alt="sol" className="h-full w-full object-cover" src="/brand/agents/waifu/portrait-amber.webp" />
				</div>
				<div>
					<div className="flex flex-wrap items-baseline gap-2">
						<span className="font-mono text-[15px] text-white">sol</span>
						<span className="font-mono text-[12px] text-amber-300 tracking-[0.14em]">${token.symbol}</span>
						<span className="rounded-[2px] border border-emerald-400/20 bg-emerald-400/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-emerald-300 uppercase tracking-[0.18em]">
							online
						</span>
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-white/45 uppercase tracking-[0.16em]">
						<Pulse />
						<span>day {daysOperating(FIRST_PR_ISO)}</span>
						<span className="text-white/20">/</span>
						<span>{addr(tokenAddress)}</span>
						<span className="text-white/20">/</span>
						<span>last ship {last ? relativeTime(last.mergedAt) : "n/a"}</span>
					</div>
				</div>
			</div>
			<div className="flex gap-2">
				<a
					className="rounded-sm border border-white/[0.08] px-3 py-2 font-mono text-[10px] text-white/55 uppercase tracking-[0.18em] hover:text-white"
					href={`https://bscscan.com/address/${tokenAddress}`}
					rel="noreferrer"
					target="_blank"
				>
					bscscan
				</a>
				<a
					className="inline-flex items-center gap-1.5 rounded-sm bg-amber-400 px-4 py-2 font-mono text-[11px] text-black uppercase tracking-[0.18em]"
					href={`https://four.meme/token/${tokenAddress}`}
					rel="noreferrer"
					target="_blank"
				>
					buy <ArrowUpRightIcon className="h-3 w-3" />
				</a>
			</div>
		</header>
	);
}

function chartSlice(candles: Candle[], range: CandleRange) {
	return candles.slice(-{ "1m": 50, "5m": 55, "1h": 70, "4h": 80, "1d": 72, "7d": 84 }[range]);
}
function time(v: number) {
	const d = new Date(v);
	return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function TokenChart({ token, series }: { token: TokenMetrics; series: CandleSeries }) {
	const [range, setRange] = useState<CandleRange>("1h");
	const data = useMemo(() => chartSlice(series.candles, range), [series.candles, range]);
	const price = token.priceUsd || data.at(-1)?.c || 0;
	const up = token.change24h >= 0;
	return (
		<Panel className="min-h-[520px]" noPad>
			<div className="border-white/[0.06] border-b p-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="flex items-center gap-2 font-mono text-[10px] text-white/45 uppercase tracking-[0.2em]">
							<CandlestickChartIcon className="h-3 w-3" /> {token.symbol} price chart
						</div>
						<div className="mt-2 flex flex-wrap items-end gap-3">
							<div className="font-mono text-4xl font-light text-white tabular-nums md:text-5xl">
								<AnimatedUsd compact={false} value={price} />
							</div>
							<div
								className={`mb-1 flex items-center gap-2 font-mono text-[12px] ${up ? "text-emerald-300" : "text-red-300"}`}
							>
								<Pulse tone={up ? "green" : "red"} />
								{up ? "+" : ""}
								{token.change24h.toFixed(2)}% 24h
							</div>
						</div>
					</div>
					<div className="flex rounded-sm border border-white/[0.07] bg-black/20 p-1">
						{RANGES.map((r) => (
							<button
								className={`rounded-[2px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] ${range === r ? "bg-amber-400 text-black" : "text-white/45 hover:text-white"}`}
								key={r}
								onClick={() => setRange(r)}
								type="button"
							>
								{r}
							</button>
						))}
					</div>
				</div>
			</div>
			<div className="h-[380px] p-3 md:p-4">
				<ResponsiveContainer height="100%" width="100%">
					<ComposedChart data={data} margin={{ bottom: 0, left: 0, right: 10, top: 8 }}>
						<CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="t"
							domain={["dataMin", "dataMax"]}
							minTickGap={32}
							tick={{ fill: "rgba(255,255,255,0.35)", fontFamily: "var(--font-geist-mono, monospace)", fontSize: 10 }}
							tickFormatter={time}
							tickLine={false}
							type="number"
						/>
						<YAxis
							axisLine={false}
							dataKey="c"
							domain={["dataMin", "dataMax"]}
							orientation="right"
							tick={{ fill: "rgba(255,255,255,0.35)", fontFamily: "var(--font-geist-mono, monospace)", fontSize: 10 }}
							tickFormatter={(v) => usd(Number(v), false)}
							tickLine={false}
							width={82}
							yAxisId="price"
						/>
						<YAxis hide yAxisId="volume" />
						<Tooltip
							contentStyle={{
								background: "#08090b",
								border: "1px solid rgba(255,255,255,0.1)",
								borderRadius: 2,
								color: "#fff",
								fontFamily: "var(--font-geist-mono, monospace)",
								fontSize: 11,
							}}
							formatter={(v, name) => [
								name === "v" ? usd(Number(v)) : usd(Number(v), false),
								name === "v" ? "volume" : "price",
							]}
							labelFormatter={(v) => new Date(Number(v)).toISOString().slice(0, 16).replace("T", " ")}
						/>
						<Bar dataKey="v" fill="rgba(245,158,11,0.18)" radius={[1, 1, 0, 0]} yAxisId="volume" />
						<Line dataKey="c" dot={false} stroke="#f59e0b" strokeWidth={1.8} type="monotone" yAxisId="price" />
					</ComposedChart>
				</ResponsiveContainer>
			</div>
			<div className="flex justify-between border-white/[0.06] border-t px-4 py-3 font-mono text-[10px] text-white/35 uppercase tracking-[0.16em]">
				<span>
					{series.source === "synthetic" ? "synthetic data, wires to real OHLC at launch" : "geckoterminal OHLC"}
				</span>
				<span>volume bars in usd</span>
			</div>
		</Panel>
	);
}

function Swap({ token, tokenAddress }: { token: TokenMetrics; tokenAddress: string }) {
	const [side, setSide] = useState<"buy" | "sell">("buy");
	const [amount, setAmount] = useState("0.10");
	const [slip, setSlip] = useState(1);
	const n = Number(amount) || 0;
	const est = token.priceBnb > 0 ? n / token.priceBnb : 0;
	return (
		<Panel className="lg:sticky lg:top-4 lg:self-start">
			<Label
				right={
					<span className="flex items-center gap-2 text-emerald-300">
						<Pulse /> route live
					</span>
				}
			>
				swap
			</Label>
			<div className="mb-4 grid grid-cols-2 rounded-sm border border-white/[0.07] bg-black/25 p-1">
				{(["buy", "sell"] as const).map((s) => (
					<button
						className={`rounded-[2px] py-2 font-mono text-[11px] uppercase tracking-[0.18em] ${side === s ? "bg-amber-400 text-black" : "text-white/45"}`}
						key={s}
						onClick={() => setSide(s)}
						type="button"
					>
						{s}
					</button>
				))}
			</div>
			<div className="rounded-sm border border-white/[0.07] bg-white/[0.025] p-3">
				<div className="mb-2 flex justify-between font-mono text-[10px] text-white/40 uppercase tracking-[0.16em]">
					<span>from</span>
					<span>{side === "buy" ? "BNB" : token.symbol}</span>
				</div>
				<input
					className="w-full bg-transparent font-mono text-3xl text-white outline-none"
					inputMode="decimal"
					onChange={(e) => setAmount(e.target.value)}
					value={amount}
				/>
			</div>
			<div className="flex justify-center py-3">
				<span className="rounded-full border border-white/[0.08] bg-[#08090b] p-2 text-white/35">
					<Repeat2Icon className="h-4 w-4" />
				</span>
			</div>
			<div className="rounded-sm border border-white/[0.07] bg-white/[0.025] p-3">
				<div className="mb-2 flex justify-between font-mono text-[10px] text-white/40 uppercase tracking-[0.16em]">
					<span>to</span>
					<span>{side === "buy" ? token.symbol : "BNB"}</span>
				</div>
				<div className="font-mono text-2xl text-white/85">
					~ {side === "buy" ? num(est) : (n * token.priceBnb).toFixed(4)}
				</div>
			</div>
			<div className="mt-4 grid grid-cols-4 gap-1">
				{[0.5, 1, 3, 5].map((s) => (
					<button
						className={`rounded-sm border px-2 py-1.5 font-mono text-[10px] ${slip === s ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-white/[0.07] text-white/45"}`}
						key={s}
						onClick={() => setSlip(s)}
						type="button"
					>
						{s}%
					</button>
				))}
			</div>
			<div className="mt-4 space-y-2 border-white/[0.06] border-t pt-4 font-mono text-[10px] text-white/45">
				<div className="flex justify-between">
					<span>price impact</span>
					<span className="text-emerald-300">&lt; 0.01%</span>
				</div>
				<div className="flex justify-between">
					<span>min received</span>
					<span>
						{num(est * (1 - slip / 100))} {token.symbol}
					</span>
				</div>
				<div className="flex justify-between">
					<span>contract</span>
					<span>{addr(tokenAddress)}</span>
				</div>
			</div>
			<a
				className="mt-5 flex w-full items-center justify-center gap-2 rounded-sm bg-amber-400 py-3 font-mono text-[12px] text-black uppercase tracking-[0.2em]"
				href={`https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}`}
				rel="noreferrer"
				target="_blank"
			>
				{side} <ArrowRightIcon className="h-4 w-4" />
			</a>
			<div className="mt-3 text-center font-mono text-[10px] text-white/30 uppercase tracking-[0.14em]">
				powered by pancakeswap, via four.meme at launch
			</div>
		</Panel>
	);
}

function Kpis({ token }: { token: TokenMetrics }) {
	const cells = [
		{
			label: "price",
			value: usd(token.priceUsd, false),
			delta: `${token.change24h >= 0 ? "+" : ""}${token.change24h.toFixed(2)}%`,
		},
		{ label: "mcap", value: usd(token.marketCap) },
		{ label: "liq", value: usd(token.liquidityUsd) },
		{ label: "holders", value: num(token.holders) },
		{ label: "vol 24h", value: usd(token.volume24h) },
		{ label: "txs 24h", value: num(token.txs24h) },
	];
	return (
		<div className="grid grid-cols-2 divide-white/[0.06] rounded-sm border border-white/[0.07] bg-[#08090b] sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
			{cells.map((c) => (
				<div className="p-3" key={c.label}>
					<div className="font-mono text-[9px] text-white/35 uppercase tracking-[0.2em]">{c.label}</div>
					<div className="mt-1 font-mono text-[16px] text-white tabular-nums">{c.value}</div>
					{c.delta && (
						<div
							className={
								token.change24h >= 0 ? "font-mono text-[10px] text-emerald-300" : "font-mono text-[10px] text-red-300"
							}
						>
							{c.delta}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
function About({ holdings, token }: { holdings: HoldingsSnapshot; token: TokenMetrics }) {
	return (
		<Panel>
			<Label
				right={
					<a className="text-amber-300/80 hover:text-amber-200" href="/agent-preview/trading">
						trading detail
					</a>
				}
			>
				about agent
			</Label>
			<div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
				<div>
					<h2 className="flex items-center gap-2 font-mono text-xl text-white">
						<BotIcon className="h-4 w-4 text-amber-300" /> sol runs ${token.symbol}
					</h2>
					<p className="mt-2 max-w-3xl text-sm text-white/58 leading-6">
						Autonomous builder, market operator, and agent treasury steward. The token terminal is contract driven, so
						any BSC token address can power this same surface.
					</p>
				</div>
				<div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-white/45 uppercase tracking-[0.14em] md:min-w-[360px]">
					<Mini label="nav" value={usd(holdings.navUsd)} />
					<Mini
						label="supply"
						value={token.totalSupply > 0n ? num(Number(token.totalSupply / 1_000_000_000_000_000_000n)) : "0"}
					/>
					<Mini label="status" value="online" />
				</div>
			</div>
		</Panel>
	);
}
function Mini({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-sm border border-white/[0.06] bg-white/[0.02] p-2">
			<div>{label}</div>
			<div className="mt-1 text-white/85">{value}</div>
		</div>
	);
}

function Revenue() {
	const [range, setRange] = useState<RevenueRange>("30d");
	const snap = useMemo(() => loadRevenue(range), [range]);
	const data = useMemo(() => snap.points.map((p) => ({ ...p, t: new Date(p.t).getTime() })), [snap]);
	return (
		<Panel>
			<Label
				right={
					<div className="flex gap-1">
						{(["24h", "7d", "30d", "all"] as RevenueRange[]).map((r) => (
							<button
								className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase ${range === r ? "bg-amber-400/15 text-amber-200" : "text-white/40"}`}
								key={r}
								onClick={() => setRange(r)}
								type="button"
							>
								{r}
							</button>
						))}
					</div>
				}
			>
				revenue streams
			</Label>
			<div className="mb-3 flex items-end gap-3">
				<div className="font-mono text-3xl text-white">
					<AnimatedUsd value={snap.grandTotalUsd} />
				</div>
				<div className="pb-1 font-mono text-[10px] text-white/35 uppercase tracking-[0.16em]">4 streams scheduled</div>
			</div>
			<div className="h-[220px]">
				<ResponsiveContainer height="100%" width="100%">
					<AreaChart data={data}>
						<CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="t"
							tick={{ fill: "rgba(255,255,255,0.32)", fontFamily: "var(--font-geist-mono, monospace)", fontSize: 10 }}
							tickFormatter={(v) => new Date(v).toISOString().slice(5, 10)}
							tickLine={false}
						/>
						<YAxis
							axisLine={false}
							tick={{ fill: "rgba(255,255,255,0.32)", fontFamily: "var(--font-geist-mono, monospace)", fontSize: 10 }}
							tickFormatter={(v) => `$${v}`}
							tickLine={false}
							width={36}
						/>
						{STREAMS.map((s) => (
							<Area
								dataKey={s.key}
								fill={s.color}
								fillOpacity={0.12}
								key={s.key}
								stackId="rev"
								stroke={s.color}
								strokeWidth={1.1}
								type="monotone"
							/>
						))}
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</Panel>
	);
}

function trades(token: TokenMetrics): Trade[] {
	const now = Date.now();
	const base = token.priceBnb || 0.000001;
	return [
		{
			id: "trade-1",
			type: "trade",
			side: "buy",
			timestamp: new Date(now - 23_000).toISOString(),
			bnb: 0.42,
			tokens: 0.42 / base,
			wallet: "0x71f2...c9a1",
			tx: "0xtrade1",
		},
		{
			id: "trade-2",
			type: "trade",
			side: "buy",
			timestamp: new Date(now - 8 * 60_000).toISOString(),
			bnb: 0.18,
			tokens: 0.18 / base,
			wallet: "0xa04c...8b12",
			tx: "0xtrade2",
		},
		{
			id: "trade-3",
			type: "trade",
			side: "sell",
			timestamp: new Date(now - 21 * 60_000).toISOString(),
			bnb: 0.09,
			tokens: 0.09 / base,
			wallet: "0xe91b...44fd",
			tx: "0xtrade3",
		},
	];
}
function Activity({ items, token }: { items: ActivityItem[]; token: TokenMetrics }) {
	const [visible, setVisible] = useState(9);
	const feed = useMemo<FeedItem[]>(
		() =>
			[...trades(token), ...items].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
		[items, token],
	);
	const last = feed.find((i) => i.type === "trade") as Trade | undefined;
	return (
		<Panel>
			<Label
				right={
					<span className="flex items-center gap-2 text-emerald-300">
						<Pulse /> last trade {last ? relativeTime(last.timestamp) : "n/a"}
					</span>
				}
			>
				activity
			</Label>
			<ul className="divide-y divide-white/[0.045]">
				{feed.slice(0, visible).map((item) => (
					<Row item={item} key={item.id} token={token} />
				))}
			</ul>
			{visible < feed.length && (
				<button
					className="mt-4 w-full rounded-sm border border-white/[0.07] py-2 font-mono text-[10px] text-white/45 uppercase tracking-[0.18em] hover:text-amber-300"
					onClick={() => setVisible((v) => v + 8)}
					type="button"
				>
					load more
				</button>
			)}
		</Panel>
	);
}
function Row({ item, token }: { item: FeedItem; token: TokenMetrics }) {
	const m = meta(item);
	return (
		<li className="grid grid-cols-[30px_1fr_auto] gap-3 py-3">
			<span className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-sm ${m.bg}`}>{m.icon}</span>
			<div className="min-w-0">
				<div className="flex items-center gap-2 font-mono text-[9px] text-white/35 uppercase tracking-[0.18em]">
					<span>{m.label}</span>
					<span>{relativeTime(item.timestamp)}</span>
				</div>
				<div className="mt-1 truncate text-[12px] text-white/82">{text(item, token)}</div>
			</div>
			{href(item) ? (
				<a className="text-white/25 hover:text-amber-300" href={href(item)} rel="noreferrer" target="_blank">
					<ArrowUpRightIcon className="h-3.5 w-3.5" />
				</a>
			) : (
				<span />
			)}
		</li>
	);
}
function meta(item: FeedItem) {
	if (item.type === "trade")
		return {
			bg: item.side === "buy" ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300",
			label: item.side,
			icon: item.side === "buy" ? <ArrowUpIcon className="h-3.5 w-3.5" /> : <ArrowDownIcon className="h-3.5 w-3.5" />,
		};
	if (item.type === "pr")
		return {
			bg: "bg-emerald-400/10 text-emerald-300",
			label: "ship",
			icon: <GitPullRequestIcon className="h-3.5 w-3.5" />,
		};
	if (item.type === "tweet")
		return { bg: "bg-sky-400/10 text-sky-300", label: "voice", icon: <SparklesIcon className="h-3.5 w-3.5" /> };
	if (item.type === "tx")
		return { bg: "bg-amber-400/10 text-amber-300", label: "onchain", icon: <BoxIcon className="h-3.5 w-3.5" /> };
	return { bg: "bg-amber-400/10 text-amber-300", label: "revenue", icon: <WalletIcon className="h-3.5 w-3.5" /> };
}
function text(item: FeedItem, token: TokenMetrics) {
	if (item.type === "trade")
		return `${item.side} ${num(item.tokens)} ${token.symbol} for ${item.bnb.toFixed(3)} BNB by ${item.wallet}`;
	if (item.type === "pr") return `PR #${item.number} ${item.title}`;
	if (item.type === "tweet") return item.text;
	if (item.type === "tx") return `${item.method} ${item.valueBnb.toFixed(4)} BNB`;
	return `+${usd(item.usd)} ${item.source}`;
}
function href(item: FeedItem) {
	if (item.type === "trade") return `https://bscscan.com/tx/${item.tx}`;
	if (item.type === "revenue") return undefined;
	return item.url;
}

export function Dashboard(props: Props) {
	return (
		<main className="min-h-screen bg-[#050608] text-white">
			<div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(245,158,11,0.16),transparent_32%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,44px_44px,44px_44px]" />
			<div className="relative mx-auto max-w-[1380px] px-3 py-4 md:px-5 md:py-5">
				<Hero ship={props.ship} token={props.token} tokenAddress={props.tokenAddress} />
				<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
					<div className="space-y-3">
						<TokenChart series={props.initialCandles} token={props.token} />
						<Kpis token={props.token} />
						<About holdings={props.holdings} token={props.token} />
					</div>
					<Swap token={props.token} tokenAddress={props.tokenAddress} />
				</div>
				<div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
					<Revenue />
					<Activity items={props.activity} token={props.token} />
				</div>
				<footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-white/[0.05] border-t pt-4 font-mono text-[10px] text-white/30 uppercase tracking-[0.16em]">
					<a className="hover:text-amber-300" href="/">
						back to waifu.fun
					</a>
					<span>template contract: {addr(props.tokenAddress)}</span>
				</footer>
			</div>
		</main>
	);
}
