import type { AddressLike, IToken, TChain, TChainId } from "@waifufun/types";
import DB from "@waifufun/database";
import {
	getControlPlaneServerClient,
	getTokenOwnership,
	getTokenRuntimeState,
	upsertTokenOwnership,
	upsertTokenRuntimeState,
	upsertWalletIdentity,
	type ControlPlaneAgentStatus,
	type ControlPlaneBillingMode,
	type ControlPlaneChain,
	type ControlPlaneLifecycleState,
	type ControlPlaneRow,
	type Json,
} from "@waifufun/control-plane";
import { PublicKey } from "@solana/web3.js";
import { getAddress as getEvmAddress, isAddress as isEvmAddress } from "viem";

type AuthUser = {
	evm?: AddressLike;
	solana?: AddressLike;
};

export type OwnerWalletMap = {
	evm: string[];
	solana: string[];
};

export type OwnerRuntimeRecord = {
	mint: string;
	chain: TChain;
	chainId: number;
	ownershipId: string;
	runtimeStateId: string | null;
	ownerWalletEvm: string | null;
	ownerWalletSolana: string | null;
	ownerWallets: OwnerWalletMap;
	claimStatus: string;
	claimedAt: string | null;
	creatorWallet: string | null;
	ownerWallet: string | null;
	creatorWalletIdentityId: string | null;
	ownerWalletIdentityId: string | null;
	cloudAgentId: string | null;
	runtimeStatus: string;
	lifecycleState: string | null;
	billingMode: string | null;
	infraReserveUsd: number | null;
	characterConfig: Record<string, unknown> | null;
	webUiUrl: string | null;
	bridgeUrl: string | null;
	lastHeartbeatAt: string | null;
	suspendedReason: string | null;
	lastClaimedAt: string | null;
	runtimeMetadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
};

export type TokenRuntimeContext = {
	token: IToken<TChain>;
	runtime: OwnerRuntimeRecord;
	matchedWallet: string | null;
	authWallets: string[];
};

type RuntimeLookup = {
	mint: string;
	chain: TChain;
	chainId: TChainId | number;
};

type RuntimeUpsertInput = RuntimeLookup & {
	claimStatus?: string;
	claimedAt?: Date | string | null;
	creatorWallet?: string | null;
	ownerWallet?: string | null;
	cloudAgentId?: string | null;
	runtimeStatus?: string;
	lifecycleState?: string | null;
	billingMode?: string | null;
	infraReserveUsd?: number | null;
	characterConfig?: Record<string, unknown> | null;
	webUiUrl?: string | null;
	bridgeUrl?: string | null;
	lastHeartbeatAt?: Date | string | null;
	suspendedReason?: string | null;
	lastClaimedAt?: Date | string | null;
	runtimeMetadata?: Record<string, unknown> | null;
};

type NormalizedAuthWallet = {
	chain: ControlPlaneChain;
	address: string;
	normalizedAddress: string;
};

type OwnershipRow = ControlPlaneRow<"control_plane_token_ownerships">;
type RuntimeStateRow = ControlPlaneRow<"control_plane_token_runtime_states">;
type WalletIdentityRow = ControlPlaneRow<"control_plane_wallet_identities">;

type ControlPlaneSnapshot = {
	ownership: OwnershipRow;
	runtimeState: RuntimeStateRow | null;
	creatorWalletIdentity: WalletIdentityRow | null;
	ownerWalletIdentity: WalletIdentityRow | null;
};

const DEFAULT_SECONDARY_CHAIN_IDS: Record<ControlPlaneChain, number> = {
	evm: 8453,
	solana: 101,
};

const AGENT_STATUS_TO_LIFECYCLE_STATE: Partial<Record<ControlPlaneAgentStatus, ControlPlaneLifecycleState | null>> = {
	none: null,
	provisioning: "birth",
	running: "live",
	suspended: "dormant",
	deleted: "dormant",
};

