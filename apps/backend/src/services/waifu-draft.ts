/**
 * WaifuDraft service — business logic for draft CRUD and lifecycle.
 *
 * All database access is funnelled through this module so the router stays
 * thin.  Validation helpers live here too (for now); they can be extracted
 * to a shared validator later.
 */

import DB from "@autofun/database";
import type { AddressLike } from "@autofun/types";
import type {
	IWaifuDraft,
	CreateDraftBody,
	UpdateDraftBody,
	DraftStatus,
} from "../types/waifu-draft";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal validation that the required sections are present.
 * Returns an error string or null when valid.
 */
export function validateCreatePayload(body: CreateDraftBody): string | null {
	if (!body.entry?.mode) return "entry.mode is required (create | import)";
	if (!["create", "import"].includes(body.entry.mode))
		return `entry.mode must be "create" or "import", got "${body.entry.mode}"`;

	if (!body.token?.provenance) return "token.provenance is required (flap | imported)";
	if (!["flap", "imported"].includes(body.token.provenance))
		return `token.provenance must be "flap" or "imported", got "${body.token.provenance}"`;

	// Import flow must provide contractAddress
	if (body.token.provenance === "imported") {
		if (!body.token.importedConfig?.contractAddress)
			return "token.importedConfig.contractAddress is required for imported provenance";
		if (!body.token.importedConfig?.chain)
			return "token.importedConfig.chain is required for imported provenance";
		if (!body.token.importedConfig?.chainId)
			return "token.importedConfig.chainId is required for imported provenance";
	}

	return null;
}

/**
 * Checks that the minimum fields needed for review submission are present.
 */
