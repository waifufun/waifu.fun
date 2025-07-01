import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { authenticationMiddleware } from "./authentication";
import generationRoutes from "../routers/generation";
import tokenRoutes from "../routers/tokens";
import authRoutes from "../routers/auth";

const protectedPaths = [
	"/generation/generate",
	"/generation/generate-both",
	"/generation/generate-metadata",
	"/tokens/create-metadata",
	"/tokens/create",
	"/chat/message",
	"/user/upload-profile-image",
	"/transactions/claim",
];

export function registerProtectedRoutes(app: FastifyInstance) {
	app.register(generationRoutes);
	app.register(tokenRoutes);

	app.addHook("preHandler", (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
		if (protectedPaths.includes(request.url)) {
			authenticationMiddleware(request, reply);
		}
		done();
	});
}

export function registerPublicRoutes(app: FastifyInstance) {
	app.register(authRoutes, { prefix: "/api/auth" });
}
