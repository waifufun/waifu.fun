import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import adminAgentRoutes, { __setAdminAgentsDbForTest } from "../src/routes/v2/admin-agents.ts";

const ADMIN_KEY = "test-admin-key";
const AGENT_ID = "waifu-test-agent";

type ControlRow = {
	agentId: string;
	brainPausedAt: Date | null;
	brainPausedReason: string | null;
	withdrawalsPausedAt: Date | null;
	withdrawalsPausedReason: string | null;
	killedAt: Date | null;
	killedReason: string | null;
	updatedAt: Date;
};

function freshRow(): ControlRow {
	return {
		agentId: AGENT_ID,
		brainPausedAt: null,
		brainPausedReason: null,
		withdrawalsPausedAt: null,
		withdrawalsPausedReason: null,
		killedAt: null,
		killedReason: null,
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	};
}

function createFakeDb(initial: ControlRow | null = freshRow()) {
	let row = initial;
	const events: Array<Record<string, unknown>> = [];

	const db = {
		select() {
			return {
				from() {
					return this;
				},
				where() {
					return this;
				},
				limit() {
					return row ? [{ ...row }] : [];
				},
			};
		},
		update() {
			let patch: Partial<ControlRow> = {};
			return {
				set(next: Partial<ControlRow>) {
					patch = next;
					return this;
				},
				where() {
					return this;
				},
				returning() {
					if (!row) return [];
					row = { ...row, ...patch };
					return [{ ...row }];
				},
			};
		},
		insert() {
			return {
				values(value: Record<string, unknown>) {
					return {
						returning() {
							const event = {
								id: `event-${events.length + 1}`,
								...value,
								status: "pending",
								attempts: 0,
								errorMessage: null,
								createdAt: new Date(),
								processedAt: null,
							};
							events.push(event);
							return [event];
						},
					};
				},
			};
		},
	};

	return {
		db,
		events,
		row: () => row,
	};
}

async function request(path: string, init: RequestInit & { admin?: boolean; wrongAdmin?: boolean } = {}) {
	const headers = new Headers(init.headers);
	if (init.admin) headers.set("authorization", `Bearer ${ADMIN_KEY}`);
	if (init.wrongAdmin) headers.set("authorization", "Bearer nope");
	if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

	return adminAgentRoutes.fetch(
		new Request(`http://unit.test${path}`, {
			...init,
			headers,
		}),
	);
}

async function json(res: Response) {
	return (await res.json()) as { ok: boolean; data?: Record<string, unknown>; error?: string };
}

describe("v2 admin agent pause controls", () => {
	beforeEach(() => {
		process.env.ADMIN_API_KEY = ADMIN_KEY;
	});

	afterEach(() => {
		__setAdminAgentsDbForTest(undefined);
		delete process.env.ADMIN_API_KEY;
	});

	it("enforces admin bearer auth before touching the database", async () => {
		const fake = createFakeDb();
		__setAdminAgentsDbForTest(fake.db as never);

		const missing = await request(`/${AGENT_ID}/state`);
		assert.equal(missing.status, 401);

		const wrong = await request(`/${AGENT_ID}/state`, { wrongAdmin: true });
		assert.equal(wrong.status, 403);
	});

	it("covers all admin state routes and emits moderation events", async () => {
		const fake = createFakeDb();
		__setAdminAgentsDbForTest(fake.db as never);

		let res = await request(`/${AGENT_ID}/brain/pause`, {
			method: "POST",
			admin: true,
			body: JSON.stringify({ reason: "bad tweet loop" }),
		});
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.brainPausedReason, "bad tweet loop");
		assert.equal((await json(res)).data?.brainPaused, true);

		res = await request(`/${AGENT_ID}/brain/resume`, { method: "POST", admin: true });
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.brainPausedAt, null);

		res = await request(`/${AGENT_ID}/withdrawals/pause`, {
			method: "POST",
			admin: true,
			body: JSON.stringify({ reason: "adapter review" }),
		});
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.withdrawalsPausedReason, "adapter review");

		res = await request(`/${AGENT_ID}/withdrawals/resume`, { method: "POST", admin: true });
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.withdrawalsPausedAt, null);

		res = await request(`/${AGENT_ID}/pause`, {
			method: "POST",
			admin: true,
			body: JSON.stringify({ reason: "full moderation pause" }),
		});
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.brainPausedReason, "full moderation pause");
		assert.equal(fake.row()?.withdrawalsPausedReason, "full moderation pause");

		res = await request(`/${AGENT_ID}/resume`, { method: "POST", admin: true });
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.brainPausedAt, null);
		assert.equal(fake.row()?.withdrawalsPausedAt, null);

		res = await request(`/${AGENT_ID}/kill`, {
			method: "POST",
			admin: true,
			body: JSON.stringify({ reason: "irrecoverable compromise" }),
		});
		assert.equal(res.status, 200);
		const killed = await json(res);
		assert.equal(killed.data?.killed, true);
		assert.equal(killed.data?.brainPaused, true);
		assert.equal(killed.data?.withdrawalsPaused, true);

		res = await request(`/${AGENT_ID}/state`, { admin: true });
		assert.equal(res.status, 200);
		const state = await json(res);
		assert.equal(state.data?.killed, true);
		assert.equal(state.data?.killedReason, "irrecoverable compromise");

		res = await request(`/${AGENT_ID}/brain/pause`, { method: "POST", admin: true });
		assert.equal(res.status, 409);

		res = await request(`/${AGENT_ID}/kill`, { method: "POST", admin: true });
		assert.equal(res.status, 409);

		assert.deepEqual(
			fake.events.map((event) => event.type),
			[
				"agent.paused",
				"agent.resumed",
				"agent.paused",
				"agent.resumed",
				"agent.paused",
				"agent.resumed",
				"agent.killed",
			],
		);
	});
});
