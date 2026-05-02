import { type ChainKey, DEFAULT_CHAIN_ID, type SupportedChainId, supportedChainIdSchema } from "@waifufun/config";
import { z } from "zod";

export type HexAddress = `0x${string}`;
export type HexHash = `0x${string}`;
export type HexData = `0x${string}`;

export { DEFAULT_CHAIN_ID, supportedChainIdSchema };
export type { ChainKey, SupportedChainId };

export const hexAddressSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{40}$/)
	.transform((value) => value.toLowerCase() as HexAddress);

export const hexHashSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{64}$/)
	.transform((value) => value.toLowerCase() as HexHash);

export const hexDataSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]*$/)
	.transform((value) => value.toLowerCase() as HexData);

export const numericStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/, {
	message: "Expected a numeric string",
});

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();

export const socialLinksSchema = z.object({
	website: z.string().url().nullable().default(null),
	twitter: z.string().url().nullable().default(null),
	telegram: z.string().url().nullable().default(null),
});

export const socialLinksInputSchema = z.object({
	website: z.string().url().optional(),
	twitter: z.string().url().optional(),
	telegram: z.string().url().optional(),
});

export type SocialLinks = z.infer<typeof socialLinksSchema>;
export type SocialLinksInput = z.infer<typeof socialLinksInputSchema>;
