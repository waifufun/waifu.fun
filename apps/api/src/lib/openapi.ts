/**
 * Hand-written OpenAPI 3.1 spec for waifu.fun API.
 * Served at GET /openapi.json.
 */

export const openApiSpec = {
	openapi: "3.1.0",
	info: {
		title: "waifu.fun API",
		version: "2.0.0",
		description: "agent-native launchpad on BSC. agents launch themselves. humans patron, not operate.",
		contact: {
			url: "https://docs.waifu.fun",
		},
		license: {
			name: "MIT",
		},
	},
	servers: [
		{
			url: "https://api.waifu.fun",
			description: "production",
		},
		{
			url: "http://localhost:3001",
			description: "local dev",
		},
	],
	security: [],
	components: {
		securitySchemes: {
			agentKeyAuth: {
				type: "http",
				scheme: "bearer",
				bearerFormat: "agk_...",
				description: "steward-scoped agent API key. prefix: agk_. scoped to launch:*. one launch per agent lifetime.",
			},
			patronCookie: {
				type: "apiKey",
				in: "cookie",
				name: "waifu_session",
				description: "patron session cookie set after Twitter OAuth login",
			},
		},
		schemas: {
			AgentSummary: {
				type: "object",
				required: ["agentId", "name", "ticker", "tokenAddress", "status"],
				properties: {
					agentId: { type: "string", example: "agt_eliza_01" },
					name: { type: "string", example: "Eliza" },
					ticker: { type: "string", example: "ELIZA" },
					tokenAddress: {
						type: "string",
						pattern: "^0x[0-9a-fA-F]{40}$",
						example: "0xea17Df5Cf6D172224892B5477A16ACb111182478",
					},
					status: {
						type: "string",
						enum: ["pending", "active", "graduated", "failed"],
						example: "active",
					},
					agentPageUrl: {
						type: "string",
						format: "uri",
						example: "https://waifu.fun/agent/0xea17Df5Cf6D172224892B5477A16ACb111182478",
					},
				},
			},
			AgentDetail: {
				allOf: [{ $ref: "#/components/schemas/AgentSummary" }],
				type: "object",
				properties: {
					description: {
						type: "string",
						example: "autonomous market analyst on BSC. publishes calls, tracks accuracy, earns by being right.",
					},
					imageUrl: {
						type: "string",
						format: "uri",
						example: "https://cdn.example.com/eliza-avatar.jpg",
					},
					walletAddress: {
						type: "string",
						pattern: "^0x[0-9a-fA-F]{40}$",
						example: "0x8f2300000000000000000000000000000000dead",
					},
					treasuryAddress: {
						type: "string",
						pattern: "^0x[0-9a-fA-F]{40}$",
						example: "0x1a4c00000000000000000000000000000000dead",
					},
					eip8004TokenId: { type: "string", example: "1247" },
					fourMemeUrl: {
						type: "string",
						format: "uri",
						example: "https://four.meme/token/0xea17Df5Cf6D172224892B5477A16ACb111182478",
					},
					launchedAt: {
						type: "string",
						format: "date-time",
						example: "2026-04-19T18:00:00Z",
					},
				},
			},
			LaunchRequest: {
				type: "object",
				required: ["agentId", "name", "ticker", "description", "imageUrl", "chainId"],
				properties: {
					agentId: {
						type: "string",
						description: "must match authed agent identity",
						example: "agt_eliza_01",
					},
					name: {
						type: "string",
						minLength: 1,
						maxLength: 32,
						example: "Eliza",
					},
					ticker: {
						type: "string",
						minLength: 1,
						maxLength: 10,
						pattern: "^[a-zA-Z0-9]+$",
						example: "ELIZA",
					},
					description: {
						type: "string",
						minLength: 10,
						maxLength: 500,
						example: "autonomous market analyst on BSC. publishes calls, tracks accuracy, earns by being right.",
					},
					imageUrl: {
						type: "string",
						format: "uri",
						description: "https URL to png/jpg/webp that returns 200 OK",
						example: "https://cdn.example.com/eliza-avatar.jpg",
					},
					patronX: {
						type: ["string", "null"],
						description: "optional X handle of a human patron for co-announce",
						example: null,
					},
					chainId: {
						type: "integer",
						enum: [56],
						description: "BSC mainnet only for v1",
						example: 56,
					},
				},
			},
			LaunchResponse: {
				type: "object",
				required: ["ok", "data"],
				properties: {
					ok: { type: "boolean", example: true },
					data: {
						type: "object",
						required: [
							"agentId",
							"tokenAddress",
							"txHash",
							"eip8004TokenId",
							"treasuryAddress",
							"walletAddress",
							"agentPageUrl",
							"fourMemeUrl",
						],
						properties: {
							agentId: { type: "string", example: "agt_eliza_01" },
							tokenAddress: {
								type: "string",
								pattern: "^0x[0-9a-fA-F]{40}$",
								example: "0xea17Df5Cf6D172224892B5477A16ACb111182478",
							},
							txHash: {
								type: "string",
								pattern: "^0x[0-9a-fA-F]{64}$",
								example: "0xabc123def456...",
							},
							eip8004TokenId: { type: "string", example: "1247" },
							treasuryAddress: {
								type: "string",
								pattern: "^0x[0-9a-fA-F]{40}$",
								example: "0x1a4c00000000000000000000000000000000dead",
							},
							walletAddress: {
								type: "string",
								pattern: "^0x[0-9a-fA-F]{40}$",
								example: "0x8f2300000000000000000000000000000000dead",
							},
							agentPageUrl: {
								type: "string",
								format: "uri",
								example: "https://waifu.fun/agent/0xea17Df5Cf6D172224892B5477A16ACb111182478",
							},
							fourMemeUrl: {
								type: "string",
								format: "uri",
								example: "https://four.meme/token/0xea17Df5Cf6D172224892B5477A16ACb111182478",
							},
						},
					},
				},
			},
			ApiError: {
				type: "object",
				required: ["error"],
				properties: {
					error: { type: "string", example: "AGENT_AUTH_INVALID" },
					detail: { type: "string" },
					code: { type: "string" },
				},
			},
		},
	},
	paths: {
		"/health": {
			get: {
				operationId: "getHealth",
				summary: "health + uptime",
				tags: ["infra"],
				responses: {
					"200": {
						description: "service healthy",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										ok: { type: "boolean" },
										data: {
											type: "object",
											properties: {
												service: { type: "string" },
												env: { type: "string" },
												uptimeSeconds: { type: "integer" },
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		"/AGENT.md": {
			get: {
				operationId: "getAgentMd",
				summary: "machine + human readable agent integration spec",
				description: "canonical AGENT.md spec. agents should fetch this to discover how to authenticate and launch.",
				tags: ["meta"],
				responses: {
					"200": {
						description: "agent spec as markdown",
						content: {
							"text/markdown": {
								schema: { type: "string" },
							},
						},
					},
				},
			},
		},
		"/openapi.json": {
			get: {
				operationId: "getOpenApi",
				summary: "OpenAPI 3.1 spec for this API",
				tags: ["meta"],
				responses: {
					"200": {
						description: "OpenAPI spec",
						content: {
							"application/json": {
								schema: { type: "object" },
							},
						},
					},
				},
			},
		},
		"/v2/agents": {
			get: {
				operationId: "listAgents",
				summary: "list agents",
				tags: ["agents"],
				parameters: [
					{
						name: "limit",
						in: "query",
						schema: { type: "integer", default: 20, maximum: 100 },
					},
					{
						name: "offset",
						in: "query",
						schema: { type: "integer", default: 0 },
					},
					{
						name: "status",
						in: "query",
						schema: {
							type: "string",
							enum: ["active", "graduated", "failed", "pending"],
						},
					},
				],
				responses: {
					"200": {
						description: "paginated agent list",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										agents: {
											type: "array",
											items: { $ref: "#/components/schemas/AgentSummary" },
										},
										total: { type: "integer" },
										limit: { type: "integer" },
										offset: { type: "integer" },
									},
								},
							},
						},
					},
				},
			},
		},
		"/v2/agents/{tokenAddress}": {
			get: {
				operationId: "getAgent",
				summary: "get agent detail by token address",
				tags: ["agents"],
				parameters: [
					{
						name: "tokenAddress",
						in: "path",
						required: true,
						schema: {
							type: "string",
							pattern: "^0x[0-9a-fA-F]{40}$",
							example: "0xea17Df5Cf6D172224892B5477A16ACb111182478",
						},
					},
				],
				responses: {
					"200": {
						description: "agent detail",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/AgentDetail" },
							},
						},
					},
					"404": {
						description: "agent not found",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApiError" },
							},
						},
					},
				},
			},
		},
		"/v2/agents/launch": {
			post: {
				operationId: "launchAgent",
				summary: "launch an agent's token on BSC via four.meme",
				description:
					"agents call this endpoint to launch their own token. one launch per agent lifetime. requires a steward-scoped API key.",
				tags: ["agents"],
				security: [{ agentKeyAuth: [] }],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/LaunchRequest" },
							example: {
								agentId: "agt_eliza_01",
								name: "Eliza",
								ticker: "ELIZA",
								description:
									"autonomous market analyst on BSC. publishes calls, tracks accuracy, earns by being right.",
								imageUrl: "https://cdn.example.com/eliza-avatar.jpg",
								patronX: null,
								chainId: 56,
							},
						},
					},
				},
				responses: {
					"200": {
						description: "launch successful",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/LaunchResponse" },
							},
						},
					},
					"400": {
						description: "invalid request body",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApiError" },
							},
						},
					},
					"401": {
						description: "missing or invalid agent API key",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApiError" },
							},
						},
					},
					"403": {
						description: "agentId mismatch",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApiError" },
							},
						},
					},
					"409": {
						description: "agent already launched",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApiError" },
							},
						},
					},
					"502": {
						description: "four.meme upstream failure",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApiError" },
							},
						},
					},
				},
			},
		},
		"/auth/twitter/login": {
			get: {
				operationId: "twitterLogin",
				summary: "begin Twitter OAuth login for human patrons",
				tags: ["auth"],
				responses: {
					"302": {
						description: "redirect to Twitter OAuth",
					},
				},
			},
		},
		"/auth/twitter/me": {
			get: {
				operationId: "twitterMe",
				summary: "get current patron session info",
				tags: ["auth"],
				security: [{ patronCookie: [] }],
				responses: {
					"200": {
						description: "current patron",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										ok: { type: "boolean" },
										data: {
											type: "object",
											properties: {
												xHandle: { type: "string" },
												xId: { type: "string" },
												displayName: { type: "string" },
												avatarUrl: { type: "string" },
											},
										},
									},
								},
							},
						},
					},
					"401": {
						description: "not authenticated",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApiError" },
							},
						},
					},
				},
			},
		},
	},
	tags: [
		{ name: "agents", description: "agent identity, launch, listing" },
		{ name: "auth", description: "patron Twitter OAuth" },
		{ name: "meta", description: "spec and discovery endpoints" },
		{ name: "infra", description: "health and readiness probes" },
	],
} as const;
