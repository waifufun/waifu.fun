import { and, desc, eq } from "drizzle-orm";

import type { Database } from "../client.js";
import { creators } from "../schema/creators.js";
import { inviteCodes } from "../schema/invite-codes.js";

export interface ValidateInviteCodeResult {
	valid: boolean;
	remainingUses?: number;
	reason?: string;
}

export interface CreateInviteCodeInput {
	code: string;
	maxUses: number;
	createdByAddress: string; // EVM address — we'll resolve to creator UUID internally
	expiresAt?: Date | undefined;
}

export interface InviteCodeRecord {
	id: string;
	code: string;
	maxUses: number;
	usedCount: number;
	isActive: boolean;
	expiresAt: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

export async function validateInviteCode(db: Database, code: string): Promise<ValidateInviteCodeResult> {
	const results = await db
		.select({
			id: inviteCodes.id,
			maxUses: inviteCodes.maxUses,
			usedCount: inviteCodes.usedCount,
			isActive: inviteCodes.isActive,
			expiresAt: inviteCodes.expiresAt,
		})
		.from(inviteCodes)
		.where(and(eq(inviteCodes.code, code), eq(inviteCodes.isActive, true)))
		.limit(1);

	const invite = results[0];

	if (!invite) return { valid: false, reason: "Invalid invite code" };

	if (invite.expiresAt && invite.expiresAt < new Date()) {
		return { valid: false, reason: "Invite code has expired" };
	}

	if (invite.usedCount >= invite.maxUses) {
		return { valid: false, reason: "Invite code has reached its usage limit" };
	}

	return { valid: true, remainingUses: invite.maxUses - invite.usedCount };
}

export async function createInviteCode(db: Database, input: CreateInviteCodeInput): Promise<InviteCodeRecord> {
	const normalizedAddress = input.createdByAddress.toLowerCase();

	// Upsert creator to get UUID
	const creatorResult = await db
		.insert(creators)
		.values({ evmAddress: normalizedAddress })
		.onConflictDoUpdate({
			target: creators.evmAddress,
			set: { updatedAt: new Date() },
		})
		.returning({ id: creators.id });

	const creator = creatorResult[0];
	if (!creator) {
		throw new Error("Failed to resolve creator for invite code creation");
	}

	const results = await db
		.insert(inviteCodes)
		.values({
			code: input.code,
			maxUses: input.maxUses,
			createdBy: creator.id,
			expiresAt: input.expiresAt ?? null,
			isActive: true,
		})
		.returning({
			id: inviteCodes.id,
			code: inviteCodes.code,
			maxUses: inviteCodes.maxUses,
			usedCount: inviteCodes.usedCount,
			isActive: inviteCodes.isActive,
			expiresAt: inviteCodes.expiresAt,
			createdBy: inviteCodes.createdBy,
			createdAt: inviteCodes.createdAt,
			updatedAt: inviteCodes.updatedAt,
		});

	const invite = results[0];
	if (!invite) {
		throw new Error("Failed to create invite code");
	}

	return {
		id: invite.id,
		code: invite.code,
		maxUses: invite.maxUses,
		usedCount: invite.usedCount,
		isActive: invite.isActive,
		expiresAt: invite.expiresAt?.toISOString() ?? null,
		createdBy: invite.createdBy,
		createdAt: invite.createdAt.toISOString(),
		updatedAt: invite.updatedAt.toISOString(),
	};
}

export async function listInviteCodes(db: Database): Promise<InviteCodeRecord[]> {
	const results = await db
		.select({
			id: inviteCodes.id,
			code: inviteCodes.code,
			maxUses: inviteCodes.maxUses,
			usedCount: inviteCodes.usedCount,
			isActive: inviteCodes.isActive,
			expiresAt: inviteCodes.expiresAt,
			createdBy: inviteCodes.createdBy,
			createdAt: inviteCodes.createdAt,
			updatedAt: inviteCodes.updatedAt,
		})
		.from(inviteCodes)
		.orderBy(desc(inviteCodes.createdAt));

	return results.map((invite) => ({
		id: invite.id,
		code: invite.code,
		maxUses: invite.maxUses,
		usedCount: invite.usedCount,
		isActive: invite.isActive,
		expiresAt: invite.expiresAt?.toISOString() ?? null,
		createdBy: invite.createdBy,
		createdAt: invite.createdAt.toISOString(),
		updatedAt: invite.updatedAt.toISOString(),
	}));
}
