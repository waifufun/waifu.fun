import { z } from "zod";

import {
	DEFAULT_CHAIN_ID,
	hexAddressSchema,
	isoDateTimeSchema,
	numericStringSchema,
	supportedChainIdSchema,
} from "./common";

export const launchStatusSchema = z.enum([
	"draft",
	"pending",
	"pending_review",
	"approved",
	"rejected",
	"preparing",
	"ready",
	"submitted",
	"launched",
	"confirmed",
	"failed",
]);

export type LaunchStatus = z.infer<typeof launchStatusSchema>;

export const launchTokenTypeSchema = z.enum(["standard", "tax"]);
export type LaunchTokenType = z.infer<typeof launchTokenTypeSchema>;

export const createLaunchSchema = z.object({
	name: z.string().trim().min(1).max(64),
	symbol: z.string().trim().min(1).max(16),
	description: z.string().trim().min(1).max(1_000),
	imageUrl: z.string().url().optional(),
	website: z.string().url().optional(),
	twitter: z.string().url().optional(),
	telegram: z.string().url().optional(),
	taxRateBps: z.number().int().min(0).max(10_000).default(0),
	inviteCode: z.string().trim().min(1).max(64).optional(),
	initialBuyBnb: numericStringSchema.optional(),
	quoteToken: z.union([z.literal("BNB"), hexAddressSchema]).optional(),
	tokenType: launchTokenTypeSchema.optional(),
});

export type CreateLaunchInput = z.infer<typeof createLaunchSchema>;

export const launchRequestSchema = createLaunchSchema.extend({
	creatorAddress: hexAddressSchema,
	chainId: supportedChainIdSchema.default(DEFAULT_CHAIN_ID),
});

export type LaunchRequest = z.infer<typeof launchRequestSchema>;

export const launchRecordSchema = createLaunchSchema.extend({
	id: z.string().min(1),
	creatorAddress: hexAddressSchema,
	status: launchStatusSchema,
	chainId: supportedChainIdSchema.optional(),
	metadataUri: z.string().min(1).nullable().optional(),
	tokenAddress: hexAddressSchema.optional(),
	createdAt: isoDateTimeSchema,
	updatedAt: isoDateTimeSchema,
});

export type LaunchRecord = z.infer<typeof launchRecordSchema>;

export const launchPrepareResponseSchema = z.object({
	chainId: supportedChainIdSchema,
	portalAddress: hexAddressSchema,
	saltStrategy: z.enum(["worker-todo", "ready"]),
	metadataStrategy: z.enum(["flap-upload-todo", "ready"]),
	params: z.object({
		name: z.string().min(1),
		symbol: z.string().min(1),
		meta: z.string().min(1),
		quoteToken: z.string().min(1),
		taxRate: z.number().int().min(0).max(10_000),
		beneficiary: hexAddressSchema,
	}),
});

export type LaunchPrepareResponse = z.infer<typeof launchPrepareResponseSchema>;
