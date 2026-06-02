"use client";

import { useAdminTokenState } from "@/components/admin/ops-token-gate";
import { Label, Panel, THEME_TOKENS } from "@/components/agent-home/wave-t/_primitives";
import {
	type AdminElizaCloudTestInput,
	useElizaCloudHostedChatApi,
	useElizaCloudOwnerRuntimeControl,
	useElizaCloudOwnerRuntimeTest,
	useElizaCloudRuntimeRef,
	useElizaCloudStatus,
	useElizaCloudTestControl,
	useElizaCloudTestEnqueueProvisioning,
	useElizaCloudTestProof,
	useElizaCloudTestProvision,
	useElizaCloudTokenChatSession,
} from "@/lib/api/admin";
import {
	CircleDollarSign,
	LoaderCircle,
	MessageCircle,
	PauseCircle,
	PlayCircle,
	ReceiptText,
	RefreshCw,
	Rocket,
	ShieldAlert,
	Wallet,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_TOKEN = "0x0000000000000000000000000000000000000001";
const DEFAULT_AGENT_WALLET = "0x0000000000000000000000000000000000000009";
const DEFAULT_ADMIN_WALLET = "0x0000000000000000000000000000000000000001";
const PROOF_POLL_INTERVAL_MS = 5_000;
const PROOF_POLL_ATTEMPTS = 24;

type ProofStepState = "pending" | "running" | "passed" | "failed" | "skipped";
type ProofStep = {
	key: string;
	label: string;
	state: ProofStepState;
	detail?: string;
};

export default function ElizaCloudOpsPage() {
	const { token } = useAdminTokenState();
	const status = useElizaCloudStatus(token);
	const provision = useElizaCloudTestProvision(token);
	const enqueueProvisioning = useElizaCloudTestEnqueueProvisioning(token);
	const backendProof = useElizaCloudTestProof(token);
	const control = useElizaCloudTestControl(token);
	const ownerRuntimeTest = useElizaCloudOwnerRuntimeTest();
	const ownerRuntimeControl = useElizaCloudOwnerRuntimeControl();
	const chatSession = useElizaCloudTokenChatSession();
	const hostedChatApi = useElizaCloudHostedChatApi();
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
		containerPort: 3000,
		containerDesiredCount: 1,
		containerArchitecture: "arm64",
		containerHealthCheckPath: "/api/health",
	});
	const [enqueueSource, setEnqueueSource] = useState<"agent.bonded" | "agent.graduated" | "token.migrated" | "manual">(
		"agent.bonded",
	);
	const [enqueueDryRun, setEnqueueDryRun] = useState(true);
	const [jobId, setJobId] = useState("");
	const [sessionId, setSessionId] = useState("");
	const [stewardBearer, setStewardBearer] = useState("");
	const [ownerBearer, setOwnerBearer] = useState("");
	const [ownerRuntimeAction, setOwnerRuntimeAction] = useState<"status" | "resume" | "restart" | "suspend">("status");
	const [expectedRole, setExpectedRole] = useState<"admin" | "user" | "guest" | "">("");
	const [proofRunning, setProofRunning] = useState(false);
	const [proofSteps, setProofSteps] = useState<ProofStep[]>([]);
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
	const resultWebUiUrl = result?.webUiUrl ?? null;
	const payloadPreview = useMemo(() => JSON.stringify(form, null, 2), [form]);
	const canControl = Boolean(result?.containerId || result?.cloudAgentId);
	const pollingEndpoint =
		result?.polling && typeof result.polling.endpoint === "string" ? result.polling.endpoint : "none";

	function setField<K extends keyof AdminElizaCloudTestInput>(key: K, value: AdminElizaCloudTestInput[K]) {
		setForm((current) => ({ ...current, [key]: value }));
	}

	function setNumberField(
		key: "containerPort" | "containerCpu" | "containerMemory" | "containerDesiredCount",
		value: string,
	) {
		const parsed = Number(value);
		setForm((current) => ({
			...current,
			[key]: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
		}));
	}

	function runControl(
		action:
			| "pause"
			| "resume"
			| "restart"
			| "status"
			| "top-up"
			| "balance"
			| "verify-top-up"
			| "webhook-depleted"
			| "webhook-topped-up",
	) {
		control.mutate({
			action,
			...(form.agentId ? { agentId: form.agentId } : {}),
			...(result?.containerId ? { containerId: result.containerId } : {}),
			...(result?.cloudAgentId ? { cloudAgentId: result.cloudAgentId } : {}),
			...(sessionId ? { sessionId } : {}),
			amountUsdCents: 500,
		});
	}

	function runChatSession() {
		if (!stewardBearer || !form.tokenContractAddress) return;
		hostedChatApi.reset();
		chatSession.mutate({
			bearer: stewardBearer,
			chain: form.chain ?? "bsc",
			chainId: form.chainId ?? 56,
			tokenContractAddress: form.tokenContractAddress,
		});
	}

	function runHostedChatApi() {
		const chatUrl = chatSession.data?.chatUrl;
		if (!chatUrl) return;
		hostedChatApi.mutate({ chatUrl });
	}

	function runOwnerRuntimeTest() {
		if (!ownerBearer || !form.agentId) return;
		ownerRuntimeTest.mutate({ agentId: form.agentId, bearer: ownerBearer });
	}

	function runOwnerRuntimeControl() {
		if (!ownerBearer || !form.agentId) return;
		ownerRuntimeControl.mutate({
			action: ownerRuntimeAction,
			agentId: form.agentId,
			bearer: ownerBearer,
		});
	}

	function upsertProofStep(step: ProofStep) {
		setProofSteps((current) => {
			const index = current.findIndex((item) => item.key === step.key);
			if (index === -1) return [...current, step];
			const next = [...current];
			next[index] = { ...next[index], ...step };
			return next;
		});
	}

	async function pollRuntimeForProof() {
		for (let attempt = 0; attempt < PROOF_POLL_ATTEMPTS; attempt += 1) {
			const runtime = await runtimeRef.refetch();
			const data = runtime.data?.ok ? runtime.data.data : undefined;
			if (data?.cloudAgentId && data.webUiUrl) return data;
			await new Promise((resolve) => setTimeout(resolve, PROOF_POLL_INTERVAL_MS));
		}
		throw new Error("runtime did not expose hosted web ui before timeout");
	}

	async function runFullProof() {
		if (!form.agentId || !form.tokenContractAddress || !form.agentEvmAddress) return;
		setProofRunning(true);
		setProofSteps([]);
		try {
			upsertProofStep({ key: "readiness", label: "readiness", state: "running" });
			const readinessCheck = await status.refetch();
			if (!readinessCheck.data?.data?.ready) {
				throw new Error(readinessCheck.data?.data?.missing.join(", ") || "eliza cloud readiness failed");
			}
			upsertProofStep({ key: "readiness", label: "readiness", state: "passed", detail: "configured" });

			upsertProofStep({ key: "bonded", label: "agent.bonded", state: "running" });
			const enqueue = await enqueueProvisioning.mutateAsync({
				...form,
				source: "agent.bonded",
				dryRun: enqueueDryRun,
				...(jobId ? { jobId } : {}),
			});
			if (!enqueue.data?.jobId) throw new Error("worker enqueue did not return a job id");
			upsertProofStep({
				key: "bonded",
				label: "agent.bonded",
				state: enqueue.data.enqueued ? "passed" : "skipped",
				detail: enqueue.data.enqueued ? enqueue.data.jobId : "dry run payload only",
			});
			if (!enqueue.data.enqueued) return;

			upsertProofStep({ key: "runtime", label: "hosted runtime", state: "running" });
			const runtime = await pollRuntimeForProof();
			upsertProofStep({
				key: "runtime",
				label: "hosted runtime",
				state: "passed",
				detail: runtime.webUiUrl ?? runtime.cloudAgentId,
			});
			const ids = {
				agentId: form.agentId,
				cloudAgentId: runtime.cloudAgentId,
				...(runtime.containerId ? { containerId: runtime.containerId } : {}),
			};

			upsertProofStep({ key: "balance", label: "credits", state: "running" });
			await control.mutateAsync({ action: "balance", ...ids });
			upsertProofStep({ key: "balance", label: "credits", state: "passed", detail: "balance api ok" });

			for (const action of ["pause", "resume", "restart"] as const) {
				upsertProofStep({ key: action, label: action, state: "running" });
				await control.mutateAsync({ action, ...ids });
				upsertProofStep({ key: action, label: action, state: "passed", detail: "control api ok" });
			}

			for (const action of ["webhook-depleted", "webhook-topped-up"] as const) {
				upsertProofStep({ key: action, label: action, state: "running" });
				await control.mutateAsync({ action, ...ids, amountUsdCents: 500, ...(sessionId ? { sessionId } : {}) });
				upsertProofStep({ key: action, label: action, state: "passed", detail: "lifecycle ok" });
			}

			if (stewardBearer) {
				upsertProofStep({ key: "chat", label: "token chat", state: "running" });
				const session = await chatSession.mutateAsync({
					bearer: stewardBearer,
					chain: form.chain ?? "bsc",
					chainId: form.chainId ?? 56,
					tokenContractAddress: form.tokenContractAddress,
				});
				if (expectedRole && session.role !== expectedRole) {
					throw new Error(`chat role mismatch: expected ${expectedRole}, got ${session.role ?? "none"}`);
				}
				if (session.chatUrl) await hostedChatApi.mutateAsync({ chatUrl: session.chatUrl });
				upsertProofStep({ key: "chat", label: "token chat", state: "passed", detail: session.role ?? "role ok" });
			} else {
				upsertProofStep({ key: "chat", label: "token chat", state: "skipped", detail: "no steward bearer" });
			}

			if (ownerBearer) {
				upsertProofStep({ key: "owner", label: "owner control", state: "running" });
				const owner = await ownerRuntimeTest.mutateAsync({ agentId: form.agentId, bearer: ownerBearer });
				if (!owner.hasWebUiUrl) throw new Error("owner runtime test did not report hosted web ui");
				await ownerRuntimeControl.mutateAsync({ action: "restart", agentId: form.agentId, bearer: ownerBearer });
				upsertProofStep({ key: "owner", label: "owner control", state: "passed", detail: "creator api ok" });
			} else {
				upsertProofStep({ key: "owner", label: "owner control", state: "skipped", detail: "no owner bearer" });
			}
		} catch (err) {
			upsertProofStep({
				key: "error",
				label: "proof error",
				state: "failed",
				detail: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setProofRunning(false);
		}
	}

	async function runBackendProof() {
		if (!form.agentId || !form.tokenContractAddress || !form.agentEvmAddress) return;
		setProofSteps([{ key: "backend-proof", label: "backend proof", state: "running" }]);
		try {
			const result = await backendProof.mutateAsync({
				...form,
				source: "agent.bonded",
				dryRun: enqueueDryRun,
				...(jobId ? { jobId } : {}),
				amountUsdCents: 500,
				...(sessionId ? { sessionId } : {}),
				verifyLifecycle: true,
			});
			setProofSteps(
				(result.data?.steps ?? []).map((step) => ({
					key: step.key,
					label: proofLabel(step.key),
					state: step.state,
					...(step.detail ? { detail: step.detail } : {}),
				})),
			);
		} catch (err) {
			setProofSteps([
				{
					key: "backend-proof",
					label: "backend proof",
					state: "failed",
					detail: err instanceof Error ? err.message : String(err),
				},
			]);
		}
	}

	useEffect(() => {
		const checkoutSessionId = controlResult?.checkout?.sessionId;
		if (typeof checkoutSessionId === "string" && checkoutSessionId.length > 0) {
			setSessionId(checkoutSessionId);
		}
	}, [controlResult?.checkout?.sessionId]);

	return (
		<div className="space-y-4" style={THEME_TOKENS as CSSProperties}>
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
						onClick={() =>
							enqueueProvisioning.mutate({
								...form,
								source: enqueueSource,
								dryRun: enqueueDryRun,
								...(jobId ? { jobId } : {}),
							})
						}
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
					<button
						type="button"
						onClick={runFullProof}
						disabled={proofRunning || !form.agentId || !form.tokenContractAddress || !form.agentEvmAddress}
						className="inline-flex items-center gap-2 rounded-sm border border-[#00ff87]/30 bg-[#00ff87]/10 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-[#00ff87] hover:bg-[#00ff87]/15 disabled:opacity-50"
					>
						{proofRunning ? <LoaderCircle className="size-3 animate-spin" /> : <Rocket className="size-3" />}
						run proof
					</button>
					<button
						type="button"
						onClick={runBackendProof}
						disabled={backendProof.isPending || !form.agentId || !form.tokenContractAddress || !form.agentEvmAddress}
						className="inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-neutral-100 hover:bg-white/10 disabled:opacity-50"
					>
						{backendProof.isPending ? (
							<LoaderCircle className="size-3 animate-spin" />
						) : (
							<RefreshCw className="size-3" />
						)}
						api proof
					</button>
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
				<Panel noPad>
					<form
						className="grid gap-3 p-4 sm:grid-cols-2 md:p-5"
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
						<Field
							label="wallet key ref"
							value={form.walletKeyRef ?? ""}
							onChange={(v) => setField("walletKeyRef", v)}
						/>
						<div className="sm:col-span-2">
							<Field
								label="container image uri"
								value={form.containerImageUri ?? ""}
								onChange={(v) => setField("containerImageUri", v)}
							/>
						</div>
						<Field
							label="container project"
							value={form.containerProjectName ?? ""}
							onChange={(v) => setField("containerProjectName", v)}
						/>
						<Field
							label="port"
							value={String(form.containerPort ?? "")}
							onChange={(v) => setNumberField("containerPort", v)}
						/>
						<Field
							label="cpu"
							value={String(form.containerCpu ?? "")}
							onChange={(v) => setNumberField("containerCpu", v)}
						/>
						<Field
							label="memory"
							value={String(form.containerMemory ?? "")}
							onChange={(v) => setNumberField("containerMemory", v)}
						/>
						<Field
							label="desired"
							value={String(form.containerDesiredCount ?? "")}
							onChange={(v) => setNumberField("containerDesiredCount", v)}
						/>
						<label className="grid gap-1">
							<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">architecture</span>
							<select
								value={form.containerArchitecture ?? ""}
								onChange={(event) =>
									setField(
										"containerArchitecture",
										event.target.value === "arm64" || event.target.value === "x86_64" ? event.target.value : undefined,
									)
								}
								className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
							>
								<option value="">auto</option>
								<option value="arm64">arm64</option>
								<option value="x86_64">x86_64</option>
							</select>
						</label>
						<div className="sm:col-span-2">
							<Field
								label="health path"
								value={form.containerHealthCheckPath ?? ""}
								onChange={(v) => setField("containerHealthCheckPath", v)}
							/>
						</div>
						<label className="sm:col-span-2 grid gap-1">
							<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">container env</span>
							<textarea
								value={formatEnvVars(form.containerEnvironmentVars)}
								onChange={(event) => setField("containerEnvironmentVars", parseEnvVars(event.target.value))}
								className="min-h-20 rounded-sm border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white outline-none focus:border-red-400"
								placeholder="CUSTOM_ENV=1"
							/>
						</label>
						<label className="sm:col-span-2 grid gap-1">
							<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">bio</span>
							<textarea
								value={form.bio ?? ""}
								onChange={(event) => setField("bio", event.target.value)}
								className="min-h-24 rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
							/>
						</label>
						<div className="sm:col-span-2 grid gap-3 border-t border-white/5 pt-3 md:grid-cols-[1fr_1fr_auto]">
							<label className="grid gap-1">
								<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">worker source</span>
								<select
									value={enqueueSource}
									onChange={(event) =>
										setEnqueueSource(
											event.target.value as "agent.bonded" | "agent.graduated" | "token.migrated" | "manual",
										)
									}
									className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
								>
									<option value="agent.bonded">agent.bonded</option>
									<option value="agent.graduated">agent.graduated</option>
									<option value="token.migrated">token.migrated</option>
									<option value="manual">manual</option>
								</select>
							</label>
							<Field label="worker job id" value={jobId} onChange={setJobId} />
							<label className="flex items-end gap-2 pb-2 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
								<input
									type="checkbox"
									checked={enqueueDryRun}
									onChange={(event) => setEnqueueDryRun(event.target.checked)}
									className="size-4 accent-[#00ff87]"
								/>
								dry run
							</label>
						</div>
					</form>
				</Panel>

				<aside className="space-y-4">
					<Panel>
						<Label>proof run</Label>
						{proofSteps.length > 0 ? (
							<div className="mt-3 space-y-2">
								{proofSteps.map((step) => (
									<div
										key={step.key}
										className="grid grid-cols-[96px_1fr] gap-2 border-t border-white/5 pt-2 first:border-t-0 first:pt-0"
									>
										<span className={`text-[10px] font-mono uppercase tracking-wider ${proofTone(step.state)}`}>
											{step.state}
										</span>
										<span className="min-w-0 text-xs font-mono text-neutral-300">
											{step.label}
											{step.detail ? <span className="block break-all text-neutral-500">{step.detail}</span> : null}
										</span>
									</div>
								))}
							</div>
						) : (
							<p className="mt-3 text-xs text-neutral-500">
								runs bonded worker provisioning, hosted runtime checks, controls, lifecycle webhooks, and optional chat
								or owner checks.
							</p>
						)}
					</Panel>
					<Panel>
						<Label>readiness</Label>
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
							<p className="mt-3 text-xs text-neutral-500">enter an admin token to load readiness.</p>
						)}
					</Panel>
					<Panel>
						<Label>result</Label>
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
								<Row label="url" value={resultWebUiUrl ?? "pending"} />
								<Row
									label="wallet"
									value={
										result.account?.primaryWalletAddress ??
										result.walletProvisioning?.id ??
										result.walletProvisioning?.address ??
										"pending"
									}
								/>
								<Row label="key ref" value={result.account?.walletKeyRef ?? form.walletKeyRef ?? "default"} />
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
							<p className="mt-3 text-xs text-neutral-500">no run yet.</p>
						)}
					</Panel>
					<Panel>
						<Label>runtime controls</Label>
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
							<ControlButton
								label="depleted"
								disabled={!canControl || control.isPending || !result?.cloudAgentId || !form.agentId}
								icon={
									control.isPending ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<ShieldAlert className="size-3" />
									)
								}
								onClick={() => runControl("webhook-depleted")}
							/>
							<ControlButton
								label="topped"
								disabled={!canControl || control.isPending || !result?.cloudAgentId || !form.agentId}
								icon={
									control.isPending ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<CircleDollarSign className="size-3" />
									)
								}
								onClick={() => runControl("webhook-topped-up")}
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
									<div className="space-y-1">
										<p>
											verified:{" "}
											{typeof controlResult.verification.balance === "number"
												? `balance $${controlResult.verification.balance.toFixed(4)}`
												: `$${controlResult.verification.amount ?? 0}`}{" "}
											· {controlResult.verification.message ?? "ok"}
										</p>
										{typeof controlResult.verification.alreadyApplied === "boolean" ? (
											<p>already applied: {controlResult.verification.alreadyApplied ? "yes" : "no"}</p>
										) : null}
									</div>
								) : null}
								{controlResult.status ? (
									<p>
										runtime: {controlResult.status.status ?? "unknown"}
										{controlResult.status.webUiUrl ? ` · ${controlResult.status.webUiUrl}` : ""}
									</p>
								) : null}
								{controlResult.checkout?.url || controlResult.checkout?.checkoutUrl ? (
									<div className="space-y-1">
										<a
											href={controlResult.checkout.url ?? controlResult.checkout.checkoutUrl ?? "#"}
											target="_blank"
											rel="noreferrer"
											className="break-all text-[#00ff87] hover:text-white"
										>
											open checkout
										</a>
										{controlResult.checkout.sessionId ? <p>session: {controlResult.checkout.sessionId}</p> : null}
									</div>
								) : null}
							</div>
						) : (
							<p className="mt-3 text-xs text-neutral-500">run provision first, then pause, resume, or top up.</p>
						)}
					</Panel>
					<Panel>
						<Label>token chat</Label>
						<div className="mt-3 grid gap-2">
							<label className="grid gap-1">
								<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">steward bearer</span>
								<input
									type="password"
									value={stewardBearer}
									onChange={(event) => setStewardBearer(event.target.value)}
									className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-red-400"
								/>
							</label>
							<label className="grid gap-1">
								<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">expected role</span>
								<select
									value={expectedRole}
									onChange={(event) => setExpectedRole(event.target.value as "admin" | "user" | "guest" | "")}
									className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-red-400"
								>
									<option value="">any</option>
									<option value="admin">admin</option>
									<option value="user">user</option>
									<option value="guest">guest</option>
								</select>
							</label>
							<button
								type="button"
								onClick={runChatSession}
								disabled={chatSession.isPending || !stewardBearer || !form.tokenContractAddress}
								className="inline-flex items-center justify-center gap-2 rounded-sm border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-neutral-200 hover:border-white/20 disabled:opacity-40"
							>
								{chatSession.isPending ? (
									<LoaderCircle className="size-3 animate-spin" />
								) : (
									<MessageCircle className="size-3" />
								)}
								test chat
							</button>
						</div>
						{chatSession.error ? (
							<p className="mt-3 text-xs text-red-300">{(chatSession.error as Error).message}</p>
						) : chatSession.data ? (
							<div className="mt-3 space-y-2 text-xs font-mono text-neutral-400">
								<p>
									role: {chatSession.data.role ?? "unknown"}
									{expectedRole && chatSession.data.role !== expectedRole ? " · mismatch" : ""}
								</p>
								{chatSession.data.expiresInSeconds ? <p>expires: {chatSession.data.expiresInSeconds}s</p> : null}
								{chatSession.data.chatUrl ? (
									<>
										<a
											href={chatSession.data.chatUrl}
											target="_blank"
											rel="noreferrer"
											className="block break-all text-[#00ff87] hover:text-white"
										>
											open hosted chat
										</a>
										<button
											type="button"
											disabled={hostedChatApi.isPending}
											onClick={runHostedChatApi}
											className="inline-flex items-center gap-1 rounded-sm border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-200 hover:border-white/20 disabled:opacity-40"
										>
											{hostedChatApi.isPending ? (
												<LoaderCircle className="size-3 animate-spin" />
											) : (
												<MessageCircle className="size-3" />
											)}
											verify hosted api
										</button>
									</>
								) : null}
								{hostedChatApi.error ? (
									<p className="text-red-300">{(hostedChatApi.error as Error).message}</p>
								) : hostedChatApi.data ? (
									<Row label="hosted api" value={`${hostedChatApi.data.status} ${hostedChatApi.data.url}`} />
								) : null}
							</div>
						) : (
							<p className="mt-3 text-xs text-neutral-500">use a holder or creator Steward bearer to verify role.</p>
						)}
					</Panel>
					<Panel>
						<Label>owner runtime</Label>
						<div className="mt-3 grid gap-2">
							<label className="grid gap-1">
								<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">owner bearer</span>
								<input
									type="password"
									value={ownerBearer}
									onChange={(event) => setOwnerBearer(event.target.value)}
									className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-red-400"
								/>
							</label>
							<label className="grid gap-1">
								<span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">action</span>
								<select
									value={ownerRuntimeAction}
									onChange={(event) =>
										setOwnerRuntimeAction(event.target.value as "status" | "resume" | "restart" | "suspend")
									}
									className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-red-400"
								>
									<option value="status">status</option>
									<option value="resume">resume</option>
									<option value="restart">restart</option>
									<option value="suspend">suspend</option>
								</select>
							</label>
							<div className="grid grid-cols-2 gap-2">
								<ControlButton
									label="test"
									disabled={ownerRuntimeTest.isPending || !ownerBearer || !form.agentId}
									icon={
										ownerRuntimeTest.isPending ? (
											<LoaderCircle className="size-3 animate-spin" />
										) : (
											<RefreshCw className="size-3" />
										)
									}
									onClick={runOwnerRuntimeTest}
								/>
								<ControlButton
									label="control"
									disabled={ownerRuntimeControl.isPending || !ownerBearer || !form.agentId}
									icon={
										ownerRuntimeControl.isPending ? (
											<LoaderCircle className="size-3 animate-spin" />
										) : (
											<PlayCircle className="size-3" />
										)
									}
									onClick={runOwnerRuntimeControl}
								/>
							</div>
						</div>
						{ownerRuntimeTest.error || ownerRuntimeControl.error ? (
							<p className="mt-3 text-xs text-red-300">
								{((ownerRuntimeTest.error ?? ownerRuntimeControl.error) as Error).message}
							</p>
						) : ownerRuntimeTest.data || ownerRuntimeControl.data ? (
							<div className="mt-3 space-y-2 text-xs font-mono text-neutral-400">
								{ownerRuntimeTest.data ? (
									<>
										<p>
											test: {ownerRuntimeTest.data.running ? "running" : "not running"} ·{" "}
											{ownerRuntimeTest.data.hasWebUiUrl ? "web ui ok" : "no web ui"}
										</p>
										<Row label="cloud agent" value={ownerRuntimeTest.data.cloudAgentId ?? "unknown"} />
										<Row label="url" value={ownerRuntimeTest.data.webUiUrl ?? "pending"} />
									</>
								) : null}
								{ownerRuntimeControl.data ? (
									<>
										<p>control: {ownerRuntimeControl.data.action ?? ownerRuntimeAction}</p>
										<Row label="cloud agent" value={ownerRuntimeControl.data.cloudAgentId ?? "unknown"} />
										<Row label="status" value={ownerRuntimeControl.data.status?.status ?? "unknown"} />
									</>
								) : null}
							</div>
						) : (
							<p className="mt-3 text-xs text-neutral-500">
								use the creator Steward bearer to verify owner runtime access.
							</p>
						)}
					</Panel>
					<Panel noPad>
						<pre className="overflow-x-auto p-3 text-[10px] text-neutral-400">{payloadPreview}</pre>
					</Panel>
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

