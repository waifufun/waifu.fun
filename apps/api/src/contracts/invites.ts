import { z } from "zod";

export const createInviteSchema = z.object({
	code: z.string().trim().min(1).max(64),
	maxUses: z.coerce.number().int().min(1).max(10_000).default(10),
	expiresAt: z.coerce.date().optional(),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export interface CreateInviteCodeInput {
	code: string;
	maxUses: number;
	createdByAddress: string; // EVM address
	expiresAt?: Date | undefined;
}

export interface ValidateInviteCodeResult {
	valid: boolean;
	remainingUses?: number;
	reason?: string;
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
