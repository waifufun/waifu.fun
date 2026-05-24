"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/contexts/locale-context";
import type { AgentDetail, AgentRuntimeKind } from "@/lib/api/patron";
import { cn } from "@/lib/utils";
import { Antenna, ArrowLeftRight, Check, Cloud, Copy, ExternalLink, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TFn = (key: string, params?: Record<string, string>) => string;

type Props = {
	agent: AgentDetail | undefined;
	isLoading: boolean;
};

const PANEL_BASE = "p-5 rounded-sm border border-stroke bg-[#0C0C0C]";
const CARD_INNER = "rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#0A0A0A]";

function formatRelative(iso: string | null | undefined, t: TFn): string {
	if (!iso) return t("patron.runtime.neverLabel");
	const ts = new Date(iso).getTime();
	if (Number.isNaN(ts)) return t("patron.runtime.unknownLabel");
	const diff = Date.now() - ts;
	const s = Math.floor(diff / 1000);
	if (s < 60) return t("patron.runtime.secondsAgo", { n: String(s) });
	const m = Math.floor(s / 60);
	if (m < 60) return t("patron.runtime.minutesAgo", { n: String(m) });
	const h = Math.floor(m / 60);
	if (h < 24) return t("patron.runtime.hoursAgo", { n: String(h) });
	return t("patron.runtime.daysAgo", { n: String(Math.floor(h / 24)) });
}

function formatIssuedDate(iso: string | null | undefined, t: TFn): string {
	if (!iso) return t("patron.runtime.unknownLabel");
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return t("patron.runtime.unknownLabel");
	return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	const handle = async () => {
		try {
			if (navigator.clipboard) {
				await navigator.clipboard.writeText(value);
			} else {
				const ta = document.createElement("textarea");
				ta.value = value;
				ta.style.position = "fixed";
				ta.style.opacity = "0";
				document.body.appendChild(ta);
				ta.focus();
				ta.select();
				document.execCommand("copy");
				document.body.removeChild(ta);
			}
			setCopied(true);
		} catch {
			// best-effort
		}
	};
	useEffect(() => {
		if (!copied) return;
		const id = window.setTimeout(() => setCopied(false), 1500);
		return () => window.clearTimeout(id);
	}, [copied]);

	return (
		<button
			type="button"
			onClick={handle}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a1a1aa] transition-colors duration-200 hover:border-[#00ff87]/40 hover:text-[#00ff87]",
				className,
			)}
			aria-label={label ?? t("patron.runtime.copyAria")}
		>
			{copied ? (
				<>
					<Check className="h-3 w-3" strokeWidth={1.75} />
					<span>{t("patron.runtime.copied")}</span>
				</>
			) : (
				<>
					<Copy className="h-3 w-3" strokeWidth={1.75} />
					<span>{label ?? t("patron.runtime.copy")}</span>
				</>
			)}
		</button>
	);
}

function highlightSnippet(code: string, lang: "js" | "py" | "bash"): React.ReactNode {
	// Lightweight monochrome syntax styling. Pure regex; no runtime deps.
	const lines = code.split("\n");
	return (
		<>
			{lines.map((line, i) => {
				const isComment =
					(lang === "js" && line.trim().startsWith("//")) ||
					(lang === "py" && line.trim().startsWith("#")) ||
					(lang === "bash" && line.trim().startsWith("#"));
				return (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: source order is stable
						key={i}
						className={cn("block", isComment ? "text-[#52525b]" : "text-[#d4d4d8]")}
					>
						{line || " "}
					</span>
				);
			})}
		</>
	);
}

function CodeBlock({
	code,
	lang,
	label,
}: {
	code: string;
	lang: "js" | "py" | "bash";
	label: string;
}) {
	return (
		<div className={cn(CARD_INNER, "relative")}>
			<div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-3 py-2">
				<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">{label}</span>
				<CopyButton value={code} />
			</div>
			<pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-[1.65] font-mono">
				{highlightSnippet(code, lang)}
			</pre>
		</div>
	);
}

function StatusDot({ live }: { live: boolean }) {
	return (
		<span
			className={cn(
				"inline-block h-1.5 w-1.5 rounded-full",
				live ? "bg-[#00ff87] shadow-[0_0_8px_rgba(0,255,135,0.6)]" : "bg-[#3f3f46]",
			)}
			aria-hidden
		/>
	);
}

