import type { ZodError } from "zod";

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly details?: unknown;

	constructor(status: number, code: string, message: string, details?: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

export function badRequest(code: string, message: string, details?: unknown): ApiError {
	return new ApiError(400, code, message, details);
}

export function unauthorized(message = "Authentication required"): ApiError {
	return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden"): ApiError {
	return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(code: string, message: string, details?: unknown): ApiError {
	return new ApiError(404, code, message, details);
}

export function notImplemented(message: string): ApiError {
	return new ApiError(501, "NOT_IMPLEMENTED", message);
}

export function invalidJson(details?: unknown): ApiError {
	return badRequest("INVALID_JSON", "Request body must be valid JSON", details);
}

export function validationFailed(error: ZodError): ApiError {
	return new ApiError(422, "VALIDATION_ERROR", "Request validation failed", {
		formErrors: error.flatten().formErrors,
		fieldErrors: error.flatten().fieldErrors,
	});
}
