"use client";

import { useAdminTokenState } from "@/components/admin/ops-token-gate";
import {
	type AdminElizaCloudTestInput,
	useElizaCloudRuntimeRef,
	useElizaCloudStatus,
	useElizaCloudTestControl,
	useElizaCloudTestEnqueueProvisioning,
	useElizaCloudTestProvision,
} from "@/lib/api/admin";
import {
	CircleDollarSign,
	LoaderCircle,
	PauseCircle,
	PlayCircle,
	ReceiptText,
	RefreshCw,
	Rocket,
	Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

const DEFAULT_TOKEN = "0x0000000000000000000000000000000000000001";
const DEFAULT_AGENT_WALLET = "0x0000000000000000000000000000000000000009";
const DEFAULT_ADMIN_WALLET = "0x0000000000000000000000000000000000000001";

export default function ElizaCloudOpsPage() {
	const { token } = useAdminTokenState();
	const status = useElizaCloudStatus(token);
	const provision = useElizaCloudTestProvision(token);
	const enqueueProvisioning = useElizaCloudTestEnqueueProvisioning(token);
	const control = useElizaCloudTestControl(token);
	const [form, setForm] = useState<AdminElizaCloudTestInput>({
		agentId: `waifu-test-${crypto.randomUUID().slice(0, 8)}`,
		tokenContractAddress: DEFAULT_TOKEN,
		chain: "bsc",
		chainId: 56,
		tokenName: "Waifu Cloud Test",
		tokenTicker: "WTEST",
		name: "Waifu Cloud Test",
		bio: "End-to-end Eliza Cloud provisioning test.",
		agentEvmAddress: DEFAULT_AGENT_WALLET,
		adminWallet: DEFAULT_ADMIN_WALLET,
	});
	const [sessionId, setSessionId] = useState("");
	const runtimeRef = useElizaCloudRuntimeRef(
		token,
		form.agentId,
		Boolean(enqueueProvisioning.data?.data?.enqueued || enqueueProvisioning.data?.data?.dryRun === false),
	);

	const directResult = provision.data?.data;
	const workerResult = runtimeRef.data?.ok ? runtimeRef.data.data : undefined;
	const result = workerResult ?? directResult;
	const controlResult = control.data?.data;
	const readiness = status.data?.data;
	const payloadPreview = useMemo(() => JSON.stringify(form, null, 2), [form]);
	const canControl = Boolean(result?.containerId || result?.cloudAgentId);
	const pollingEndpoint =
		result?.polling && typeof result.polling.endpoint === "string" ? result.polling.endpoint : "none";

	function setField<K extends keyof AdminElizaCloudTestInput>(key: K, value: AdminElizaCloudTestInput[K]) {
		setForm((current) => ({ ...current, [key]: value }));
	}

	function runControl(action: "pause" | "resume" | "restart" | "status" | "top-up" | "balance" | "verify-top-up") {
		control.mutate({
			action,
			...(result?.containerId ? { containerId: result.containerId } : {}),
			...(result?.cloudAgentId ? { cloudAgentId: result.cloudAgentId } : {}),
			...(sessionId ? { sessionId } : {}),
			amountUsdCents: 500,
		});
	}

	return (
		<div className="space-y-4">
			<div className="flex items-end justify-between gap-4 flex-wrap">
				<div>
					<h2 className="text-base font-mono text-white">Eliza Cloud Provisioning</h2>
					<p className="text-xs text-neutral-500 font-mono">
						Deploys a hosted agent container through the backend Eliza Cloud client.
					</p>
					{readiness ? (
						<p className="mt-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
							{readiness.ready ? "ready" : `missing: ${readiness.missing.join(", ") || "none"}`}
						</p>
					) : null}
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => enqueueProvisioning.mutate({ ...form, source: "agent.graduated" })}
						disabled={enqueueProvisioning.isPending || !form.agentId || !form.tokenContractAddress}
						className="inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-neutral-100 hover:bg-white/10 disabled:opacity-50"
					>
						{enqueueProvisioning.isPending ? (
							<LoaderCircle className="size-3 animate-spin" />
						) : (
							<RefreshCw className="size-3" />
						)}
						enqueue worker
					</button>
					<button
						type="button"
						onClick={() => runtimeRef.refetch()}
						disabled={runtimeRef.isFetching || !form.agentId}
						className="inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-neutral-100 hover:bg-white/10 disabled:opacity-50"
					>
						{runtimeRef.isFetching ? (
							<LoaderCircle className="size-3 animate-spin" />
						) : (
							<RefreshCw className="size-3" />
						)}
						poll runtime
					</button>
					<button
						type="button"
						onClick={() => provision.mutate(form)}
						disabled={provision.isPending || !form.tokenContractAddress || !form.agentEvmAddress}
						className="inline-flex items-center gap-2 rounded-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-red-100 hover:bg-red-500/20 disabled:opacity-50"
					>
						{provision.isPending ? <LoaderCircle className="size-3 animate-spin" /> : <Rocket className="size-3" />}
						run provision
					</button>
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
				<form
					className="rounded-md border border-white/5 bg-[#0c0c0e] p-4 grid gap-3 sm:grid-cols-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (!form.tokenContractAddress || !form.agentEvmAddress) return;
						provision.mutate(form);
					}}
				>
					<Field label="agent id" value={form.agentId ?? ""} onChange={(v) => setField("agentId", v)} />
					<Field label="project name" value={form.projectName ?? ""} onChange={(v) => setField("projectName", v)} />
					<Field
						label="token address"
						value={form.tokenContractAddress}
						onChange={(v) => setField("tokenContractAddress", v)}
					/>
					<Field
						label="agent evm address"
						value={form.agentEvmAddress ?? ""}
						onChange={(v) => setField("agentEvmAddress", v)}
					/>
					<Field label="chain" value={form.chain ?? "bsc"} onChange={(v) => setField("chain", v)} />
					<Field
						label="chain id"
						value={String(form.chainId ?? 56)}
						onChange={(v) => setField("chainId", Number(v) || 56)}
					/>
					<Field label="token name" value={form.tokenName ?? ""} onChange={(v) => setField("tokenName", v)} />
					<Field
						label="ticker"
						value={form.tokenTicker ?? ""}
						onChange={(v) => setField("tokenTicker", v.toUpperCase())}
					/>
					<Field label="character name" value={form.name ?? ""} onChange={(v) => setField("name", v)} />
					<Field label="admin wallet" value={form.adminWallet ?? ""} onChange={(v) => setField("adminWallet", v)} />
					<div className="sm:col-span-2">
						<Field
							label="container image uri"
							value={form.containerImageUri ?? ""}
							onChange={(v) => setField("containerImageUri", v)}
						/>
					</div>
					<label className="sm:col-span-2 grid gap-1">
						<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">bio</span>
						<textarea
							value={form.bio ?? ""}
							onChange={(event) => setField("bio", event.target.value)}
							className="min-h-24 rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
						/>
					</label>
				</form>

				<aside className="space-y-4">
					<div className="rounded-md border border-white/5 bg-[#0c0c0e] p-4">
						<h3 className="text-xs font-mono uppercase tracking-wider text-neutral-300">readiness</h3>
						{status.error ? (
							<p className="mt-3 text-xs text-red-300">{(status.error as Error).message}</p>
						) : readiness ? (
							<div className="mt-3 space-y-2">
								<Row label="base url" value={readiness.baseUrl} />
								<div className="grid grid-cols-2 gap-2">
									{Object.entries(readiness.checks).map(([key, value]) => (
										<span
											key={key}
											className={`rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${
												value
													? "border-[#00ff87]/20 bg-[#00ff87]/5 text-[#00ff87]"
													: "border-red-500/20 bg-red-500/5 text-red-300"
											}`}
										>
											{key}
										</span>
									))}
								</div>
							</div>
						) : (
							<p className="mt-3 text-xs text-neutral-500">Enter an admin token to load readiness.</p>
						)}
					</div>
					<div className="rounded-md border border-white/5 bg-[#0c0c0e] p-4">
						<h3 className="text-xs font-mono uppercase tracking-wider text-neutral-300">result</h3>
						{enqueueProvisioning.error ? (
							<p className="mt-3 text-xs text-red-300">{(enqueueProvisioning.error as Error).message}</p>
						) : enqueueProvisioning.data?.data ? (
							<dl className="mt-3 space-y-2 text-xs font-mono">
								<Row label="worker job" value={enqueueProvisioning.data.data.jobId} />
								<Row label="source" value={enqueueProvisioning.data.data.payload.source} />
								<Row label="enqueued" value={enqueueProvisioning.data.data.enqueued ? "yes" : "dry-run"} />
							</dl>
						) : null}
						{runtimeRef.error ? (
							<p className="mt-3 text-xs text-red-300">{(runtimeRef.error as Error).message}</p>
						) : runtimeRef.data?.ok === false ? (
							<p className="mt-3 text-xs text-amber-300">
								{runtimeRef.data.message ?? "Worker runtime not ready yet."}
							</p>
						) : null}
						{provision.error ? (
							<p className="mt-3 text-xs text-red-300">{(provision.error as Error).message}</p>
						) : result ? (
							<dl className="mt-3 space-y-2 text-xs font-mono">
								<Row label="cloud agent" value={result.cloudAgentId} />
								<Row label="container" value={result.containerId ?? "pending"} />
								<Row label="status" value={result.status ?? "pending"} />
								<Row label="url" value={result.containerUrl ?? "pending"} />
								<Row
									label="wallet"
									value={
										result.account?.primaryWalletAddress ??
										result.walletProvisioning?.id ??
										result.walletProvisioning?.address ??
										"pending"
									}
								/>
								<Row
									label="free credit"
									value={
										typeof result.account?.initialFreeCreditsUsd === "number"
											? `$${result.account.initialFreeCreditsUsd}`
											: "unknown"
									}
								/>
								<Row label="poll" value={pollingEndpoint} />
							</dl>
						) : (
							<p className="mt-3 text-xs text-neutral-500">No run yet.</p>
						)}
					</div>
					<div className="rounded-md border border-white/5 bg-[#0c0c0e] p-4">
						<h3 className="text-xs font-mono uppercase tracking-wider text-neutral-300">runtime controls</h3>
						<div className="mt-3 grid grid-cols-3 gap-2">
							<ControlButton
								label="pause"
								disabled={!canControl || control.isPending}
								icon={
									control.isPending ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<PauseCircle className="size-3" />
									)
								}
								onClick={() => runControl("pause")}
							/>
							<ControlButton
								label="resume"
								disabled={!canControl || control.isPending}
								icon={
									control.isPending ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<PlayCircle className="size-3" />
									)
								}
								onClick={() => runControl("resume")}
							/>
							<ControlButton
								label="restart"
								disabled={!canControl || control.isPending}
								icon={
									control.isPending ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<RefreshCw className="size-3" />
									)
								}
								onClick={() => runControl("restart")}
							/>
							<ControlButton
								label="status"
								disabled={!canControl || control.isPending}
								icon={
									control.isPending ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<RefreshCw className="size-3" />
									)
								}
								onClick={() => runControl("status")}
							/>
							<ControlButton
								label="$5"
								disabled={!canControl || control.isPending || !result?.cloudAgentId}
								icon={
									control.isPending ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<CircleDollarSign className="size-3" />
									)
								}
								onClick={() => runControl("top-up")}
							/>
							<ControlButton
								label="balance"
								disabled={!canControl || control.isPending || !result?.cloudAgentId}
								icon={
									control.isPending ? <LoaderCircle className="size-3 animate-spin" /> : <Wallet className="size-3" />
								}
								onClick={() => runControl("balance")}
							/>
							<ControlButton
								label="verify"
								disabled={control.isPending || !sessionId}
								icon={
									control.isPending ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<ReceiptText className="size-3" />
									)
								}
								onClick={() => runControl("verify-top-up")}
							/>
						</div>
						<label className="mt-3 grid gap-1">
							<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">checkout session</span>
							<input
								value={sessionId}
								onChange={(event) => setSessionId(event.target.value)}
								className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-red-400"
							/>
						</label>
						{control.error ? (
							<p className="mt-3 text-xs text-red-300">{(control.error as Error).message}</p>
						) : controlResult ? (
							<div className="mt-3 space-y-2 text-xs font-mono text-neutral-400">
								<p>last action: {controlResult.action}</p>
								{controlResult.balance ? (
									<p>
										org balance: ${controlResult.balance.balance.toFixed(4)}
										{typeof controlResult.balance.totalSpent === "number"
											? ` · spent $${controlResult.balance.totalSpent.toFixed(4)}`
											: ""}
									</p>
								) : null}
								{controlResult.verification ? (
									<p>
										verified: ${controlResult.verification.amount ?? 0} · {controlResult.verification.message ?? "ok"}
									</p>
								) : null}
								{controlResult.checkout?.url || controlResult.checkout?.checkoutUrl ? (
									<a
										href={controlResult.checkout.url ?? controlResult.checkout.checkoutUrl ?? "#"}
										target="_blank"
										rel="noreferrer"
										className="break-all text-[#00ff87] hover:text-white"
									>
										open checkout
									</a>
								) : null}
							</div>
						) : (
							<p className="mt-3 text-xs text-neutral-500">Run provision first, then pause, resume, or top up.</p>
						)}
					</div>
					<pre className="rounded-md border border-white/5 bg-black/40 p-3 text-[10px] text-neutral-400 overflow-x-auto">
						{payloadPreview}
					</pre>
				</aside>
			</div>
		</div>
	);
}

function ControlButton({
	label,
	icon,
	disabled,
	onClick,
}: {
	label: string;
	icon: ReactNode;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className="inline-flex items-center justify-center gap-1 rounded-sm border border-white/10 px-2 py-2 text-[10px] font-mono uppercase tracking-wider text-neutral-200 hover:border-white/20 disabled:opacity-40"
		>
			{icon}
			{label}
		</button>
	);
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	return (
		<label className="grid gap-1">
			<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">{label}</span>
			<input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
			/>
		</label>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1">
			<dt className="text-[10px] uppercase tracking-wider text-neutral-600">{label}</dt>
			<dd className="break-all text-neutral-200">{value}</dd>
		</div>
	);
}