function formatEnvVars(value: Record<string, string> | undefined): string {
	if (!value) return "";
	return Object.entries(value)
		.map(([key, envValue]) => `${key}=${envValue}`)
		.join("\n");
}

function parseEnvVars(value: string): Record<string, string> | undefined {
	const entries = value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const index = line.indexOf("=");
			if (index <= 0) return null;
			const key = line.slice(0, index).trim();
			const envValue = line.slice(index + 1).trim();
			return key ? [key, envValue] : null;
		})
		.filter((entry): entry is [string, string] => Array.isArray(entry));
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function proofTone(state: ProofStepState): string {
	if (state === "passed") return "text-[#00ff87]";
	if (state === "failed") return "text-red-300";
	if (state === "running") return "text-amber-300";
	if (state === "skipped") return "text-neutral-500";
	return "text-neutral-600";
}

function proofLabel(key: string): string {
	if (key === "agent.bonded") return "agent.bonded";
	if (key === "runtime-status") return "runtime status";
	if (key === "webhook-depleted") return "credits depleted";
	if (key === "webhook-topped-up") return "credits topped";
	return key.replaceAll("-", " ");
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1">
			<dt className="text-[10px] uppercase tracking-wider text-neutral-600">{label}</dt>
			<dd className="break-all text-neutral-200">{value}</dd>
		</div>
	);
}
