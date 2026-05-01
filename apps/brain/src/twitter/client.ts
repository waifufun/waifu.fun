import { TwitterApi } from "twitter-api-v2";

import type { Logger } from "../lib/logger.js";

/**
 * Single-handle Twitter client for v1.
 *
 * The platform owns one X developer app + one user context. Every agent
 * tweet is posted from that handle (e.g. `@waifufun`), with the agent's
 * name/token prefixed into the body. Multi-handle (per-agent OAuth) is
 * a post-MVP problem.
 *
 * If any of the four required credentials are missing, the client enters
 * DRY_RUN mode and logs tweets instead of posting.
 */

export interface TwitterClientOpts {
	logger: Logger;
	apiKey?: string;
	apiSecret?: string;
	accessToken?: string;
	accessSecret?: string;
	/** If true, never actually post — just log. */
	forceDryRun?: boolean;
}

export interface TwitterPostResult {
	ok: boolean;
	id?: string;
	error?: string;
	dryRun: boolean;
}

export class TwitterClient {
	readonly dryRun: boolean;
	private readonly logger: Logger;
	private readonly api: TwitterApi | null;

	constructor(opts: TwitterClientOpts) {
		this.logger = opts.logger;

		const hasCreds = !!opts.apiKey && !!opts.apiSecret && !!opts.accessToken && !!opts.accessSecret;

		if (opts.forceDryRun || !hasCreds) {
			this.dryRun = true;
			this.api = null;
			if (!hasCreds) {
				this.logger.warn(
					"!!! TWITTER DRY RUN MODE: one or more TWITTER_* env vars missing — tweets will be logged only !!!",
				);
			} else {
				this.logger.warn("!!! TWITTER DRY RUN MODE: BRAIN_DRY_RUN=true — tweets will be logged only !!!");
			}
			return;
		}

		this.dryRun = false;
		this.api = new TwitterApi({
			appKey: opts.apiKey as string,
			appSecret: opts.apiSecret as string,
			accessToken: opts.accessToken as string,
			accessSecret: opts.accessSecret as string,
		});
	}

	async post(text: string, ctx: { agentId: string; eventType: string }): Promise<TwitterPostResult> {
		if (this.dryRun || !this.api) {
			this.logger.info(
				{ dryRun: true, agentId: ctx.agentId, eventType: ctx.eventType, text },
				">>> [DRY RUN TWEET] would post",
			);
			return { ok: true, dryRun: true };
		}

		try {
			const res = await this.api.v2.tweet(text);
			const id = res.data?.id;
			this.logger.info(
				{ dryRun: false, agentId: ctx.agentId, eventType: ctx.eventType, tweetId: id, text },
				"twitter: posted",
			);
			return { ok: true, id, dryRun: false };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error({ err, agentId: ctx.agentId, eventType: ctx.eventType }, "twitter: post failed");
			return { ok: false, error: message, dryRun: false };
		}
	}
}

export function createTwitterClientFromEnv(logger: Logger): TwitterClient {
	const forceDryRun = (process.env.BRAIN_DRY_RUN ?? "true").toLowerCase() === "true";
	return new TwitterClient({
		logger,
		apiKey: process.env.TWITTER_API_KEY,
		apiSecret: process.env.TWITTER_API_SECRET,
		accessToken: process.env.TWITTER_ACCESS_TOKEN,
		accessSecret: process.env.TWITTER_ACCESS_SECRET,
		forceDryRun,
	});
}
