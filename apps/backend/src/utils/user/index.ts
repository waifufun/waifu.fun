import type { AddressLike, TChain } from "@autofun/types";
import DB from "@autofun/database";
import { getChecksummedAddress } from "@autofun/utils";
import logger from "@autofun/logger";

export async function getOrCreateUser({ address, chain }: { address: AddressLike, chain: TChain }) {
	try {
		let checksummedAddress: string;

		if (chain === "evm") {
			checksummedAddress = getChecksummedAddress(address, "evm");
		} else if (chain === "solana") {
			checksummedAddress = getChecksummedAddress(address, "solana");
		} else {
			throw new Error(`Unsupported chain: ${chain}`);
		}
		
		let user = await DB.User.findOne({ address: checksummedAddress }).lean();

		if (user) {
			console.log("User found:", user._id);
			return user;
		}

		logger.info("No user found. Creating new user...");

		user = await DB.User.create({
			address: address,
			suspended: false,
			displayName: address.slice(0, 4),
			avatar: "",
			verified: false,
			twitter: "",
			points: 0,
		});


		return user;
	} catch (err) {
		logger.error("Error occurred:", err);
		throw new Error("Failed to get or create user");
	}
}
