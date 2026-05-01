import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../client.js";
import { creators } from "../schema/creators.js";
import { inviteCodes, inviteRedemptions } from "../schema/invite-codes.js";
import { launches } from "../schema/launches.js";

export type LaunchStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "preparing"
	| "awaiting_signature"
	| "submitted"
	| "launched"
	| "failed"
	| "provisioned"
	| "queued"
	| "launching"
	| "live";

export interface CreateLaunchInput {
	name: string;
	symbol: string;
	description: string;
	imageUrl?: string | undefined;
	website?: string | undefined;
	twitter?: string | undefined;
	telegram?: string | undefined;
	taxRateBps: number;
	inviteCode?: string | undefined;
	initialBuyBnb?: string | undefined;
}

export interface LaunchRecord {
	id: string;
	creatorAddress: string;
	status: LaunchStatus;
	name: string;
	symbol: string;
	description: string;
	imageUrl?: string;
	website?: string;
	twitter?: string;
	telegram?: string;
	quoteTokenSymbol: "BNB";
	taxRateBps: number;
	inviteCode?: string;
	initialBuyBnb?: string;
	metadataCid: string | null;
	salt: string | null;
	submitStrategy: "user-signed";
	createdAt: string;
	updatedAt: string;
}

// Map DB status to API status
function mapLaunchStatus(
	dbStatus:
		| "draft"
		| "pending_review"
		| "approved"
		| "preparing"
		| "ready"
		| "submitted"
		| "confirmed"
		| "provisioned"
		| "queued"
		| "launching"
		| "live"
		| "failed"
		| "rejected"
		| "provisioned"
		| "queued"
		| "launching"
		| "live",
): LaunchStatus {
	switch (dbStatus) {
		case "draft":
		case "pending_review":
			return "pending";
		case "approved":
			return "approved";
		case "rejected":
			return "rejected";
		case "preparing":
		case "ready":
			return "preparing";
		case "submitted":
			return "submitted";
		case "confirmed":
			return "launched";
		case "provisioned":
			return "provisioned";
		case "queued":
			return "queued";
		case "launching":
			return "launching";
		case "live":
			return "live";
		case "failed":
			return "failed";
	}
}

// Map API status to DB status
function mapApiStatusToDb(
	apiStatus: LaunchStatus,
):
	| "draft"
	| "pending_review"
	| "approved"
	| "preparing"
	| "ready"
	| "submitted"
	| "confirmed"
	| "provisioned"
	| "queued"
	| "launching"
	| "live"
	| "failed"
	| "rejected"
	| "provisioned"
	| "queued"
	| "launching"
	| "live" {
	switch (apiStatus) {
		case "pending":
			return "pending_review";
		case "approved":
			return "approved";
		case "rejected":
			return "rejected";
		case "preparing":
			return "preparing";
		case "awaiting_signature":
			return "ready";
		case "submitted":
			return "submitted";
		case "launched":
			return "confirmed";
		case "provisioned":
			return "provisioned";
		case "queued":
			return "queued";
		case "launching":
			return "launching";
		case "live":
			return "live";
		case "failed":
			return "failed";
	}
}

// Build socials JSON from optional fields
function buildSocials(input: CreateLaunchInput): Record<string, unknown> {
	const socials: Record<string, string> = {};
	if (input.website) socials.website = input.website;
	if (input.twitter) socials.twitter = input.twitter;
	if (input.telegram) socials.telegram = input.telegram;
	return socials;
}

// Extract socials from JSON
function extractSocials(socials: Record<string, unknown>): {
	website?: string;
	twitter?: string;
	telegram?: string;
} {
	return {
		website: typeof socials.website === "string" ? socials.website : undefined,
		twitter: typeof socials.twitter === "string" ? socials.twitter : undefined,
		telegram: typeof socials.telegram === "string" ? socials.telegram : undefined,
	};
}

