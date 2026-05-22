import assert from "node:assert/strict";
import test from "node:test";

import { __tweetsCacheInternal, fetchRecentTweets, parseNitterTimeline } from "./tweets.js";

type FetchInput = string | URL | Request;
type FetchInit = RequestInit | undefined;

function mockGlobalFetch(impl: (input: FetchInput, init: FetchInit) => Promise<Response>): () => void {
	const original = globalThis.fetch;
	globalThis.fetch = ((input: FetchInput, init?: FetchInit) => impl(input, init)) as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
}

test("fetchRecentTweets returns twitter-api source when bearer is set", async () => {
	__tweetsCacheInternal.clear();
	process.env.TWITTER_BEARER_TOKEN = "test-bearer";
	const restore = mockGlobalFetch(async (input) => {
		const url = String(input);
		if (url.includes("/users/by/username/")) {
			return new Response(JSON.stringify({ data: { id: "12345" } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		if (url.includes("/users/12345/tweets")) {
			return new Response(
				JSON.stringify({
					data: [
						{
							id: "9999",
							text: "hello world",
							created_at: "2026-05-22T10:00:00.000Z",
							public_metrics: { like_count: 3, reply_count: 1, impression_count: 100 },
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}
		return new Response("not found", { status: 404 });
	});
	try {
		const result = await fetchRecentTweets("0xSolace_", 5);
		assert.ok(result, "expected a result");
		assert.equal(result?.handle, "0xsolace_");
		assert.equal(result?.source, "twitter-api");
		assert.equal(result?.tweets.length, 1);
		assert.equal(result?.tweets[0]?.id, "9999");
		assert.equal(result?.tweets[0]?.likes, 3);
		assert.equal(result?.tweets[0]?.url, "https://x.com/0xsolace_/status/9999");
	} finally {
		restore();
		delete process.env.TWITTER_BEARER_TOKEN;
		__tweetsCacheInternal.clear();
	}
});

test("fetchRecentTweets falls through to empty cached result when all sources fail", async () => {
	__tweetsCacheInternal.clear();
	delete process.env.TWITTER_BEARER_TOKEN;
	const restore = mockGlobalFetch(async () => new Response("fail", { status: 503 }));
	try {
		const result = await fetchRecentTweets("0xsolace_", 5);
		assert.ok(result);
		assert.equal(result?.source, "cached");
		assert.deepEqual(result?.tweets, []);
	} finally {
		restore();
		__tweetsCacheInternal.clear();
	}
});

test("fetchRecentTweets serves cached result when a previous fetch populated cache", async () => {
	__tweetsCacheInternal.clear();
	const seed = {
		handle: "0xsolace_",
		tweets: [
			{
				id: "1",
				text: "cached",
				createdAt: "2026-05-22T00:00:00.000Z",
				url: "https://x.com/0xsolace_/status/1",
				likes: 0,
				replies: 0,
				impressions: 0,
			},
		],
		source: "twitter-api" as const,
		fetchedAt: new Date().toISOString(),
	};
	__tweetsCacheInternal.set("0xsolace_", 5, seed);
	const restore = mockGlobalFetch(async () => new Response("fail", { status: 503 }));
	try {
		const result = await fetchRecentTweets("0xsolace_", 5);
		assert.equal(result?.source, "cached");
		assert.equal(result?.tweets.length, 1);
		assert.equal(result?.tweets[0]?.id, "1");
	} finally {
		restore();
		__tweetsCacheInternal.clear();
	}
});

test("fetchRecentTweets normalizes handles and rejects empty", async () => {
	const result = await fetchRecentTweets("@@@", 5);
	assert.equal(result, null);
});

test("parseNitterTimeline extracts tweet id, text and metrics", () => {
	const html = `
    <div class="timeline-item">
      <div class="tweet-link-wrapper">
        <a class="tweet-link" href="/0xSolace_/status/123#m"></a>
      </div>
      <div class="tweet-body">
        <div class="tweet-header">
          <span class="tweet-date"><a href="/0xSolace_/status/123" title="May 22, 2026 10:00:00 UTC"></a></span>
        </div>
        <div class="tweet-content media-body">hello from nitter</div>
        <div class="tweet-stats">
          <div class="tweet-stat"><span class="icon-comment"></span>2</div>
          <div class="tweet-stat"><span class="icon-heart"></span>17</div>
        </div>
      </div>
    </div>
  </div></div>`;
	const tweets = parseNitterTimeline(html, "0xsolace_", 5);
	assert.equal(tweets.length, 1);
	assert.equal(tweets[0]?.id, "123");
	assert.equal(tweets[0]?.text, "hello from nitter");
	assert.equal(tweets[0]?.likes, 17);
	assert.equal(tweets[0]?.replies, 2);
});
