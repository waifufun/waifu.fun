import type { FastifyReply, FastifyRequest } from "fastify";
import type { AddressLike } from "@waifufun/types";
import { launchGateService } from "../services/launch-gate";

declare module "fastify" {
	interface FastifyRequest {
		launchGate?: {
			inviteCode?: string;
			grantedBy: "allowlist" | "invite";
			consumeInviteCode?: boolean;
		};
		authUser?: {
			evm?: AddressLike;
			solana?: AddressLike;
		};
	}
}

function extractInviteCode(request: FastifyRequest): string | undefined {
	const query = request.query as { inviteCode?: string } | undefined;
	const body = request.body as { inviteCode?: string } | undefined;
	return body?.inviteCode || query?.inviteCode;
}

export async function launchGatePreHandler(request: FastifyRequest, reply: FastifyReply) {
	if (!launchGateService.isEnabled()) {
		return;
	}

	const walletAddress = request.authUser?.solana || request.authUser?.evm;
	if (!walletAddress) {
		return reply.code(401).send({
			success: false,
			error: "Authentication required",
		});
	}

	const allowlistResult = await launchGateService.canCreate(walletAddress);
	if (allowlistResult.allowed) {
		request.launchGate = {
			grantedBy: "allowlist",
			consumeInviteCode: false,
		};
		return;
	}

	const inviteCode = extractInviteCode(request);
	if (!inviteCode) {
		return reply.code(403).send({
			success: false,
			error: allowlistResult.reason || "Curated launch access required",
		});
	}

	const inviteValidation = await launchGateService.validateInviteCode(inviteCode);
	if (!inviteValidation.valid) {
		return reply.code(403).send({
			success: false,
			error: "Invalid or exhausted invite code",
		});
	}

	request.launchGate = {
		inviteCode,
		grantedBy: "invite",
		consumeInviteCode: true,
	};
}