export async function createLaunch(
	db: Database,
	creatorAddress: string,
	input: CreateLaunchInput,
	options: { curatedLaunchOnly: boolean },
): Promise<LaunchRecord> {
	const normalizedAddress = creatorAddress.toLowerCase();

	return await db.transaction(async (tx) => {
		// 1. Upsert creator
		const creatorResult = await tx
			.insert(creators)
			.values({
				evmAddress: normalizedAddress,
			})
			.onConflictDoUpdate({
				target: creators.evmAddress,
				set: {
					updatedAt: new Date(),
				},
			})
			.returning({
				id: creators.id,
			});

		if (!creatorResult[0]) {
			throw new Error("Failed to upsert creator");
		}

		const creator = creatorResult[0];

		// 2. Handle invite code if provided
		let inviteCodeId: string | null = null;
		if (input.inviteCode) {
			// Find the invite code
			const [inviteCode] = await tx
				.select({
					id: inviteCodes.id,
					maxUses: inviteCodes.maxUses,
					usedCount: inviteCodes.usedCount,
				})
				.from(inviteCodes)
				.where(and(eq(inviteCodes.code, input.inviteCode), eq(inviteCodes.isActive, true)))
				.limit(1);

			if (inviteCode) {
				// Check if already redeemed by this creator
				const [existingRedemption] = await tx
					.select()
					.from(inviteRedemptions)
					.where(and(eq(inviteRedemptions.inviteCodeId, inviteCode.id), eq(inviteRedemptions.creatorId, creator.id)))
					.limit(1);

				if (!existingRedemption && inviteCode.usedCount < inviteCode.maxUses) {
					// Redeem the invite code
					await tx.insert(inviteRedemptions).values({
						inviteCodeId: inviteCode.id,
						creatorId: creator.id,
					});

					// Increment used count
					await tx
						.update(inviteCodes)
						.set({
							usedCount: sql`${inviteCodes.usedCount} + 1`,
							updatedAt: new Date(),
						})
						.where(eq(inviteCodes.id, inviteCode.id));

					inviteCodeId = inviteCode.id;
				}
			}
		}

		// 3. Determine initial status
		const hasValidInvite = inviteCodeId !== null;
		const initialStatus = options.curatedLaunchOnly && !hasValidInvite ? "pending_review" : "preparing";

		// 4. Create launch
		const socials = buildSocials(input);

		const launchResult = await tx
			.insert(launches)
			.values({
				creatorId: creator.id,
				inviteCodeId,
				tokenName: input.name,
				tokenTicker: input.symbol,
				tokenImageUrl: input.imageUrl ?? null,
				tokenDescription: input.description,
				socials,
				chainId: 56, // BSC
				portalAddress: "0x0000000000000000000000000000000000000000", // Will be set from config
				quoteToken: "BNB",
				taxRate: input.taxRateBps,
				status: initialStatus,
			})
			.returning({
				id: launches.id,
				creatorId: launches.creatorId,
				status: launches.status,
				tokenName: launches.tokenName,
				tokenTicker: launches.tokenTicker,
				tokenDescription: launches.tokenDescription,
				tokenImageUrl: launches.tokenImageUrl,
				socials: launches.socials,
				quoteToken: launches.quoteToken,
				taxRate: launches.taxRate,
				metadataUri: launches.metadataUri,
				salt: launches.salt,
				createdAt: launches.createdAt,
				updatedAt: launches.updatedAt,
			});

		if (!launchResult[0]) {
			throw new Error("Failed to create launch");
		}

		const launch = launchResult[0];
		const { website, twitter, telegram } = extractSocials(launch.socials);

		// Extract CID from metadata URI if present
		let metadataCid: string | null = null;
		if (launch.metadataUri) {
			const cidMatch = launch.metadataUri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
			if (cidMatch) {
				metadataCid = cidMatch[1] ?? null;
			}
		}

		// Convert salt bytea to hex string if present
		let saltHex: string | null = null;
		if (launch.salt) {
			saltHex = Buffer.from(launch.salt).toString("hex");
		}

		return {
			id: launch.id,
			creatorAddress: normalizedAddress,
			status: mapLaunchStatus(launch.status),
			name: launch.tokenName,
			symbol: launch.tokenTicker,
			description: launch.tokenDescription ?? "",
			...(launch.tokenImageUrl ? { imageUrl: launch.tokenImageUrl } : {}),
			...(website ? { website } : {}),
			...(twitter ? { twitter } : {}),
			...(telegram ? { telegram } : {}),
			quoteTokenSymbol: "BNB",
			taxRateBps: launch.taxRate,
			...(input.inviteCode && inviteCodeId ? { inviteCode: input.inviteCode } : {}),
			...(input.initialBuyBnb ? { initialBuyBnb: input.initialBuyBnb } : {}),
			metadataCid,
			salt: saltHex,
			submitStrategy: "user-signed" as const,
			createdAt: launch.createdAt.toISOString(),
			updatedAt: launch.updatedAt.toISOString(),
		};
	});
}

