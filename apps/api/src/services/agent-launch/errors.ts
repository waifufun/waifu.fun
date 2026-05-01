/**
 * Error surface for the agent-launch flow.
 * Kept in its own file so downstream modules (auth/upload/create/orchestrator)
 * can import it without circular deps.
 */

export class FourMemeError extends Error {
	override readonly name = "FourMemeError";
	readonly status: number;
	readonly body: unknown;

	constructor(message: string, status: number, body?: unknown) {
		super(message);
		this.status = status;
		this.body = body;
	}
}

export class AgentLaunchError extends Error {
	override readonly name = "AgentLaunchError";
	readonly step: string;
	override readonly cause: unknown;

	constructor(step: string, message: string, cause?: unknown) {
		super(`[${step}] ${message}`);
		this.step = step;
		this.cause = cause;
	}
}
