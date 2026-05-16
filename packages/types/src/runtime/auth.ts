import { z } from "zod";

import { hexAddressSchema } from "./common.js";
import { creatorRoleSchema } from "./creator.js";

export const roleSchema = creatorRoleSchema;
export type Role = z.infer<typeof roleSchema>;

export const authPrincipalSchema = z.object({
	address: hexAddressSchema,
	role: roleSchema.default("user"),
});

export type AuthPrincipal = z.infer<typeof authPrincipalSchema>;

export const authSessionSchema = z.object({
	subject: hexAddressSchema,
	role: roleSchema,
	accessTokenTtlSeconds: z.number().int().positive(),
	refreshTokenTtlSeconds: z.number().int().positive(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

export const siweLoginSchema = z.object({
	message: z.string().trim().min(1),
	signature: z.string().trim().min(1),
	address: hexAddressSchema,
});

export type SiweLoginInput = z.infer<typeof siweLoginSchema>;

export const refreshTokenSchema = z.object({
	refreshToken: z.string().trim().min(1),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const authTokenPairSchema = z.object({
	accessToken: z.string().min(1),
	refreshToken: z.string().min(1),
	expiresIn: z.number().int().positive(),
});

export type AuthTokenPair = z.infer<typeof authTokenPairSchema>;
