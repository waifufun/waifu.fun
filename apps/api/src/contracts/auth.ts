import { z } from "zod";

import { addressSchema } from "./common.js";

export const roleSchema = z.enum(["anon", "user", "creator", "admin", "superadmin"]);
export type Role = z.infer<typeof roleSchema>;

export const authPrincipalSchema = z.object({
	address: addressSchema,
	role: roleSchema,
	authSource: z.enum(["dev-bearer", "compat-header", "jwt", "steward"]),
	stewardUserId: z.string().optional(),
});
export type AuthPrincipal = z.infer<typeof authPrincipalSchema>;

export const siweLoginSchema = z.object({
	message: z.string().trim().min(1),
	signature: z.string().trim().min(1),
	address: addressSchema.optional(),
});
export type SiweLoginInput = z.infer<typeof siweLoginSchema>;

export const refreshTokenSchema = z.object({
	refreshToken: z.string().trim().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const rolePriority: Record<Role, number> = {
	anon: 0,
	user: 1,
	creator: 2,
	admin: 3,
	superadmin: 4,
};