export function validateForSubmission(draft: IWaifuDraft): string | null {
	if (!draft.identity?.name) return "identity.name is required before submission";
	if (!draft.identity?.ticker) return "identity.ticker is required before submission";

	if (draft.token.provenance === "flap") {
		if (!draft.token.chain) return "token.chain is required for Flap launch";
		if (!draft.token.chainId) return "token.chainId is required for Flap launch";
	}

	if (draft.token.provenance === "imported") {
		if (!draft.token.importedConfig?.contractAddress)
			return "token.importedConfig.contractAddress is required for import";
	}

	return null;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new draft.  `walletAddress` is injected from auth, never from body.
 */
export async function createDraft(
	walletAddress: AddressLike,
	body: CreateDraftBody,
): Promise<IWaifuDraft> {
	const doc = await DB.WaifuDraft.create({
		entry: {
			mode: body.entry.mode,
			createdAt: new Date().toISOString(),
			referral: body.entry.referral,
		},
		identity: body.identity ?? {},
		token: {
			provenance: body.token.provenance,
			chain: body.token.chain ?? body.token.importedConfig?.chain,
			chainId: body.token.chainId ?? body.token.importedConfig?.chainId,
			flapConfig: body.token.provenance === "flap" ? (body.token.flapConfig ?? {}) : undefined,
			importedConfig: body.token.provenance === "imported" ? body.token.importedConfig : undefined,
		},
		runtime: body.runtime ?? {},
		owner: {
			walletAddress,
			displayName: body.owner?.displayName,
			billingTier: body.owner?.billingTier,
		},
		review: {
			status: "draft" as DraftStatus,
		},
	});

	return doc.toObject() as unknown as IWaifuDraft;
}

/**
 * Get a single draft by ID.  Enforces ownership.
 */
export async function getDraft(
	draftId: string,
	walletAddress: AddressLike,
): Promise<IWaifuDraft | null> {
	const doc = await DB.WaifuDraft.findOne({
		_id: draftId,
		"owner.walletAddress": walletAddress,
	}).lean();
	return doc as unknown as IWaifuDraft | null;
}

/**
 * List drafts for a wallet, newest first.
 */
export async function listDrafts(
	walletAddress: AddressLike,
	opts: { page?: number; limit?: number; status?: DraftStatus } = {},
): Promise<{ drafts: IWaifuDraft[]; total: number; page: number; totalPages: number }> {
	const page = opts.page ?? 1;
	const limit = Math.min(opts.limit ?? 20, 50);
	const skip = (page - 1) * limit;

	// biome-ignore lint/suspicious/noExplicitAny: mongoose query builder
	const query: any = { "owner.walletAddress": walletAddress };
	if (opts.status) query["review.status"] = opts.status;

	const [docs, total] = await Promise.all([
		DB.WaifuDraft.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
		DB.WaifuDraft.countDocuments(query),
	]);

	return {
		drafts: docs as unknown as IWaifuDraft[],
		total,
		page,
		totalPages: Math.ceil(total / limit),
	};
}

/**
 * Partial update of a draft.  Only allowed while status is "draft" or "rejected".
 */
export async function updateDraft(
	draftId: string,
	walletAddress: AddressLike,
	body: UpdateDraftBody,
): Promise<IWaifuDraft | null> {
	// Build $set map from nested section updates
	// biome-ignore lint/suspicious/noExplicitAny: dynamic $set construction
	const $set: Record<string, any> = {};

	if (body.identity) {
		for (const [key, value] of Object.entries(body.identity)) {
			if (value !== undefined) {
				if (key === "socials" && typeof value === "object") {
					for (const [sk, sv] of Object.entries(value as Record<string, unknown>)) {
						$set[`identity.socials.${sk}`] = sv;
					}
				} else {
					$set[`identity.${key}`] = value;
				}
			}
		}
	}

	if (body.token) {
		for (const [key, value] of Object.entries(body.token)) {
			if (value !== undefined) {
				if (key === "flapConfig" && typeof value === "object") {
					for (const [fk, fv] of Object.entries(value as Record<string, unknown>)) {
						$set[`token.flapConfig.${fk}`] = fv;
					}
				} else if (key === "importedConfig" && typeof value === "object") {
					for (const [ik, iv] of Object.entries(value as Record<string, unknown>)) {
						$set[`token.importedConfig.${ik}`] = iv;
					}
				} else {
					$set[`token.${key}`] = value;
				}
			}
		}
	}

	if (body.runtime) {
		for (const [key, value] of Object.entries(body.runtime)) {
			if (value !== undefined) $set[`runtime.${key}`] = value;
		}
	}

	if (body.owner) {
		if (body.owner.displayName !== undefined)
			$set["owner.displayName"] = body.owner.displayName;
		if (body.owner.billingTier !== undefined)
			$set["owner.billingTier"] = body.owner.billingTier;
	}

	if (Object.keys($set).length === 0) return getDraft(draftId, walletAddress);

	const doc = await DB.WaifuDraft.findOneAndUpdate(
		{
			_id: draftId,
			"owner.walletAddress": walletAddress,
			"review.status": { $in: ["draft", "rejected"] },
		},
		{ $set },
		{ new: true, lean: true },
	);

	return doc as unknown as IWaifuDraft | null;
}

/**
 * Transition a draft to "pending_review" after passing submission checks.
 */
export async function submitDraft(
	draftId: string,
	walletAddress: AddressLike,
): Promise<IWaifuDraft | null> {
	const doc = await DB.WaifuDraft.findOneAndUpdate(
		{
			_id: draftId,
			"owner.walletAddress": walletAddress,
			"review.status": { $in: ["draft", "rejected"] },
		},
		{
			$set: {
				"review.status": "pending_review",
				"review.reviewedAt": new Date().toISOString(),
			},
		},
		{ new: true, lean: true },
	);
	return doc as unknown as IWaifuDraft | null;
}

/**
 * Build the activation-ready payload that downstream systems
 * (Flap launcher, agent provisioner) will consume.
 *
 * This is called when the draft transitions to "approved" status and
 * shapes the data into a normalized form regardless of provenance.
 */
export function buildActivationPayload(draft: IWaifuDraft): Record<string, unknown> {
	const base = {
		draftId: draft._id,
		provenance: draft.token.provenance,
		chain: draft.token.chain,
		chainId: draft.token.chainId,
		identity: {
			name: draft.identity.name,
			ticker: draft.identity.ticker,
			description: draft.identity.description,
			image: draft.identity.image,
			socials: draft.identity.socials,
		},
		owner: draft.owner.walletAddress,
		runtime: draft.runtime,
	};

	if (draft.token.provenance === "flap") {
		return {
			...base,
			launch: {
				type: "flap",
				metadataUri: draft.token.flapConfig?.metadataUri,
				totalSupply: draft.token.flapConfig?.totalSupply,
				decimals: draft.token.flapConfig?.decimals ?? 9,
				maxBuyAmount: draft.token.flapConfig?.maxBuyAmount,
				delayForTrade: draft.token.flapConfig?.delayForTrade,
				curveVersion: draft.token.flapConfig?.curveVersion ?? 2,
				isToken2022: draft.token.flapConfig?.isToken2022 ?? false,
			},
		};
	}

	// imported provenance
	return {
		...base,
		import: {
			type: "imported",
			contractAddress: draft.token.importedConfig?.contractAddress,
			pool: draft.token.importedConfig?.pool,
			curveCompleted: draft.token.importedConfig?.curveCompleted,
			totalSupply: draft.token.importedConfig?.totalSupply,
			decimals: draft.token.importedConfig?.decimals,
			isToken2022: draft.token.importedConfig?.isToken2022,
			originalCreator: draft.token.importedConfig?.originalCreator,
		},
	};
}

/**
 * Archive (soft-delete) a draft.
 */
export async function archiveDraft(
	draftId: string,
	walletAddress: AddressLike,
): Promise<boolean> {
	const result = await DB.WaifuDraft.updateOne(
		{
			_id: draftId,
			"owner.walletAddress": walletAddress,
			"review.status": { $in: ["draft", "rejected"] },
		},
		{ $set: { "review.status": "archived" } },
	);
	return result.modifiedCount > 0;
}
