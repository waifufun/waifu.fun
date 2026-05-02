import { z } from "zod";

export const addressSchema = z
	.string()
	.trim()
	.regex(/^0x[a-fA-F0-9]{40}$/, "Expected a 20-byte EVM address");

export const decimalStringSchema = z
	.string()
	.trim()
	.regex(/^\d+(?:\.\d+)?$/, "Expected a decimal string amount");

export const optionalUrlSchema = z.string().trim().url().optional();

export const paginationQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
});
