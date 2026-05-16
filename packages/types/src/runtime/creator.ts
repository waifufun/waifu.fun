import { z } from "zod";

import { hexAddressSchema } from "./common.js";

export const creatorRoleSchema = z.enum(["anon", "user", "creator", "admin", "superadmin"]);
export type CreatorRole = z.infer<typeof creatorRoleSchema>;

export const creatorProfileSchema = z.object({
	address: hexAddressSchema,
	displayName: z.string().trim().min(1).max(64).nullable().default(null),
	avatarUrl: z.string().url().nullable().optional(),
	bio: z.string().trim().min(1).max(500).nullable().default(null),
	twitter: z.string().url().nullable().default(null),
	telegram: z.string().url().nullable().default(null),
	website: z.string().url().nullable().default(null),
	verified: z.boolean().default(false),
	featured: z.boolean().default(false),
});

export type CreatorProfile = z.infer<typeof creatorProfileSchema>;

export const creatorRecordSchema = creatorProfileSchema.extend({
	role: creatorRoleSchema.default("creator"),
	suspended: z.boolean().default(false),
	points: z.number().int().nonnegative().default(0),
	weeklyPoints: z.number().int().nonnegative().default(0),
});

export type CreatorRecord = z.infer<typeof creatorRecordSchema>;

export const updateCreatorSchema = z.object({
	displayName: z.string().trim().min(1).max(64).optional(),
	avatarUrl: z.string().url().optional(),
	bio: z.string().trim().min(1).max(500).optional(),
	twitter: z.string().url().optional(),
	telegram: z.string().url().optional(),
	website: z.string().url().optional(),
});

export type UpdateCreatorInput = z.infer<typeof updateCreatorSchema>;
