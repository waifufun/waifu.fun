import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { authenticationMiddleware } from "./authentication";
import generationRoutes from "../routers/generation";
import tokenRoutes from "../routers/tokens";
import authRoutes from "../routers/auth";
import adminRoutes from "../routers/admin";
import ownerRoutes from "../routers/owner";

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
	app.register(adminRoutes, { prefix: "/admin" });
	app.register(ownerRoutes, { prefix: "/owner" });

	app.addHook("preHandler", (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
		// Check if it's a protected path, admin route, or owner route
		const isProtectedPath = protectedPaths.includes(request.url);
		const isAdminRoute = request.url.startsWith("/admin");
		const isOwnerRoute = request.url.startsWith("/owner");

		if (isProtectedPath || isAdminRoute || isOwnerRoute) {
			authenticationMiddleware(request, reply);
		}
		done();
	});
}

export function registerPublicRoutes(app: FastifyInstance) {
	app.register(authRoutes, { prefix: "/api/auth" });
}
