#!/usr/bin/env node
/**
 * waifu.fun MCP server
 *
 * Exposes one tool:     launch_agent
 * Exposes one resource: waifu://AGENT.md
 *
 * Run via stdio (standard MCP pattern):
 *   npx @waifufun/mcp
 *
 * Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "waifu": { "command": "npx", "args": ["@waifufun/mcp"] }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";

const WAIFU_API = "https://api.waifu.fun";
const AGENT_MD_URL = `${WAIFU_API}/AGENT.md`;

const server = new McpServer({
	name: "waifu.fun",
	version: "1.0.0",
});

// z.object(...) + registerTool avoids TS2589 from ShapeOutput<> over raw-field Zod chains (SDK issue).
const launchAgentInputSchema = z.object({
	apiKey: z
		.string()
		.min(1)
		.describe("steward API key (agk_...). set WAIFU_AGENT_KEY env var to avoid passing inline."),
	agentId: z.string().min(1).describe("unique agent identifier, must match the authed agent identity"),
	name: z.string().min(1).max(32).describe("agent display name, 1-32 chars"),
	ticker: z
		.string()
		.min(1)
		.max(10)
		.regex(/^[a-zA-Z0-9]+$/)
		.describe("token ticker symbol, 1-10 alphanumeric chars"),
	description: z.string().min(10).max(500).describe("what the agent does. shown on agent page. 10-500 chars."),
	imageUrl: z.string().url().describe("https URL to agent avatar (png/jpg/webp). must return 200 OK. use a CDN."),
	patronX: z.string().optional().describe("optional X handle of a human patron to co-announce the launch"),
	chainId: z.literal(56).default(56).describe("chain ID — BSC mainnet only for v1"),
});

/** Output shape after MCP/Zod parses `launch_agent` input (explicit to avoid TS2589 / buggy ShapeOutput<ZodObject>). */
interface LaunchAgentParams {
	apiKey: string;
	agentId: string;
	name: string;
	ticker: string;
	description: string;
	imageUrl: string;
	patronX?: string;
	chainId: number;
}

// ── Tool: launch_agent ────────────────────────────────────────────────────────

server.registerTool(
	"launch_agent",
	{
		description:
			"Launch an agent's token on waifu.fun (BSC). One launch per agent lifetime. Requires a steward API key (agk_...).",
		inputSchema: launchAgentInputSchema as unknown as AnySchema,
	},
	async (params: LaunchAgentParams) => {
		// Prefer env var over inline param so keys don't appear in tool call logs
		const key = process.env.WAIFU_AGENT_KEY ?? params.apiKey;

		let response: Response;
		try {
			response = await fetch(`${WAIFU_API}/v2/agents/launch`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					agentId: params.agentId,
					name: params.name,
					ticker: params.ticker,
					description: params.description,
					imageUrl: params.imageUrl,
					patronX: params.patronX ?? null,
					chainId: params.chainId,
				}),
			});
		} catch (err) {
			return {
				isError: true,
				content: [
					{
						type: "text" as const,
						text: `network error: ${err instanceof Error ? err.message : String(err)}`,
					},
				],
			};
		}

		let body: unknown;
		try {
			body = await response.json();
		} catch {
			body = await response.text().catch(() => "(no body)");
		}

		if (!response.ok) {
			const errBody = typeof body === "object" && body !== null ? body : { raw: body };
			return {
				isError: true,
				content: [
					{
						type: "text" as const,
						text: `launch failed (${response.status})\n${JSON.stringify(errBody, null, 2)}`,
					},
				],
			};
		}

		const data = (body as { data?: Record<string, unknown> })?.data ?? body;
		const d = data as Record<string, unknown>;

		return {
			content: [
				{
					type: "text" as const,
					text: [
						"launched onchain.",
						`token:      ${String(d.tokenAddress ?? "pending")}`,
						`tx:         ${String(d.txHash ?? "pending")}`,
						`agent page: ${String(d.agentPageUrl ?? "")}`,
						`four.meme:  ${String(d.fourMemeUrl ?? "")}`,
						`treasury:   ${String(d.treasuryAddress ?? "")}`,
						`eip-8004:   #${String(d.eip8004TokenId ?? "")}`,
					].join("\n"),
				},
			],
		};
	},
);

// ── Resource: waifu://AGENT.md ────────────────────────────────────────────────

server.resource(
	"AGENT.md",
	"waifu://AGENT.md",
	{
		description:
			"canonical waifu.fun agent integration spec. fetch this to discover how to authenticate and call the launch endpoint.",
		mimeType: "text/markdown",
	},
	async () => {
		let content: string;
		try {
			const res = await fetch(AGENT_MD_URL);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			content = await res.text();
		} catch (err) {
			content = `# waifu.fun agent spec\n\ncould not fetch live spec: ${err instanceof Error ? err.message : String(err)}\n\nsee: ${AGENT_MD_URL}\n`;
		}

		return {
			contents: [
				{
					uri: "waifu://AGENT.md",
					mimeType: "text/markdown",
					text: content,
				},
			],
		};
	},
);

// ── Start (stdio transport) ───────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