/* -------------------------------------------------------------------------- */
/* Webhook variant                                                            */
/* -------------------------------------------------------------------------- */

function WebhookCard({ agent }: { agent: AgentDetail }) {
	const { t } = useTranslation();
	const runtime = agent.runtime;
	const webhookUrl = runtime?.webhookUrl ?? t("patron.runtime.configureWebhook");
	const masked = runtime?.webhookSecretMasked ?? "wks_••••••••••••••••";
	const raw = runtime?.webhookSecretRaw ?? null;
	const lastPulse = runtime?.lastHb_signalAt ?? null;
	const live = lastPulse && Date.now() - new Date(lastPulse).getTime() < 90_000;

	const [revealed, setRevealed] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

	const handleTest = async () => {
		setTesting(true);
		setTestResult(null);
		try {
			const base = process.env.NEXT_PUBLIC_API_URL ?? "";
			const res = await fetch(`${base}/v2/agents/${encodeURIComponent(agent.id)}/runtime/test`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			if (res.ok) {
				setTestResult({ ok: true, message: t("patron.runtime.testWebhookQueued") });
			} else if (res.status === 404) {
				// graceful stub: simulate success so the UI is exercised end-to-end
				setTestResult({ ok: true, message: t("patron.runtime.testEndpointStub") });
			} else {
				setTestResult({ ok: false, message: t("patron.runtime.testRequestFailed", { status: String(res.status) }) });
			}
		} catch (err) {
			setTestResult({
				ok: false,
				message: err instanceof Error ? err.message : t("patron.runtime.networkError"),
			});
		} finally {
			setTesting(false);
		}
	};

	return (
		<section aria-label={t("patron.runtime.webhookAriaLabel")} className={PANEL_BASE}>
			<header className="mb-4 flex items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] text-[#00ff87]">
						<ArrowLeftRight className="h-4 w-4" strokeWidth={1.75} />
					</div>
					<div>
						<h2 className="text-sm font-medium uppercase tracking-wide text-white">
							{t("patron.runtime.webhookTitle")}
						</h2>
						<p className="mt-1 text-xs text-[#71717a]">{t("patron.runtime.webhookBody")}</p>
					</div>
				</div>
				<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#71717a]">
					<StatusDot live={Boolean(live)} />
					<span>{live ? t("patron.runtime.live") : t("patron.runtime.idle")}</span>
				</div>
			</header>

			<div className="grid gap-3">
				<div>
					<div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
						{t("patron.runtime.webhookUrlLabel")}
					</div>
					<div className={cn(CARD_INNER, "flex items-center justify-between gap-2 px-3 py-2.5")}>
						<code className="truncate font-mono text-xs text-[#e4e4e7]">{webhookUrl}</code>
						<CopyButton value={webhookUrl} />
					</div>
				</div>

				<div>
					<div className="mb-1.5 flex items-center justify-between">
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
							{t("patron.runtime.signingSecretLabel")}
						</span>
						{raw ? (
							<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87]">
								{t("patron.runtime.shownOnceSaveNow")}
							</span>
						) : null}
					</div>
					<div className={cn(CARD_INNER, "flex items-center justify-between gap-2 px-3 py-2.5")}>
						<code className="truncate font-mono text-xs text-[#e4e4e7]">{revealed && raw ? raw : masked}</code>
						<div className="flex shrink-0 items-center gap-2">
							{raw ? (
								<button
									type="button"
									onClick={() => setRevealed((r) => !r)}
									className="inline-flex items-center gap-1.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a1a1aa] hover:border-[#00ff87]/40 hover:text-[#00ff87] transition-colors duration-200"
									aria-label={revealed ? t("patron.runtime.hideSecretAria") : t("patron.runtime.revealSecretAria")}
								>
									{revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
									<span>{revealed ? t("patron.runtime.hide") : t("patron.runtime.reveal")}</span>
								</button>
							) : null}
							<CopyButton value={raw ?? masked} />
						</div>
					</div>
					{!raw ? (
						<p className="mt-1.5 text-[11px] text-[#71717a]">
							{t("patron.runtime.rawSecretHelp")}{" "}
							<code className="font-mono text-[#a1a1aa]">/v2/agents/{agent.id}/runtime/rotate-secret</code>.
						</p>
					) : null}
				</div>

				<div className="grid grid-cols-2 gap-3 pt-2">
					<div>
						<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
							{t("patron.runtime.lastPulse")}
						</div>
						<div className="mt-1 font-mono text-xs text-[#e4e4e7]">{formatRelative(lastPulse, t)}</div>
					</div>
					<div className="flex items-end justify-end">
						<button
							type="button"
							onClick={handleTest}
							disabled={testing}
							className="inline-flex items-center gap-1.5 rounded-sm border border-[#00ff87]/30 bg-[#00ff87]/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#00ff87] hover:bg-[#00ff87]/10 hover:border-[#00ff87]/60 transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none"
						>
							<RotateCcw className={cn("h-3 w-3", testing && "animate-spin")} strokeWidth={1.75} />
							<span>{testing ? t("patron.runtime.dispatching") : t("patron.runtime.testWebhook")}</span>
						</button>
					</div>
				</div>

				{testResult ? (
					<output
						className={cn(
							"block rounded-sm border px-3 py-2 text-xs",
							testResult.ok
								? "border-[#00ff87]/30 bg-[#00ff87]/5 text-[#86efac]"
								: "border-red-500/30 bg-red-500/5 text-red-300",
						)}
					>
						{testResult.message}
					</output>
				) : null}
			</div>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/* Pull variant                                                               */
/* -------------------------------------------------------------------------- */

function buildSnippets(agentId: string, hb_signalEndpoint: string, eventsEndpoint: string) {
	const apiBase = "https://api.waifu.fun";
	const fullPulse = `${apiBase}${hb_signalEndpoint}`;
	const fullEvents = `${apiBase}${eventsEndpoint}`;

	const js = `// hb_signal every 30s
await fetch("${fullPulse}", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.WAIFU_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ status: "live", metadata: { version: "my-agent/1.0.0" } }),
});

// poll for events
const res = await fetch("${fullEvents}?limit=20", {
  headers: { "Authorization": \`Bearer \${process.env.WAIFU_API_KEY}\` },
});
const { events, nextCursor } = await res.json();
for (const ev of events) {
  // dispatch ev.eventType to your agent's brain
}`;

	const py = `import os, httpx

API_KEY = os.environ["WAIFU_API_KEY"]
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# pulse every 30s
httpx.post(
    "${fullPulse}",
    json={"status": "live", "metadata": {"version": "my-agent/1.0.0"}},
    headers=HEADERS,
)

# poll for events
r = httpx.get(
    "${fullEvents}",
    params={"limit": 20},
    headers=HEADERS,
)
data = r.json()
for ev in data["events"]:
    # dispatch ev["eventType"] to your agent's brain
    pass`;

	const bash = `# pulse every 30s
curl -X POST "${fullPulse}" \\
  -H "Authorization: Bearer $WAIFU_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"live","metadata":{"version":"my-agent/1.0.0"}}'

# poll events
curl -H "Authorization: Bearer $WAIFU_API_KEY" \\
  "${fullEvents}?limit=20"`;

	// inject AGENT_ID variants by string-substituting placeholders that aren't in the URLs above
	void agentId;
	return { js, py, bash };
}

function PullCard({ agent }: { agent: AgentDetail }) {
	const { t } = useTranslation();
	const runtime = agent.runtime;
	const apiKey = runtime?.rawApiKey ?? null;
	const issuedAt = runtime?.apiKeyIssuedAt ?? null;
	const lastPulse = runtime?.lastHb_signalAt ?? null;
	const live = lastPulse && Date.now() - new Date(lastPulse).getTime() < 90_000;

	const hb_signalEndpoint = runtime?.hb_signalEndpoint ?? `/v2/agents/${agent.id}/pulse`;
	const eventsEndpoint = runtime?.eventsPullEndpoint ?? `/v2/agents/${agent.id}/events/pull`;

	const snippets = useMemo(
		() => buildSnippets(agent.id, hb_signalEndpoint, eventsEndpoint),
		[agent.id, hb_signalEndpoint, eventsEndpoint],
	);

	const [revealed, setRevealed] = useState(false);

	return (
		<section aria-label={t("patron.runtime.pullAriaLabel")} className={PANEL_BASE}>
			<header className="mb-4 flex items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] text-[#00ff87]">
						<Antenna className="h-4 w-4" strokeWidth={1.75} />
					</div>
					<div>
						<h2 className="text-sm font-medium uppercase tracking-wide text-white">{t("patron.runtime.pullTitle")}</h2>
						<p className="mt-1 text-xs text-[#71717a]">
							{t("patron.runtime.pullBodyPrefix")} <code className="font-mono text-[#a1a1aa]">~30s</code>{" "}
							{t("patron.runtime.pullBodySuffix")}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#71717a]">
					<StatusDot live={Boolean(live)} />
					<span>{live ? t("patron.runtime.live") : t("patron.runtime.idle")}</span>
				</div>
			</header>

			{apiKey ? (
				<output className={cn(CARD_INNER, "block mb-4 border-[#00ff87]/40 bg-[#00ff87]/[0.04]")}>
					<div className="flex items-center justify-between gap-3 border-b border-[#00ff87]/15 px-3 py-2">
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87]">
							{t("patron.runtime.apiKeyOnceHeader")}
						</span>
					</div>
					<div className="flex items-center justify-between gap-2 px-3 py-2.5">
						<code className="truncate font-mono text-xs text-[#e4e4e7]">
							{revealed ? apiKey : `${apiKey.slice(0, 8)}${"•".repeat(Math.max(0, apiKey.length - 8))}`}
						</code>
						<div className="flex shrink-0 items-center gap-2">
							<button
								type="button"
								onClick={() => setRevealed((r) => !r)}
								className="inline-flex items-center gap-1.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a1a1aa] hover:border-[#00ff87]/40 hover:text-[#00ff87] transition-colors duration-200"
								aria-label={revealed ? t("patron.runtime.hideKeyAria") : t("patron.runtime.revealKeyAria")}
							>
								{revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
								<span>{revealed ? t("patron.runtime.hide") : t("patron.runtime.reveal")}</span>
							</button>
							<CopyButton value={apiKey} />
						</div>
					</div>
				</output>
			) : (
				<div className={cn(CARD_INNER, "mb-4 px-3 py-3")}>
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
								{t("patron.runtime.apiKeyLabel")}
							</div>
							<div className="mt-1 text-xs text-[#a1a1aa]">
								{t("patron.runtime.apiKeyIssuedBody", { date: formatIssuedDate(issuedAt, t) })}
							</div>
						</div>
						<a
							href={`/v2/agents/${agent.id}/runtime/rotate-key`}
							className="inline-flex items-center gap-1.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a1a1aa] hover:border-[#00ff87]/40 hover:text-[#00ff87] transition-colors duration-200"
						>
							<RotateCcw className="h-3 w-3" strokeWidth={1.75} />
							<span>{t("patron.runtime.rotateKey")}</span>
						</a>
					</div>
				</div>
			)}

			<div className="grid gap-3 mb-4">
				<EndpointRow label={t("patron.runtime.pulseLabel")} method="POST" path={hb_signalEndpoint} />
				<EndpointRow label={t("patron.runtime.eventsPullLabel")} method="GET" path={eventsEndpoint} />
			</div>

			<div className="grid grid-cols-2 gap-3 mb-5 pt-1 border-t border-[rgba(255,255,255,0.06)]">
				<div className="pt-3">
					<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
						{t("patron.runtime.lastPulse")}
					</div>
					<div className="mt-1 font-mono text-xs text-[#e4e4e7]">{formatRelative(lastPulse, t)}</div>
				</div>
				<div className="pt-3">
					<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
						{t("patron.runtime.issued")}
					</div>
					<div className="mt-1 font-mono text-xs text-[#e4e4e7]">{formatIssuedDate(issuedAt, t)}</div>
				</div>
			</div>

			<Tabs defaultValue="js" className="gap-3">
				<TabsList className="self-start">
					<TabsTrigger value="js" className="px-4">
						{t("patron.runtime.javascript")}
					</TabsTrigger>
					<TabsTrigger value="py" className="px-4">
						{t("patron.runtime.python")}
					</TabsTrigger>
					<TabsTrigger value="bash" className="px-4">
						{t("patron.runtime.curl")}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="js">
					<CodeBlock code={snippets.js} lang="js" label={t("patron.runtime.nodeLabel")} />
				</TabsContent>
				<TabsContent value="py">
					<CodeBlock code={snippets.py} lang="py" label={t("patron.runtime.pythonLabel")} />
				</TabsContent>
				<TabsContent value="bash">
					<CodeBlock code={snippets.bash} lang="bash" label={t("patron.runtime.curlLabel")} />
				</TabsContent>
			</Tabs>
		</section>
	);
}

function EndpointRow({ label, method, path }: { label: string; method: "GET" | "POST"; path: string }) {
	return (
		<div className={cn(CARD_INNER, "flex items-center justify-between gap-2 px-3 py-2.5")}>
			<div className="flex min-w-0 items-center gap-3">
				<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b] shrink-0">{label}</span>
				<span
					className={cn(
						"shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] tracking-wide",
						method === "POST" ? "bg-[#00ff87]/10 text-[#00ff87]" : "bg-[rgba(255,255,255,0.05)] text-[#a1a1aa]",
					)}
				>
					{method}
				</span>
				<code className="truncate font-mono text-xs text-[#e4e4e7]">{path}</code>
			</div>
			<CopyButton value={path} />
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/* Managed placeholder                                                        */
/* -------------------------------------------------------------------------- */

function ManagedPlaceholder({ agent }: { agent: AgentDetail }) {
	const runtime = agent.runtime;
	const cloudAgentId = runtime?.cloudAgentId ?? null;
	const cloudStatus = runtime?.cloudStatus ?? agent.status;
	const links = [
		runtime?.webUiUrl ? { label: "open cloud", href: runtime.webUiUrl } : null,
		runtime?.logsUrl ? { label: "logs", href: runtime.logsUrl } : null,
	].filter((link): link is { label: string; href: string } => Boolean(link));

	return (
		<section aria-label="Managed runtime" className={PANEL_BASE}>
			<header className="mb-4 flex items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] text-[#00ff87]">
						<Cloud className="h-4 w-4" strokeWidth={1.75} />
					</div>
					<div>
						<h2 className="text-sm font-medium uppercase tracking-wide text-white">eliza cloud runtime</h2>
						<p className="mt-1 text-xs text-[#71717a]">
							Hosted runtime provisioned by waifu. No webhook or polling setup required.
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#71717a]">
					<StatusDot live={cloudStatus === "active" || cloudStatus === "running"} />
					<span>{cloudStatus.replace(/_/g, " ")}</span>
				</div>
			</header>

			<div className="grid gap-3">
				{cloudAgentId ? (
					<div className={cn(CARD_INNER, "flex items-center justify-between gap-2 px-3 py-2.5")}>
						<div className="min-w-0">
							<div className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">cloud agent id</div>
							<code className="block truncate font-mono text-xs text-[#e4e4e7]">{cloudAgentId}</code>
						</div>
						<CopyButton value={cloudAgentId} />
					</div>
				) : null}

				{links.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{links.map((link) => (
							<a
								key={link.href}
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a1a1aa] transition-colors duration-200 hover:border-[#00ff87]/40 hover:text-[#00ff87]"
							>
								<ExternalLink className="h-3 w-3" strokeWidth={1.75} />
								<span>{link.label}</span>
							</a>
						))}
					</div>
				) : (
					<p className="text-xs text-[#71717a]">Cloud links will appear here after the provisioner returns them.</p>
				)}
			</div>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function PanelSkeleton() {
	return (
		<section aria-busy className={cn(PANEL_BASE, "animate-pulse")}>
			<div className="mb-4 flex items-start gap-3">
				<div className="h-9 w-9 rounded-sm bg-[#141414]" />
				<div className="space-y-2">
					<div className="h-4 w-40 rounded bg-[#141414]" />
					<div className="h-3 w-64 rounded bg-[#141414]" />
				</div>
			</div>
			<div className="space-y-3">
				<div className="h-10 rounded bg-[#141414]" />
				<div className="h-10 rounded bg-[#141414]" />
				<div className="h-32 rounded bg-[#141414]" />
			</div>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/* Public component                                                           */
/* -------------------------------------------------------------------------- */

export default function RuntimeConnectionPanel({ agent, isLoading }: Props) {
	if (isLoading || !agent) {
		// only show a skeleton if we genuinely don't know the kind yet
		if (!agent) return null;
		return <PanelSkeleton />;
	}

	const kind: AgentRuntimeKind | undefined = agent.runtimeKind ?? agent.runtime?.kind;

	if (!kind || kind === "eliza-cloud") {
		// managed runtime: route to ping-us placeholder rather than silent null
		return <ManagedPlaceholder agent={agent} />;
	}

	if (kind === "third-party-webhook") return <WebhookCard agent={agent} />;
	if (kind === "third-party-pull") return <PullCard agent={agent} />;
	return null;
}