export async function getLaunchById(db: Database, id: string): Promise<LaunchRecord | null> {
	const result = await db
		.select({
			id: launches.id,
			creatorEvmAddress: creators.evmAddress,
			status: launches.status,
			tokenName: launches.tokenName,
			tokenTicker: launches.tokenTicker,
			tokenDescription: launches.tokenDescription,
			tokenImageUrl: launches.tokenImageUrl,
			socials: launches.socials,
			quoteToken: launches.quoteToken,
			taxRate: launches.taxRate,
			metadataUri: launches.metadataUri,
			salt: launches.salt,
			createdAt: launches.createdAt,
			updatedAt: launches.updatedAt,
		})
		.from(launches)
		.leftJoin(creators, eq(launches.creatorId, creators.id))
		.where(eq(launches.id, id))
		.limit(1);

	if (result.length === 0 || !result[0]) {
		return null;
	}

	const launch = result[0];
	const { website, twitter, telegram } = extractSocials(launch.socials);

	// Extract CID from metadata URI if present
	let metadataCid: string | null = null;
	if (launch.metadataUri) {
		const cidMatch = launch.metadataUri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
		if (cidMatch) {
			metadataCid = cidMatch[1] ?? null;
		}
	}

	// Convert salt bytea to hex string if present
	let saltHex: string | null = null;
	if (launch.salt) {
		saltHex = Buffer.from(launch.salt).toString("hex");
	}

	return {
		id: launch.id,
		creatorAddress: launch.creatorEvmAddress ?? "0x0000000000000000000000000000000000000000",
		status: mapLaunchStatus(launch.status),
		name: launch.tokenName,
		symbol: launch.tokenTicker,
		description: launch.tokenDescription ?? "",
		...(launch.tokenImageUrl ? { imageUrl: launch.tokenImageUrl } : {}),
		...(website ? { website } : {}),
		...(twitter ? { twitter } : {}),
		...(telegram ? { telegram } : {}),
		quoteTokenSymbol: "BNB",
		taxRateBps: launch.taxRate,
		metadataCid,
		salt: saltHex,
		submitStrategy: "user-signed" as const,
		createdAt: launch.createdAt.toISOString(),
		updatedAt: launch.updatedAt.toISOString(),
	};
}

