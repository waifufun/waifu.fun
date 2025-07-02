import DB from "@autofun/database";
import type { AddressLike } from "@autofun/types";

const parseAdminAddresses = (addressesStr: string | undefined): string[] => {
	if (!addressesStr) return [];
	return addressesStr.split(",").map((addr) => addr.trim());
};

export const adminAddresses: string[] = parseAdminAddresses(process.env.ADMIN_ADDRESSES) || [];

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
	// Super admins from env vars have all permissions
	if (adminAddresses.includes(address)) {
		return true;
	}

	try {
		const adminUser = await DB.User.findOne({
			address,
			adminPermissions: permission,
		}).lean();

		return !!adminUser;
	} catch (error) {
		console.error("Error checking admin permission:", error);
		return false;
	}
}

export async function getAdminInfo(address: AddressLike): Promise<AdminRole | null> {
	// Check if super admin from env vars
	if (adminAddresses.includes(address)) {
		return {
			address,
			role: "super_admin",
			permissions: ["*"], // All permissions
			createdAt: new Date(),
		};
	}

	try {
		const adminUser = await DB.User.findOne({
			address,
			adminRole: { $exists: true, $ne: null },
		}).lean();

		if (!adminUser?.adminRole) return null;

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
