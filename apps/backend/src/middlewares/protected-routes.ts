import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { authenticationMiddleware } from "./authentication";
import generationRoutes from "../routers/generation";
import authRoutes from "../routers/auth";

const protectedPaths = [
	"/api/generation/generate",
	"/api/generation/generate-both",
	"/api/generation/generate-metadata",
];

export function registerProtectedRoutes(app: FastifyInstance) {
	app.register(generationRoutes, {
		prefix: "/api/generation",
		preHandler: (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
			if (protectedPaths.includes(request.url)) {
				authenticationMiddleware(request, reply);
			}
			done();
		},
	});
}

export function registerPublicRoutes(app: FastifyInstance) {
	app.register(authRoutes, { prefix: "/api/auth" });
} 