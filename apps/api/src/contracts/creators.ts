import { z } from "zod";

import { type addressSchema, optionalUrlSchema } from "./common.js";

export const updateCreatorSchema = z.object({
	displayName: z.string().trim().min(1).max(64).optional(),
	bio: z.string().trim().max(500).optional(),
	twitter: optionalUrlSchema,
	telegram: optionalUrlSchema,
	website: optionalUrlSchema,
});
export type UpdateCreatorInput = z.infer<typeof updateCreatorSchema>;

export interface CreatorProfile {
	address: z.infer<typeof addressSchema>;
	displayName: string | null;
	bio: string | null;
	twitter: string | null;
	telegram: string | null;
	website: string | null;
	verified: boolean;
	featured: boolean;
}
