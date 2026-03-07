import logger from "@waifufun/logger";
import Mongoose from "mongoose";
import Token from "../../../../packages/database/src/models/token";

const mongoUri = process.env.MONGODB_URI ?? process.env.MONGO_URI;

const missingFieldFilter = {
	$or: [
		{ launchType: { $exists: false } },
		{ launchType: null },
		{ launchPlatform: { $exists: false } },
		{ launchPlatform: null },
		{ agentStatus: { $exists: false } },
		{ agentStatus: null },
		{ ownerClaimStatus: { $exists: false } },
		{ ownerClaimStatus: null },
	],
};

async function main() {
	if (!mongoUri) {
		throw new Error("Missing MONGODB_URI or MONGO_URI in environment");
	}

	Mongoose.set("strictQuery", false);

	logger.info("Connecting to MongoDB for token field migration...");
	await Mongoose.connect(mongoUri, {
		socketTimeoutMS: 15_000,
	});

	const totalTokens = await Token.countDocuments();
	const tokensToUpdate = await Token.countDocuments(missingFieldFilter);

	logger.info({ totalTokens, tokensToUpdate }, "Calculated token backfill scope");

	if (tokensToUpdate === 0) {
		logger.info("Token field migration already up to date. No documents changed.");
		return;
	}

	const result = await Token.updateMany(missingFieldFilter, [
		{
			$set: {
				launchType: {
					$ifNull: ["$launchType", { $cond: [{ $eq: ["$imported", true] }, "imported", "native"] }],
				},
				launchPlatform: {
					$ifNull: ["$launchPlatform", { $cond: [{ $eq: ["$imported", true] }, "external", "pump"] }],
				},
				agentStatus: {
					$ifNull: ["$agentStatus", "none"],
				},
				ownerClaimStatus: {
					$ifNull: [
						"$ownerClaimStatus",
						{ $cond: [{ $ne: [{ $ifNull: ["$creator", null] }, null] }, "claimed", "unclaimed"] },
					],
				},
			},
		},
	]);

	logger.info(
		{
			matchedCount: result.matchedCount,
			modifiedCount: result.modifiedCount,
			acknowledged: result.acknowledged,
		},
		"Token field migration completed",
	);
}

main()
	.catch((error) => {
		logger.error({ err: error }, "Token field migration failed");
		process.exitCode = 1;
	})
	.finally(async () => {
		await Mongoose.disconnect();
	});
