import { eq } from "drizzle-orm";

import type { Database } from "../client.js";
import { creators } from "../schema/creators.js";

export interface CreatorProfile {
	address: string;
	displayName: string | null;
	bio: string | null;
	twitter: string | null;
	telegram: string | null;
	website: string | null;
	verified: boolean;
	featured: boolean;
}

export interface UpdateCreatorInput {
	displayName?: string | undefined;
	bio?: string | undefined;
	twitter?: string | undefined;
	telegram?: string | undefined;
	website?: string | undefined;
}

// Map DB row to API profile
function mapCreatorProfile(
	row: {
		evmAddress: string | null;
		displayName: string | null;
		twitterHandle: string | null;
		isVerified: boolean;
	},
	address: string,
): CreatorProfile {
	return {
		address: row.evmAddress ?? address,
		displayName: row.displayName,
		bio: null, // Not in current schema, would need to be added
		twitter: row.twitterHandle,
		telegram: null, // Not in current schema, would need to be added
		website: null, // Not in current schema, would need to be added
		verified: row.isVerified,
		featured: false, // Could be derived from adminRole or a new field
	};
}

export async function getCreatorProfile(db: Database, address: string): Promise<CreatorProfile> {
	const normalizedAddress = address.toLowerCase();

	// Try to find existing creator
	const result = await db
		.select({
			evmAddress: creators.evmAddress,
			displayName: creators.displayName,
			twitterHandle: creators.twitterHandle,
			isVerified: creators.isVerified,
		})
		.from(creators)
		.where(eq(creators.evmAddress, normalizedAddress))
		.limit(1);

	if (result.length > 0 && result[0]) {
		return mapCreatorProfile(result[0], normalizedAddress);
	}

	// Creator doesn't exist, create a new one (upsert pattern)
	const [newCreator] = await db
		.insert(creators)
		.values({
			evmAddress: normalizedAddress,
			displayName: null,
			isVerified: false,
		})
		.onConflictDoNothing({ target: creators.evmAddress })
		.returning({
			evmAddress: creators.evmAddress,
			displayName: creators.displayName,
			twitterHandle: creators.twitterHandle,
			isVerified: creators.isVerified,
		});

	// If insert was skipped due to race condition, fetch again
	if (!newCreator) {
		const retryResult = await db
			.select({
				evmAddress: creators.evmAddress,
				displayName: creators.displayName,
				twitterHandle: creators.twitterHandle,
				isVerified: creators.isVerified,
			})
			.from(creators)
			.where(eq(creators.evmAddress, normalizedAddress))
			.limit(1);

		if (retryResult.length > 0 && retryResult[0]) {
			return mapCreatorProfile(retryResult[0], normalizedAddress);
		}

		// Fallback to default profile if something went wrong
		return {
			address: normalizedAddress,
			displayName: null,
			bio: null,
			twitter: null,
			telegram: null,
			website: null,
			verified: false,
			featured: false,
		};
	}

	return mapCreatorProfile(newCreator, normalizedAddress);
}

export async function updateCreatorProfile(
	db: Database,
	address: string,
	input: UpdateCreatorInput,
): Promise<CreatorProfile> {
	const normalizedAddress = address.toLowerCase();

	// Ensure creator exists first
	await getCreatorProfile(db, normalizedAddress);

	// Build update values
	const updateValues: Record<string, string | null> = {};

	if (input.displayName !== undefined) {
		updateValues.displayName = input.displayName;
	}

	if (input.twitter !== undefined) {
		updateValues.twitterHandle = input.twitter;
	}

	// Note: bio, telegram, and website are not in the current schema
	// They would need to be added to the creators table

	// Perform update
	const updated = await db
		.update(creators)
		.set({
			...updateValues,
			updatedAt: new Date(),
		})
		.where(eq(creators.evmAddress, normalizedAddress))
		.returning({
			evmAddress: creators.evmAddress,
			displayName: creators.displayName,
			twitterHandle: creators.twitterHandle,
			isVerified: creators.isVerified,
		});

	if (updated.length === 0 || !updated[0]) {
		// Fallback to fetching the profile if update somehow failed
		return getCreatorProfile(db, normalizedAddress);
	}

	return mapCreatorProfile(updated[0], normalizedAddress);
}