function hasOwnProperty<T extends object>(value: T, key: keyof T): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeEvmAddress(address: string): string | null {
	if (!isEvmAddress(address)) {
		return null;
	}

	const checksummedAddress = getEvmAddress(address);
	return checksummedAddress;
}

function normalizeSolanaAddress(address: string): string | null {
	try {
		return new PublicKey(address).toBase58();
	} catch {
		return null;
	}
}

function normalizeWallet(address?: AddressLike | string | null): string | null {
	if (!address || typeof address !== "string") {
		return null;
	}

	return normalizeEvmAddress(address) || normalizeSolanaAddress(address);
}

function walletsMatch(left?: string | null, right?: string | null): boolean {
	const normalizedLeft = normalizeWallet(left);
	const normalizedRight = normalizeWallet(right);
	return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function detectWalletChain(address?: string | null): ControlPlaneChain | null {
	if (!address) {
		return null;
	}

	if (normalizeEvmAddress(address)) {
		return "evm";
	}

	if (normalizeSolanaAddress(address)) {
		return "solana";
	}

	return null;
}

function normalizeAuthWallets(authUser?: AuthUser): NormalizedAuthWallet[] {
	const normalizedWallets: NormalizedAuthWallet[] = [];

	if (authUser?.evm) {
		const address = normalizeEvmAddress(authUser.evm);
		if (address) {
			normalizedWallets.push({
				chain: "evm",
				address,
				normalizedAddress: address.toLowerCase(),
			});
		}
	}

	if (authUser?.solana) {
		const address = normalizeSolanaAddress(authUser.solana);
		if (address) {
			normalizedWallets.push({
				chain: "solana",
				address,
				normalizedAddress: address,
			});
		}
	}

	return normalizedWallets;
}

function collectAuthWallets(authUser?: AuthUser): string[] {
	return Array.from(new Set(normalizeAuthWallets(authUser).map((wallet) => wallet.address)));
}

function isJsonRecord(value: Json | null | undefined): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getCharacterConfig(runtimeMetadata: Record<string, unknown>): Record<string, unknown> | null {
	const value = runtimeMetadata.characterConfig;
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getLastClaimedAt(runtimeMetadata: Record<string, unknown>): string | null {
	return typeof runtimeMetadata.lastClaimedAt === "string" ? runtimeMetadata.lastClaimedAt : null;
}

function toIsoString(value: Date | string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	return value;
}

function resolveLifecycleState(
	requestedLifecycleState: string | null | undefined,
	runtimeStatus: ControlPlaneAgentStatus,
	existingLifecycleState: ControlPlaneLifecycleState | null,
): ControlPlaneLifecycleState | null {
	if (
		requestedLifecycleState === "birth" ||
		requestedLifecycleState === "live" ||
		requestedLifecycleState === "dormant" ||
		requestedLifecycleState === "reviving"
	) {
		return requestedLifecycleState;
	}

	const mappedLifecycleState = AGENT_STATUS_TO_LIFECYCLE_STATE[runtimeStatus];
	if (mappedLifecycleState !== undefined) {
		return mappedLifecycleState;
	}

	return existingLifecycleState;
}

function uniqueLookups(lookups: RuntimeLookup[]): RuntimeLookup[] {
	const deduped = new Map<string, RuntimeLookup>();

	for (const lookup of lookups) {
		deduped.set(`${lookup.chain}:${Number(lookup.chainId)}:${lookup.mint}`, {
			mint: lookup.mint,
			chain: lookup.chain,
			chainId: Number(lookup.chainId),
		});
	}

	return Array.from(deduped.values());
}

function ownershipToWalletMap(
	creatorWalletIdentity: WalletIdentityRow | null,
	ownerWalletIdentity: WalletIdentityRow | null,
): OwnerWalletMap {
	const wallets: OwnerWalletMap = {
		evm: [],
		solana: [],
	};

	for (const walletIdentity of [creatorWalletIdentity, ownerWalletIdentity]) {
		if (!walletIdentity) {
			continue;
		}

		if (walletIdentity.chain === "evm") {
			if (!wallets.evm.includes(walletIdentity.address)) {
				wallets.evm.push(walletIdentity.address);
			}
			continue;
		}

		if (!wallets.solana.includes(walletIdentity.address)) {
			wallets.solana.push(walletIdentity.address);
		}
	}

	return wallets;
}

function mapSnapshotToRuntimeRecord(snapshot: ControlPlaneSnapshot): OwnerRuntimeRecord {
	const runtimeMetadata = isJsonRecord(snapshot.runtimeState?.runtime_metadata) ? snapshot.runtimeState.runtime_metadata : {};
	const ownerWallets = ownershipToWalletMap(snapshot.creatorWalletIdentity, snapshot.ownerWalletIdentity);

	return {
		mint: snapshot.ownership.contract_address,
		chain: snapshot.ownership.token_chain,
		chainId: snapshot.ownership.token_chain_id,
		ownershipId: snapshot.ownership.id,
		runtimeStateId: snapshot.runtimeState?.id || null,
		ownerWalletEvm: ownerWallets.evm[0] || null,
		ownerWalletSolana: ownerWallets.solana[0] || null,
		ownerWallets,
		claimStatus: snapshot.ownership.owner_claim_status,
		claimedAt: snapshot.ownership.claimed_at,
		creatorWallet: snapshot.creatorWalletIdentity?.address || null,
		ownerWallet: snapshot.ownerWalletIdentity?.address || null,
		creatorWalletIdentityId: snapshot.ownership.creator_wallet_identity_id,
		ownerWalletIdentityId: snapshot.ownership.owner_wallet_identity_id,
		cloudAgentId: snapshot.runtimeState?.cloud_agent_id || null,
		runtimeStatus: snapshot.runtimeState?.agent_status || "none",
		lifecycleState: snapshot.runtimeState?.lifecycle_state || null,
		billingMode: snapshot.runtimeState?.billing_mode || null,
		infraReserveUsd: snapshot.runtimeState?.infra_reserve_usd ? Number(snapshot.runtimeState.infra_reserve_usd) : null,
		characterConfig: getCharacterConfig(runtimeMetadata),
		webUiUrl: snapshot.runtimeState?.web_ui_url || null,
		bridgeUrl: snapshot.runtimeState?.bridge_url || null,
		lastHeartbeatAt: snapshot.runtimeState?.last_heartbeat_at || null,
		suspendedReason: snapshot.runtimeState?.status_reason || null,
		lastClaimedAt: getLastClaimedAt(runtimeMetadata),
		runtimeMetadata,
		createdAt: snapshot.runtimeState?.created_at || snapshot.ownership.created_at,
		updatedAt: snapshot.runtimeState?.updated_at || snapshot.ownership.updated_at,
	};
}

function toWalletIdentityUpsertInput(walletIdentity: WalletIdentityRow) {
	return {
		chain: walletIdentity.chain,
		chainId: walletIdentity.chain_id,
		address: walletIdentity.address,
		userId: walletIdentity.user_id,
		label: walletIdentity.label,
		linkSource: walletIdentity.link_source,
		verifiedAt: walletIdentity.verified_at,
		lastSeenAt: walletIdentity.last_seen_at,
		metadata: walletIdentity.metadata,
	};
}

function getClient() {
	return getControlPlaneServerClient();
}

async function getTokenByLookup(lookup: RuntimeLookup): Promise<IToken<TChain> | null> {
	return await DB.Token.findOne({
		contractAddress: lookup.mint,
		chain: lookup.chain,
		chainId: Number(lookup.chainId),
	}).lean();
}

async function findWalletIdentityByNormalizedAddress(wallet: NormalizedAuthWallet): Promise<WalletIdentityRow | null> {
	const client = getClient();
	const { data, error } = await client
		.from("control_plane_wallet_identities")
		.select("*")
		.eq("chain", wallet.chain)
		.eq("normalized_address", wallet.normalizedAddress)
		.order("updated_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to fetch wallet identity for ${wallet.chain}:${wallet.address}: ${error.message}`);
	}

	return data;
}

async function listWalletIdentitiesByIds(ids: string[]): Promise<Map<string, WalletIdentityRow>> {
	if (ids.length === 0) {
		return new Map();
	}

	const client = getClient();
	const { data, error } = await client.from("control_plane_wallet_identities").select("*").in("id", ids);
	if (error) {
		throw new Error(`Failed to fetch wallet identities: ${error.message}`);
	}

	return new Map((data || []).map((walletIdentity) => [walletIdentity.id, walletIdentity]));
}

async function seedOwnershipFromMongoToken(token: IToken<TChain>): Promise<OwnershipRow> {
	const client = getClient();
	return await upsertTokenOwnership(
		{
			chain: token.chain,
			chainId: Number(token.chainId),
			contractAddress: String(token.contractAddress),
			launchType: token.imported ? "imported" : "native",
			ownerClaimStatus: "unclaimed",
			ownershipSource: "mongo_token.creator",
			ownershipMetadata: {
				seededFrom: "mongo_token.creator",
				mongoCreator: token.creator ? String(token.creator) : null,
			},
			creatorWallet: token.creator
				? {
					chain: token.chain,
					chainId: Number(token.chainId),
					address: String(token.creator),
					linkSource: "import",
					verifiedAt: toIsoString(token.createdAt),
					metadata: {
						seededFrom: "mongo_token.creator",
					},
				}
				: null,
		},
		client,
	);
}

async function ensureWalletIdentityForAuthWallet(
	wallet: NormalizedAuthWallet,
	preferredChainId?: number,
	linkSource: "self_claim" | "manual" | "import" = "self_claim",
): Promise<WalletIdentityRow> {
	const existing = await findWalletIdentityByNormalizedAddress(wallet);
	const chainId = existing?.chain_id || preferredChainId || DEFAULT_SECONDARY_CHAIN_IDS[wallet.chain];

	return await upsertWalletIdentity(
		{
			chain: wallet.chain,
			chainId,
			address: wallet.address,
			userId: existing?.user_id,
			label: existing?.label,
			linkSource: existing?.link_source || linkSource,
			verifiedAt: existing?.verified_at || new Date().toISOString(),
			lastSeenAt: new Date().toISOString(),
			metadata: isJsonRecord(existing?.metadata)
				? {
					...existing.metadata,
					lastSeenFrom: "owner-runtime-control-plane",
				}
				: {
					lastSeenFrom: "owner-runtime-control-plane",
				},
		},
		getClient(),
	);
}

async function buildWalletIdentityUpsertInputFromAddress(address: string, preferredChainId?: number) {
	const chain = detectWalletChain(address);
	if (!chain) {
		throw new Error(`Invalid wallet address: ${address}`);
	}

	const normalizedWallet: NormalizedAuthWallet = {
		chain,
		address: normalizeWallet(address)!,
		normalizedAddress: chain === "evm" ? normalizeWallet(address)!.toLowerCase() : normalizeWallet(address)!,
	};
	const walletIdentity = await ensureWalletIdentityForAuthWallet(
		normalizedWallet,
		preferredChainId || DEFAULT_SECONDARY_CHAIN_IDS[chain],
		"manual",
	);

	return toWalletIdentityUpsertInput(walletIdentity);
}

async function ensureRuntimeStateForToken(token: IToken<TChain>): Promise<RuntimeStateRow> {
	const client = getClient();
	const existingRuntime = await getTokenRuntimeState(
		{
			chain: token.chain,
			chainId: Number(token.chainId),
			contractAddress: String(token.contractAddress),
		},
		client,
	);

	if (existingRuntime) {
		return existingRuntime;
	}

	return await upsertTokenRuntimeState(
		{
			chain: token.chain,
			chainId: Number(token.chainId),
			contractAddress: String(token.contractAddress),
			runtimeProvider: "milady-cloud",
			agentStatus: "none",
			runtimeMetadata: {
				seededFrom: "mongo_token.creator",
			},
		},
		client,
	);
}

async function ensureControlPlaneSnapshot(token: IToken<TChain>): Promise<ControlPlaneSnapshot> {
	const client = getClient();
	let ownership = await getTokenOwnership(
		{
			chain: token.chain,
			chainId: Number(token.chainId),
			contractAddress: String(token.contractAddress),
		},
		client,
	);

	if (!ownership) {
		ownership = await seedOwnershipFromMongoToken(token);
	}

	const runtimeState = await ensureRuntimeStateForToken(token);
	const walletIdentityMap = await listWalletIdentitiesByIds(
		[ownership.creator_wallet_identity_id, ownership.owner_wallet_identity_id].filter((value): value is string => Boolean(value)),
	);

	return {
		ownership,
		runtimeState,
		creatorWalletIdentity: ownership.creator_wallet_identity_id
			? (walletIdentityMap.get(ownership.creator_wallet_identity_id) ?? null)
			: null,
		ownerWalletIdentity: ownership.owner_wallet_identity_id
			? (walletIdentityMap.get(ownership.owner_wallet_identity_id) ?? null)
			: null,
	};
}

async function seedLegacyCreatorRuntimeRecords(authUser?: AuthUser): Promise<RuntimeLookup[]> {
	const authWallets = collectAuthWallets(authUser);
	if (authWallets.length === 0) {
		return [];
	}

	const legacyCreatorCandidates = Array.from(
		new Set(
			authWallets.flatMap((wallet) => {
				const normalizedEvmWallet = normalizeEvmAddress(wallet);
				if (normalizedEvmWallet) {
					return [normalizedEvmWallet, normalizedEvmWallet.toLowerCase()];
				}

				return [wallet];
			}),
		),
	);

	const legacyCreatorTokens = await DB.Token.find({
		creator: { $in: legacyCreatorCandidates },
	})
		.select("contractAddress chain chainId creator imported createdAt")
		.lean();

	for (const token of legacyCreatorTokens) {
		await ensureControlPlaneSnapshot(token as IToken<TChain>);
	}

	return legacyCreatorTokens.map((token) => ({
		mint: String(token.contractAddress),
		chain: token.chain,
		chainId: Number(token.chainId),
	}));
}

function getMatchedWallet(authWallets: string[], snapshot: ControlPlaneSnapshot): string | null {
	const ownedWallets = [snapshot.creatorWalletIdentity?.address, snapshot.ownerWalletIdentity?.address].filter(
		(wallet): wallet is string => Boolean(wallet),
	);

	return authWallets.find((wallet) => ownedWallets.some((ownedWallet) => walletsMatch(wallet, ownedWallet))) || null;
}

export async function getTokenRuntimeContext(lookup: RuntimeLookup, authUser?: AuthUser): Promise<TokenRuntimeContext | null> {
	const token = await getTokenByLookup(lookup);
	if (!token) {
		return null;
	}

	const snapshot = await ensureControlPlaneSnapshot(token);
	const authWallets = collectAuthWallets(authUser);
	const matchedWallet = getMatchedWallet(authWallets, snapshot);

	return {
		token,
		runtime: mapSnapshotToRuntimeRecord(snapshot),
		matchedWallet,
		authWallets,
	};
}

export async function requireOwnedTokenRuntimeContext(
	lookup: RuntimeLookup,
	authUser?: AuthUser,
): Promise<TokenRuntimeContext | null> {
	const context = await getTokenRuntimeContext(lookup, authUser);
	if (!context?.matchedWallet) {
		return null;
	}

	return context;
}

export async function upsertRuntimeRecord(input: RuntimeUpsertInput): Promise<OwnerRuntimeRecord> {
	const token = await getTokenByLookup(input);
	if (!token) {
		throw new Error("Token not found");
	}

	const snapshot = await ensureControlPlaneSnapshot(token);
	const existingRuntimeMetadata = isJsonRecord(snapshot.runtimeState?.runtime_metadata) ? snapshot.runtimeState.runtime_metadata : {};
	const mergedRuntimeMetadata: Record<string, unknown> = {
		...existingRuntimeMetadata,
		...(input.runtimeMetadata || {}),
	};

	if (hasOwnProperty(input, "characterConfig")) {
		mergedRuntimeMetadata.characterConfig = input.characterConfig ?? null;
	}

	if (hasOwnProperty(input, "lastClaimedAt")) {
		mergedRuntimeMetadata.lastClaimedAt = toIsoString(input.lastClaimedAt);
	}

	const existingRuntime = snapshot.runtimeState;
	const existingOwnershipMetadata = isJsonRecord(snapshot.ownership.ownership_metadata)
		? snapshot.ownership.ownership_metadata
		: {};
	const creatorWalletInput = hasOwnProperty(input, "creatorWallet")
		? input.creatorWallet
			? await buildWalletIdentityUpsertInputFromAddress(input.creatorWallet, Number(token.chainId))
			: null
		: snapshot.creatorWalletIdentity
			? toWalletIdentityUpsertInput(snapshot.creatorWalletIdentity)
			: token.creator
				? {
					chain: token.chain,
					chainId: Number(token.chainId),
					address: String(token.creator),
					linkSource: "import",
					verifiedAt: toIsoString(token.createdAt),
					metadata: {
						seededFrom: "mongo_token.creator",
					},
				}
				: null;
	const ownerWalletInput = hasOwnProperty(input, "ownerWallet")
		? input.ownerWallet
			? await buildWalletIdentityUpsertInputFromAddress(input.ownerWallet)
			: undefined
		: snapshot.ownerWalletIdentity
			? toWalletIdentityUpsertInput(snapshot.ownerWalletIdentity)
			: undefined;

	if (
		hasOwnProperty(input, "claimStatus") ||
		hasOwnProperty(input, "claimedAt") ||
		hasOwnProperty(input, "creatorWallet") ||
		hasOwnProperty(input, "ownerWallet")
	) {
		await upsertTokenOwnership(
			{
				chain: input.chain,
				chainId: Number(input.chainId),
				contractAddress: input.mint,
				launchType: token.imported ? "imported" : "native",
				ownerClaimStatus: hasOwnProperty(input, "claimStatus")
					? (input.claimStatus as OwnershipRow["owner_claim_status"])
					: snapshot.ownership.owner_claim_status,
				claimedAt: hasOwnProperty(input, "claimedAt")
					? toIsoString(input.claimedAt)
					: snapshot.ownership.claimed_at,
				ownershipSource: snapshot.ownership.ownership_source,
				ownershipMetadata: existingOwnershipMetadata,
				creatorWallet: creatorWalletInput,
				ownerWallet: ownerWalletInput,
			},
			getClient(),
		);
		}

	const runtimeStatus = (hasOwnProperty(input, "runtimeStatus")
		? input.runtimeStatus || "none"
		: existingRuntime?.agent_status || "none") as ControlPlaneAgentStatus;
	const lifecycleState = resolveLifecycleState(
		hasOwnProperty(input, "lifecycleState") ? input.lifecycleState || null : undefined,
		runtimeStatus,
		existingRuntime?.lifecycle_state || null,
	);
	const billingMode = (hasOwnProperty(input, "billingMode")
		? input.billingMode || null
		: existingRuntime?.billing_mode || null) as ControlPlaneBillingMode | null;
	const statusReason = hasOwnProperty(input, "suspendedReason")
		? input.suspendedReason || null
		: existingRuntime?.status_reason || null;

	const runtimeStatusWasExplicitlyUpdated = hasOwnProperty(input, "runtimeStatus");

	await upsertTokenRuntimeState(
		{
			chain: input.chain,
			chainId: Number(input.chainId),
			contractAddress: input.mint,
			runtimeProvider: existingRuntime?.runtime_provider || "milady-cloud",
			cloudAgentId: hasOwnProperty(input, "cloudAgentId") ? input.cloudAgentId || null : existingRuntime?.cloud_agent_id || null,
			agentStatus: runtimeStatus,
			lifecycleState,
			billingMode,
			infraReserveUsd: hasOwnProperty(input, "infraReserveUsd")
				? input.infraReserveUsd === null || input.infraReserveUsd === undefined
					? null
					: input.infraReserveUsd.toFixed(2)
				: existingRuntime?.infra_reserve_usd || null,
			webUiUrl: hasOwnProperty(input, "webUiUrl") ? input.webUiUrl || null : existingRuntime?.web_ui_url || null,
			bridgeUrl: hasOwnProperty(input, "bridgeUrl") ? input.bridgeUrl || null : existingRuntime?.bridge_url || null,
			statusReason,
			lastHeartbeatAt: hasOwnProperty(input, "lastHeartbeatAt")
				? toIsoString(input.lastHeartbeatAt)
				: existingRuntime?.last_heartbeat_at || null,
			lastStatusChangedAt: runtimeStatusWasExplicitlyUpdated ? new Date().toISOString() : existingRuntime?.last_status_changed_at || null,
			suspendedAt:
				runtimeStatusWasExplicitlyUpdated && runtimeStatus === "suspended" && existingRuntime?.agent_status !== "suspended"
					? new Date().toISOString()
					: existingRuntime?.suspended_at || null,
			resumedAt:
				runtimeStatusWasExplicitlyUpdated && existingRuntime?.agent_status === "suspended" && runtimeStatus !== "suspended"
					? new Date().toISOString()
					: existingRuntime?.resumed_at || null,
			deletedAt:
				runtimeStatusWasExplicitlyUpdated && runtimeStatus === "deleted"
					? new Date().toISOString()
					: existingRuntime?.deleted_at || null,
			runtimeMetadata: mergedRuntimeMetadata,
		},
		getClient(),
	);

	const refreshedContext = await getTokenRuntimeContext(input);
	if (!refreshedContext) {
		throw new Error("Failed to reload runtime state after update");
	}

	return refreshedContext.runtime;
}

export async function claimTokenRuntimeOwnership(
	lookup: RuntimeLookup,
	authUser?: AuthUser,
): Promise<TokenRuntimeContext | null> {
	const token = await getTokenByLookup(lookup);
	if (!token) {
		return null;
	}

	const snapshot = await ensureControlPlaneSnapshot(token);
	const authWallets = normalizeAuthWallets(authUser);
	const authAddresses = authWallets.map((wallet) => wallet.address);
	const creatorMatchedWallet = snapshot.creatorWalletIdentity
		? authAddresses.find((wallet) => walletsMatch(wallet, snapshot.creatorWalletIdentity?.address)) || null
		: null;
	const existingOwnerMatchedWallet = snapshot.ownerWalletIdentity
		? authAddresses.find((wallet) => walletsMatch(wallet, snapshot.ownerWalletIdentity?.address)) || null
		: null;

	if (snapshot.ownership.owner_claim_status !== "unclaimed" && !existingOwnerMatchedWallet && !creatorMatchedWallet) {
		throw new Error("Token is already claimed by another user");
	}

	if (!creatorMatchedWallet && !existingOwnerMatchedWallet) {
		throw new Error("Creator wallet does not match token creator");
	}

	let ownerWalletIdentity = snapshot.ownerWalletIdentity;
	if (!ownerWalletIdentity && creatorMatchedWallet) {
		const secondaryWallet = authWallets.find((wallet) => wallet.address !== creatorMatchedWallet) || null;
		if (secondaryWallet) {
			ownerWalletIdentity = await ensureWalletIdentityForAuthWallet(secondaryWallet, DEFAULT_SECONDARY_CHAIN_IDS[secondaryWallet.chain]);
		}
	}

	const existingMetadata = isJsonRecord(snapshot.ownership.ownership_metadata) ? snapshot.ownership.ownership_metadata : {};
	const linkedWallets = Array.from(
		new Set([
			...(Array.isArray(existingMetadata.linkedWallets)
				? existingMetadata.linkedWallets.filter((wallet): wallet is string => typeof wallet === "string")
				: []),
			...authAddresses,
		]),
	);

	await upsertTokenOwnership(
		{
			chain: lookup.chain,
			chainId: Number(lookup.chainId),
			contractAddress: lookup.mint,
			launchType: token.imported ? "imported" : "native",
			ownerClaimStatus: "claimed",
			claimedAt: snapshot.ownership.claimed_at || new Date().toISOString(),
			ownershipSource: snapshot.ownership.owner_claim_status === "unclaimed" ? "self_claim" : snapshot.ownership.ownership_source,
			ownershipMetadata: {
				...existingMetadata,
				linkedWallets,
				linkedWalletCount: linkedWallets.length,
			},
			creatorWallet: snapshot.creatorWalletIdentity
				? toWalletIdentityUpsertInput(snapshot.creatorWalletIdentity)
				: token.creator
					? {
						chain: token.chain,
						chainId: Number(token.chainId),
						address: String(token.creator),
						linkSource: "import",
						verifiedAt: toIsoString(token.createdAt),
						metadata: {
							seededFrom: "mongo_token.creator",
						},
					}
					: null,
			ownerWallet: ownerWalletIdentity ? toWalletIdentityUpsertInput(ownerWalletIdentity) : undefined,
		},
		getClient(),
	);

	const refreshedContext = await getTokenRuntimeContext(lookup, authUser);
	if (!refreshedContext) {
		throw new Error("Failed to reload ownership state after claim");
	}

	return refreshedContext;
}

export async function listRuntimeOwnedTokenKeys(authUser?: AuthUser): Promise<RuntimeLookup[]> {
	const authWallets = normalizeAuthWallets(authUser);
	if (authWallets.length === 0) {
		return [];
	}

	const seededCreatorLookups = await seedLegacyCreatorRuntimeRecords(authUser);
	const authWalletIdentities = (
		await Promise.all(authWallets.map(async (wallet) => await findWalletIdentityByNormalizedAddress(wallet)))
	).filter((walletIdentity): walletIdentity is WalletIdentityRow => Boolean(walletIdentity));
	const walletIdentityIds = Array.from(new Set(authWalletIdentities.map((walletIdentity) => walletIdentity.id)));

	if (walletIdentityIds.length === 0) {
		return seededCreatorLookups;
	}

	const client = getClient();
	const [creatorOwnedRows, directlyOwnedRows] = await Promise.all([
		client
			.from("control_plane_token_ownerships")
			.select("token_chain, token_chain_id, contract_address")
			.in("creator_wallet_identity_id", walletIdentityIds),
		client
			.from("control_plane_token_ownerships")
			.select("token_chain, token_chain_id, contract_address")
			.in("owner_wallet_identity_id", walletIdentityIds),
	]);

	if (creatorOwnedRows.error) {
		throw new Error(`Failed to list creator-owned control-plane tokens: ${creatorOwnedRows.error.message}`);
	}

	if (directlyOwnedRows.error) {
		throw new Error(`Failed to list claimed control-plane tokens: ${directlyOwnedRows.error.message}`);
	}

	return uniqueLookups([
		...seededCreatorLookups,
		...((creatorOwnedRows.data || []).map((row) => ({
			mint: row.contract_address,
			chain: row.token_chain,
			chainId: row.token_chain_id,
		})) as RuntimeLookup[]),
		...((directlyOwnedRows.data || []).map((row) => ({
			mint: row.contract_address,
			chain: row.token_chain,
			chainId: row.token_chain_id,
		})) as RuntimeLookup[]),
	]);
}