export async function listAdminLaunches(db: Database): Promise<LaunchRecord[]> {
	const results = await db
		.select({
			id: launches.id,
			creatorEvmAddress: creators.evmAddress,
			status: launches.status,
			tokenName: launches.tokenName,
			tokenTicker: launches.tokenTicker,
			tokenDescription: launches.tokenDescription,
			tokenImageUrl: launches.tokenImageUrl,
			socials: launches.socials,
			quoteToken: launches.quoteToken,
			taxRate: launches.taxRate,
			metadataUri: launches.metadataUri,
			salt: launches.salt,
			createdAt: launches.createdAt,
			updatedAt: launches.updatedAt,
		})
		.from(launches)
		.leftJoin(creators, eq(launches.creatorId, creators.id))
		.orderBy(desc(launches.createdAt));

	return results.map((launch) => {
		const { website, twitter, telegram } = extractSocials(launch.socials);

		// Extract CID from metadata URI if present
		let metadataCid: string | null = null;
		if (launch.metadataUri) {
			const cidMatch = launch.metadataUri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
			if (cidMatch) {
				metadataCid = cidMatch[1] ?? null;
			}
		}

		// Convert salt bytea to hex string if present
		let saltHex: string | null = null;
		if (launch.salt) {
			saltHex = Buffer.from(launch.salt).toString("hex");
		}

		return {
			id: launch.id,
			creatorAddress: launch.creatorEvmAddress ?? "0x0000000000000000000000000000000000000000",
			status: mapLaunchStatus(launch.status),
			name: launch.tokenName,
			symbol: launch.tokenTicker,
			description: launch.tokenDescription ?? "",
			...(launch.tokenImageUrl ? { imageUrl: launch.tokenImageUrl } : {}),
			...(website ? { website } : {}),
			...(twitter ? { twitter } : {}),
			...(telegram ? { telegram } : {}),
			quoteTokenSymbol: "BNB",
			taxRateBps: launch.taxRate,
			metadataCid,
			salt: saltHex,
			submitStrategy: "user-signed" as const,
			createdAt: launch.createdAt.toISOString(),
			updatedAt: launch.updatedAt.toISOString(),
		};
	});
}

export async function updateLaunchStatus(db: Database, id: string, status: LaunchStatus): Promise<LaunchRecord | null> {
	// Special handling: approved -> preparing
	const dbStatus = status === "approved" ? "preparing" : mapApiStatusToDb(status);

	const updatedResult = await db
		.update(launches)
		.set({
			status: dbStatus,
			updatedAt: new Date(),
		})
		.where(eq(launches.id, id))
		.returning({
			id: launches.id,
			creatorId: launches.creatorId,
			status: launches.status,
			tokenName: launches.tokenName,
			tokenTicker: launches.tokenTicker,
			tokenDescription: launches.tokenDescription,
			tokenImageUrl: launches.tokenImageUrl,
			socials: launches.socials,
			quoteToken: launches.quoteToken,
			taxRate: launches.taxRate,
			metadataUri: launches.metadataUri,
			salt: launches.salt,
			createdAt: launches.createdAt,
			updatedAt: launches.updatedAt,
		});

	if (updatedResult.length === 0 || !updatedResult[0]) {
		return null;
	}

	const updated = updatedResult[0];

	// Fetch creator address
	const creatorResult = await db
		.select({ evmAddress: creators.evmAddress })
		.from(creators)
		.where(eq(creators.id, updated.creatorId))
		.limit(1);

	const { website, twitter, telegram } = extractSocials(updated.socials);

	// Extract CID from metadata URI if present
	let metadataCid: string | null = null;
	if (updated.metadataUri) {
		const cidMatch = updated.metadataUri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
		if (cidMatch) {
			metadataCid = cidMatch[1] ?? null;
		}
	}

	// Convert salt bytea to hex string if present
	let saltHex: string | null = null;
	if (updated.salt) {
		saltHex = Buffer.from(updated.salt).toString("hex");
	}

	return {
		id: updated.id,
		creatorAddress: creatorResult[0]?.evmAddress ?? "0x0000000000000000000000000000000000000000",
		status: mapLaunchStatus(updated.status),
		name: updated.tokenName,
		symbol: updated.tokenTicker,
		description: updated.tokenDescription ?? "",
		...(updated.tokenImageUrl ? { imageUrl: updated.tokenImageUrl } : {}),
		...(website ? { website } : {}),
		...(twitter ? { twitter } : {}),
		...(telegram ? { telegram } : {}),
		quoteTokenSymbol: "BNB",
		taxRateBps: updated.taxRate,
		metadataCid,
		salt: saltHex,
		submitStrategy: "user-signed" as const,
		createdAt: updated.createdAt.toISOString(),
		updatedAt: updated.updatedAt.toISOString(),
	};
}
