/**
 * persona-pix mini app — waifu api side service skeleton
 *
 * SCAFFOLD ONLY. real impl plugs into `apps/api/src/routes/v2/agents.ts` as
 * additional route handlers on the existing `app` instance.
 *
 * design doc: ~/.moltbot/projects/waifu/TRACK-C-MINIAPP-DESIGN-2026-05-25.md
 *
 * responsibilities:
 *   1. validate user auth (privy bearer)
 *   2. resolve agent_apps row by (token, slug) and pull eliza_cloud_app_id
 *   3. forward run requests to eliza cloud
 *   4. persist agent_app_runs + agent_events
 *   5. return image url + cost breakdown
 */

// ---------- types ----------

export type RunRequest = {
	prompt: string;
	style?: "seedream-4.5" | "flux-2-pro";
	aspect?: "1:1" | "3:4" | "4:3" | "16:9" | "9:16";
	nsfw?: boolean;
};

export type RunSuccess = {
	ok: true;
	data: {
		runId: string;
		imageUrl: string;
		cost: {
			baseCost: number;
			creatorMarkup: number;
			totalCost: number;
			currency: "credits";
		};
		balanceAfter: number;
		agentEventId: string;
	};
};

export type RunFailure =
	| {
			ok: false;
			error: "insufficient_app_credits";
			data: { required: number; balance: number; topUpUrl: string };
	  }
	| { ok: false; error: "invalid_input"; data: { details: unknown } }
	| { ok: false; error: "provider_failed"; data: { reason: string } }
	| { ok: false; error: "app_not_found"; data: Record<string, never> };

export type RunResponse = RunSuccess | RunFailure;

export type AgentAppRunRow = {
	id: string;
	agentTokenAddress: string;
	appSlug: string;
	userId: string;
	status: "pending" | "success" | "failed" | "refunded";
	baseCostUsd: number | null;
	totalCostUsd: number | null;
	creatorEarningsUsd: number | null;
	prompt: unknown;
	output: { imageUrl?: string; model?: string; latencyMs?: number } | null;
	error: string | null;
	elizaCloudDeductionId: string | null;
	createdAt: string;
	completedAt: string | null;
};

// ---------- public api (skeleton) ----------

export type RunHandlerDeps = {
	resolveApp: (
		tokenAddress: string,
		slug: string,
	) => Promise<{ elizaCloudAppId: string; pricing: { perCallUsdEstimate: number } } | null>;
	requireUser: (request: Request) => Promise<{ id: string; privyToken: string }>;
	callElizaCloud: (params: {
		elizaCloudAppId: string;
		userPrivyToken: string;
		body: unknown;
	}) => Promise<{
		imageUrl: string;
		baseCost: number;
		creatorMarkup: number;
		totalCost: number;
		balanceAfter: number;
		deductionId: string;
	}>;
	writeRun: (row: Omit<AgentAppRunRow, "id" | "createdAt">) => Promise<AgentAppRunRow>;
	emitAgentEvent: (params: {
		agentTokenAddress: string;
		appSlug: string;
		runId: string;
		userId: string;
		costUsd: number;
		status: "success" | "failed";
	}) => Promise<{ eventId: string }>;
};

export async function handleRun(
	request: Request,
	tokenAddress: string,
	slug: string,
	body: RunRequest,
	deps: RunHandlerDeps,
): Promise<RunResponse> {
	// TODO: implement. this skeleton just documents the order of operations.
	//
	//  1. const user = await deps.requireUser(request)
	//  2. const app = await deps.resolveApp(tokenAddress, slug)
	//     if (!app) return { ok: false, error: "app_not_found", data: {} }
	//  3. validate body
	//  4. const result = await deps.callElizaCloud({ ... })
	//     handle 402 → return insufficient_app_credits
	//     handle 5xx → return provider_failed
	//  5. const run = await deps.writeRun({ status: "success", ... })
	//  6. const evt = await deps.emitAgentEvent({ ... })
	//  7. return success shape with run.id and evt.eventId

	throw new Error("persona-pix handleRun not implemented yet — see design doc");
}

// ---------- credit display proxy (optional) ----------

// the frontend calls eliza cloud directly for the balance endpoint, so we
// don't need a proxy in v1. ship a stub for the future case where eliza cloud
// tightens cors and we have to hop through the waifu api.

export async function proxyBalance(
	_request: Request,
	_elizaCloudAppId: string,
): Promise<{ balance: number; isLow: boolean }> {
	throw new Error("proxyBalance not used in v1; call eliza cloud directly from the browser");
}
