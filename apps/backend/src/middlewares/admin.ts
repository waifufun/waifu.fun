import type { FastifyRequest, FastifyReply } from "fastify";
import { isAdmin, hasAdminRole, hasPermission } from "../utils/admin";
import type { AddressLike } from "@autofun/types";

declare module "fastify" {
	interface FastifyRequest {
		authUser?: {
			evm?: AddressLike;
			solana?: AddressLike;
		};
	}
}

export async function adminMiddleware(request: FastifyRequest, reply: FastifyReply) {
	const user = request.authUser;

	if (!user?.evm && !user?.solana) {
		return reply.code(401).send({
			success: false,
			error: "Authentication required",
		});
	}

	const address = user.evm || user.solana;
	if (!address) {
		return reply.code(401).send({
			success: false,
			error: "Valid wallet address required",
		});
	}

	const isUserAdmin = await isAdmin(address);
	if (!isUserAdmin) {
		return reply.code(403).send({
			success: false,
			error: "Admin access required",
		});
	}
}

export function requireAdminRole(role: "super_admin" | "admin" | "moderator") {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		const user = request.authUser;

		if (!user?.evm && !user?.solana) {
			return reply.code(401).send({
				success: false,
				error: "Authentication required",
			});
		}

		const address = user.evm || user.solana;
		if (!address) {
			return reply.code(401).send({
				success: false,
				error: "Valid wallet address required",
			});
		}

		const hasRole = await hasAdminRole(address, role);
		if (!hasRole) {
			return reply.code(403).send({
				success: false,
				error: `${role} role required`,
			});
		}
	};
}

export function requirePermission(permission: string) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		const user = request.authUser;

		if (!user?.evm && !user?.solana) {
			return reply.code(401).send({
				success: false,
				error: "Authentication required",
			});
		}

		const address = user.evm || user.solana;

		if (!address) {
			console.log("No valid address found in requirePermission");
			return reply.code(401).send({
				success: false,
				error: "Valid wallet address required",
			});
		}

		const hasUserPermission = await hasPermission(address, permission);

		if (!hasUserPermission) {
			return reply.code(403).send({
				success: false,
				error: `${permission} permission required`,
			});
		}
	};
}
