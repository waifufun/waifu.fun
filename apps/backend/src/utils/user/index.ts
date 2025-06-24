import type { AddressLike } from "@autofun/types";
import DB from "@autofun/database";
import { getChecksummedAddress } from "@autofun/utils";

export async function getOrCreateUser({ address }: { address: AddressLike }) {
	try {
		console.log("[getOrCreateUser] Checking for existing user with address:", address);

		let user = await DB.User.findOne({ address: getChecksummedAddress(address, "solana") }).lean();

		if (user) {
			console.log("[getOrCreateUser] User found:", user._id);
			return user;
		}

		console.log("[getOrCreateUser] No user found. Creating new user...");
		// first starting wallet address will be displayName

		user = await DB.User.create({
			address,
			suspended: false,
			displayName: address.slice(0, 4),
			avatar: "",
			verified: false,
			twitter: "",
			points: 0,
		});

		console.log("[getOrCreateUser] New user created with ID:", user._id);

		return user;
	} catch (err) {
		console.error("[getOrCreateUser] Error occurred:", err);
		throw new Error("Failed to get or create user");
	}
}
