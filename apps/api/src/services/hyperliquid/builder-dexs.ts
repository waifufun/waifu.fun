const HL_BASE_URL = "https://api.hyperliquid.xyz";

export type HlPosition = {
	coin?: string;
	szi?: string | number;
	entryPx?: string | number;
	unrealizedPnl?: string | number;
	liquidationPx?: string | number | null;
	leverage?: { value?: string | number; type?: string } | string | number;
	positionValue?: string | number;
	returnOnEquity?: string | number;
	marginUsed?: string | number;
};

export type HlClearinghouseState = {
	marginSummary?: { accountValue?: string | number };
	crossMarginSummary?: { accountValue?: string | number };
	withdrawable?: string | number;
	assetPositions?: Array<{ position?: HlPosition }>;
	time?: number;
};

export type HlDexState = {
	dex: string;
	state: HlClearinghouseState;
};

export type HlMergedPosition = {
	position?: HlPosition;
	dex?: string;
	builderPerp?: boolean;
};

export type FetchAllHlStateOptions = {
	baseUrl?: string;
	builderDexs?: string[];
};

function num(value: unknown, fallback = 0): number {
	if (value === null || value === undefined || value === "") return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function accountValueOf(state: HlClearinghouseState | null | undefined): number {
	return num(state?.marginSummary?.accountValue) || num(state?.crossMarginSummary?.accountValue) || 0;
}

export function withdrawableOf(state: HlClearinghouseState | null | undefined): number {
	return num(state?.withdrawable);
}

export function unrealizedPnlOf(state: HlClearinghouseState | null | undefined): number {
	return (state?.assetPositions ?? []).reduce((sum, ap) => sum + num(ap?.position?.unrealizedPnl), 0);
}

export function configuredBuilderDexs(envValue = process.env.HL_BUILDER_DEXS): string[] {
	if (envValue !== undefined) {
		return envValue
			.split(",")
			.map((dex) => dex.trim())
			.filter((dex, index, all) => dex.length > 0 && all.indexOf(dex) === index);
	}
	return ["xyz"];
}

async function postInfo<T>(body: unknown, fetchImpl: typeof fetch, baseUrl: string): Promise<T | null> {
	const res = await fetchImpl(`${baseUrl}/info`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) return null;
	return (await res.json()) as T;
}

export async function fetchAllHlState(
	wallet: string,
	fetchImpl: typeof fetch = fetch,
	options: FetchAllHlStateOptions = {},
): Promise<{
	core: HlClearinghouseState | null;
	builderDexs: HlDexState[];
	mergedPositions: HlMergedPosition[];
	totalAccountValue: number;
	totalUnrealizedPnl: number;
	totalWithdrawable: number;
}> {
	const baseUrl = options.baseUrl ?? HL_BASE_URL;
	const builderDexs = options.builderDexs ?? configuredBuilderDexs();

	const core = await postInfo<HlClearinghouseState>(
		{ type: "clearinghouseState", user: wallet },
		fetchImpl,
		baseUrl,
	).catch((err) => {
		console.warn("[hyperliquid] failed to fetch core clearinghouseState", {
			wallet,
			error: err instanceof Error ? err.message : String(err),
		});
		return null;
	});

	const builderStates = await Promise.all(
		builderDexs.map(async (dex): Promise<HlDexState | null> => {
			try {
				const state = await postInfo<HlClearinghouseState>(
					{ type: "clearinghouseState", user: wallet, dex },
					fetchImpl,
					baseUrl,
				);
				if (!state) {
					console.warn("[hyperliquid] failed to fetch builder dex clearinghouseState", {
						wallet,
						dex,
						error: "empty-or-non-ok-response",
					});
					return null;
				}
				return { dex, state };
			} catch (err) {
				console.warn("[hyperliquid] failed to fetch builder dex clearinghouseState", {
					wallet,
					dex,
					error: err instanceof Error ? err.message : String(err),
				});
				return null;
			}
		}),
	);

	const builderDexStates = builderStates.filter((entry): entry is HlDexState => entry !== null);
	const mergedPositions: HlMergedPosition[] = [
		...(core?.assetPositions ?? []).map((entry) => ({ ...entry, builderPerp: false })),
		...builderDexStates.flatMap(({ dex, state }) =>
			(state.assetPositions ?? []).map((entry) => ({ ...entry, dex, builderPerp: true })),
		),
	];
	const allStates = [core, ...builderDexStates.map(({ state }) => state)];

	return {
		core,
		builderDexs: builderDexStates,
		mergedPositions,
		totalAccountValue: allStates.reduce((sum, state) => sum + accountValueOf(state), 0),
		totalUnrealizedPnl: allStates.reduce((sum, state) => sum + unrealizedPnlOf(state), 0),
		totalWithdrawable: allStates.reduce((sum, state) => sum + withdrawableOf(state), 0),
	};
}
