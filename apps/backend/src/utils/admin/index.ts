import DB from "@waifufun/database";
import type { AddressLike } from "@waifufun/types";

const parseAdminAddresses = (addressesStr: string | undefined): string[] => {
	console.log("=== parseAdminAddresses ===");
	console.log("Raw ADMIN_ADDRESSES:", addressesStr);

	if (!addressesStr) {
		console.log("No ADMIN_ADDRESSES found, returning empty array");
		return [];
	}

	const addresses = addressesStr.split(",").map((addr) => addr.trim());
	console.log("Parsed admin addresses:", addresses);
	return addresses;
};

export const adminAddresses: string[] = parseAdminAddresses(process.env.ADMIN_ADDRESSES) || [];
console.log("Final adminAddresses array:", adminAddresses);

export interface AdminRole {
	address: AddressLike;
	role: "super_admin" | "admin" | "moderator";
	permissions: string[];
	createdAt: Date;
	createdBy?: AddressLike;
}

export async function isAdmin(address: AddressLike): Promise<boolean> {
	// First check environment variable admins (super admins)
	if (adminAddresses.includes(address)) {
		return true;
	}

	try {
		const adminUser = await DB.User.findOne({
			address,
			adminRole: { $exists: true, $ne: null },
		}).lean();

		return !!adminUser?.adminRole;
	} catch (error) {
		console.error("Error checking admin status:", error);
		return false;
	}
}

export async function hasAdminRole(
	address: AddressLike,
	role: "super_admin" | "admin" | "moderator",
): Promise<boolean> {
	if (adminAddresses.includes(address)) {
		return true;
	}

	try {
		const adminUser = await DB.User.findOne({
			address,
			adminRole: role,
		}).lean();

		return !!adminUser;
	} catch (error) {
		console.error("Error checking admin role:", error);
		return false;
	}
}

export async function hasPermission(address: AddressLike, permission: string): Promise<boolean> {
	console.log("=== hasPermission called ===");
	console.log("Checking permission:", permission);
	console.log("For address:", address);
	console.log("Admin addresses from env:", adminAddresses);

	// Super admins from env vars have all permissions
	if (adminAddresses.includes(address)) {
		console.log("Address found in ADMIN_ADDRESSES - granting all permissions");
		return true;
	}

	console.log("Address not in ADMIN_ADDRESSES, checking database...");

	try {
		const adminUser = await DB.User.findOne({
			address,
			adminRole: { $exists: true, $ne: null },
			adminPermissions: { $in: [permission] },
		}).lean();

		console.log("Database query result:", adminUser);
		console.log("Permission check result:", !!adminUser);

		return !!adminUser;
	} catch (error) {
		console.error("Error checking admin permission:", error);
		return false;
	}
}

export async function getAdminInfo(address: AddressLike): Promise<AdminRole | null> {
	console.log("=== getAdminInfo called ===");
	console.log("Checking address:", address);
	console.log("Admin addresses from env:", adminAddresses);

	// Check if super admin from env vars
	if (adminAddresses.includes(address)) {
		console.log("Address found in ADMIN_ADDRESSES - super admin");
		return {
			address,
			role: "super_admin",
			permissions: ["*"], // All permissions
			createdAt: new Date(),
		};
	}

	console.log("Address not in ADMIN_ADDRESSES, checking database...");

	try {
		const adminUser = await DB.User.findOne({
			address,
			adminRole: { $exists: true, $ne: null },
		}).lean();

		console.log("Database query result:", adminUser);

		if (!adminUser?.adminRole) {
			console.log("No admin role found in database");
			return null;
		}

		console.log("Admin role found:", adminUser.adminRole);
		return {
			address,
			role: adminUser.adminRole,
			permissions: adminUser.adminPermissions || [],
			createdAt: adminUser.adminCreatedAt || new Date(),
			createdBy: adminUser.adminCreatedBy,
		};
	} catch (error) {
		console.error("Error getting admin info:", error);
		return null;
	}
}
