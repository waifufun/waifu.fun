import { z } from "zod";

export const addressSchema = z
	.string()
	.trim()
	.regex(/^0x[a-fA-F0-9]{40}$/, "Expected a 20-byte EVM address");

export const decimalStringSchema = z
	.string()
	.trim()
	.regex(/^\d+(?:\.\d+)?$/, "Expected a decimal string amount");

const httpUrlSchema = z
	.string()
	.trim()
	.url()
	.refine((value) => {
		try {
			const parsed = new URL(value);
			return parsed.protocol === "http:" || parsed.protocol === "https:";
		} catch {
			return false;
		}
	}, "Expected an http(s) URL");

export const optionalUrlSchema = z.preprocess(
	(value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
	httpUrlSchema.optional(),
);

export const paginationQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
});
