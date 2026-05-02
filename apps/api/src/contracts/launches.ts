import { z } from "zod";

import { type addressSchema, decimalStringSchema, optionalUrlSchema } from "./common.js";

export const launchStatusSchema = z.enum([
	"pending",
	"approved",
	"rejected",
	"preparing",
	"awaiting_signature",
	"submitted",
	"launched",
	"provisioned",
	"queued",
	"launching",
	"live",
	"failed",
	"provisioned",
	"queued",
	"launching",
	"live",
]);
export type LaunchStatus = z.infer<typeof launchStatusSchema>;

export const createLaunchSchema = z.object({
	name: z.string().trim().min(1).max(64),
	symbol: z
		.string()
		.trim()
		.min(1)
		.max(16)
		.transform((value) => value.toUpperCase()),
	description: z.string().trim().min(1).max(1000),
	imageUrl: optionalUrlSchema,
	website: optionalUrlSchema,
	twitter: optionalUrlSchema,
	telegram: optionalUrlSchema,
	taxRateBps: z.coerce.number().int().min(0).max(10_000).default(0),
	inviteCode: z.string().trim().min(1).max(64).optional(),
	initialBuyBnb: decimalStringSchema.optional(),
});
export type CreateLaunchInput = z.infer<typeof createLaunchSchema>;

export interface LaunchRecord {
	id: string;
	creatorAddress: z.infer<typeof addressSchema>;
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

export interface LaunchPrepareResponse {
	readiness: "pending_review" | "preparing" | "ready";
	mode: "user-signed";
	chainId: number;
	portalAddress: string;
	metadata: {
		status: "pending" | "compat-placeholder" | "uploaded";
		cid: string | null;
		notes: string[];
	};
	salt: {
		status: "pending" | "compat-placeholder" | "ready";
		value: string | null;
		requiredSuffix: "8888" | "7777";
	};
	params: {
		name: string;
		symbol: string;
		meta: string;
		quoteToken: string;
		taxRate: number;
		beneficiary: string;
		salt: string | null;
		migratorType: "V3_MIGRATOR" | "V2_MIGRATOR";
		dexId: "DEX0";
		lpFeeProfile: "LP_FEE_PROFILE_STANDARD";
	};
	txData?: string;
	estimatedGas?: string;
	nextAction: "await_admin_review" | "await_async_preparation" | "sign_and_submit_transaction";
	notes: string[];
}
