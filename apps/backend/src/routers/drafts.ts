/**
 * /drafts router — CRUD + lifecycle endpoints for WaifuDraft.
 *
 * All routes require authentication (enforced via the protected-routes
 * middleware hook for /drafts/* paths).
 *
 * Routes:
 *   POST   /drafts                    — create a new draft
 *   GET    /drafts                    — list drafts for the authenticated user
 *   GET    /drafts/:id                — get a single draft
 *   PATCH  /drafts/:id                — update a draft (while in draft/rejected status)
 *   POST   /drafts/:id/submit         — submit draft for review
 *   GET    /drafts/:id/activation-payload — preview shaped activation payload
 *   DELETE /drafts/:id                — archive (soft-delete) a draft
 */

import type { FastifyInstance } from "fastify";
import type { AddressLike } from "@autofun/types";
import type {
	CreateDraftBody,
	UpdateDraftBody,
	DraftResponse,
	DraftListResponse,
	DraftStatus,
} from "../types/waifu-draft";
import {
	validateCreatePayload,
	validateForSubmission,
	createDraft,
	getDraft,
	listDrafts,
	updateDraft,
	submitDraft,
	archiveDraft,
	buildActivationPayload,
} from "../services/waifu-draft";

/**
 * Extracts the authenticated wallet address from the request.
 * Prefers solana, falls back to evm.
 */
function getWalletAddress(request: { authUser?: { solana?: AddressLike; evm?: AddressLike } }): AddressLike | null {
	return (request.authUser?.solana ?? request.authUser?.evm ?? null) as AddressLike | null;
}

export default async function draftRoutes(fastify: FastifyInstance) {
	// -----------------------------------------------------------------------
	// POST /drafts — create
	// -----------------------------------------------------------------------
	fastify.post<{
		Body: CreateDraftBody;
		Reply: DraftResponse;
	}>("/", async (request, reply) => {
		const wallet = getWalletAddress(request);
		if (!wallet) {
			return reply.code(401).send({ success: false, error: "Authentication required" });
		}

		const validationError = validateCreatePayload(request.body);
		if (validationError) {
			return reply.code(400).send({ success: false, error: validationError });
		}

		try {
			const draft = await createDraft(wallet, request.body);
			return reply.code(201).send({ success: true, draft });
		} catch (error) {
			console.error("Error creating draft:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error creating draft",
			});
		}
	});

	// -----------------------------------------------------------------------
	// GET /drafts — list
	// -----------------------------------------------------------------------
	fastify.get<{
		Querystring: { page?: string; limit?: string; status?: DraftStatus };
		Reply: DraftListResponse;
	}>("/", async (request, reply) => {
		const wallet = getWalletAddress(request);
		if (!wallet) {
			return reply.code(401).send({ success: false, drafts: [], total: 0, page: 1, totalPages: 0 });
		}

		const query = request.query as { page?: string; limit?: string; status?: DraftStatus };

		try {
			const result = await listDrafts(wallet, {
				page: query.page ? Number.parseInt(query.page, 10) : undefined,
				limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
				status: query.status,
			});
			return { success: true, ...result };
		} catch (error) {
			console.error("Error listing drafts:", error);
			return reply.code(500).send({
				success: false,
				drafts: [],
				total: 0,
				page: 1,
				totalPages: 0,
			});
		}
	});

	// -----------------------------------------------------------------------
	// GET /drafts/:id — get single
	// -----------------------------------------------------------------------
	fastify.get<{
		Params: { id: string };
		Reply: DraftResponse;
	}>("/:id", async (request, reply) => {
		const wallet = getWalletAddress(request);
		if (!wallet) {
			return reply.code(401).send({ success: false, error: "Authentication required" });
		}

		try {
			const draft = await getDraft(request.params.id, wallet);
			if (!draft) {
				return reply.code(404).send({ success: false, error: "Draft not found" });
			}
			return { success: true, draft };
		} catch (error) {
			console.error("Error getting draft:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	// -----------------------------------------------------------------------
	// PATCH /drafts/:id — update
	// -----------------------------------------------------------------------
	fastify.patch<{
		Params: { id: string };
		Body: UpdateDraftBody;
		Reply: DraftResponse;
	}>("/:id", async (request, reply) => {
		const wallet = getWalletAddress(request);
		if (!wallet) {
			return reply.code(401).send({ success: false, error: "Authentication required" });
		}

		try {
			const draft = await updateDraft(request.params.id, wallet, request.body);
			if (!draft) {
				return reply.code(404).send({
					success: false,
					error: "Draft not found or cannot be updated in its current status",
				});
			}
			return { success: true, draft };
		} catch (error) {
			console.error("Error updating draft:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	// -----------------------------------------------------------------------
	// POST /drafts/:id/submit — submit for review
	// -----------------------------------------------------------------------
	fastify.post<{
		Params: { id: string };
		Reply: DraftResponse;
	}>("/:id/submit", async (request, reply) => {
		const wallet = getWalletAddress(request);
		if (!wallet) {
			return reply.code(401).send({ success: false, error: "Authentication required" });
		}

		try {
			// First fetch to validate completeness
			const existing = await getDraft(request.params.id, wallet);
			if (!existing) {
				return reply.code(404).send({ success: false, error: "Draft not found" });
			}

			const validationError = validateForSubmission(existing);
			if (validationError) {
				return reply.code(400).send({ success: false, error: validationError });
			}

			const draft = await submitDraft(request.params.id, wallet);
			if (!draft) {
				return reply.code(409).send({
					success: false,
					error: "Draft cannot be submitted in its current status",
				});
			}
			return { success: true, draft };
		} catch (error) {
			console.error("Error submitting draft:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	// -----------------------------------------------------------------------
	// GET /drafts/:id/activation-payload — preview the shaped payload
	// -----------------------------------------------------------------------
	fastify.get<{
		Params: { id: string };
		Reply: { success: boolean; payload?: Record<string, unknown>; error?: string };
	}>("/:id/activation-payload", async (request, reply) => {
		const wallet = getWalletAddress(request);
		if (!wallet) {
			return reply.code(401).send({ success: false, error: "Authentication required" });
		}

		try {
			const draft = await getDraft(request.params.id, wallet);
			if (!draft) {
				return reply.code(404).send({ success: false, error: "Draft not found" });
			}

			const payload = buildActivationPayload(draft);
			return { success: true, payload };
		} catch (error) {
			console.error("Error building activation payload:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	// -----------------------------------------------------------------------
	// DELETE /drafts/:id — archive
	// -----------------------------------------------------------------------
	fastify.delete<{
		Params: { id: string };
		Reply: { success: boolean; error?: string };
	}>("/:id", async (request, reply) => {
		const wallet = getWalletAddress(request);
		if (!wallet) {
			return reply.code(401).send({ success: false, error: "Authentication required" });
		}

		try {
			const archived = await archiveDraft(request.params.id, wallet);
			if (!archived) {
				return reply.code(404).send({
					success: false,
					error: "Draft not found or cannot be archived in its current status",
				});
			}
			return { success: true };
		} catch (error) {
			console.error("Error archiving draft:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});
}
