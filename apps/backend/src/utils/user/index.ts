import type { AddressLike } from "@autofun/types";
import DB from "@autofun/database";
import { getChecksummedAddress } from "@autofun/utils";
import logger from "@autofun/logger";

export async function getOrCreateUser({ address }: { address: AddressLike }) {
	try {
        
		let user = await DB.User.findOne({ address: getChecksummedAddress(address, "solana") }).lean();

		if (user) {
			console.log("User found:", user._id);
			return user;
		}

		logger.warn("No user found. Creating new user...");


		user = await DB.User.create({
			address,
			suspended: false,
			displayName: address.slice(0, 4),
			avatar: "",
			verified: false,
			twitter: "",
			points: 0,
		});

		logger.info("[getOrCreateUser] New user created with ID:", user._id);

		return user;
	} catch (err) {
		logger.error("[getOrCreateUser] Error occurred:", err);
		throw new Error("Failed to get or create user");
	}
}
