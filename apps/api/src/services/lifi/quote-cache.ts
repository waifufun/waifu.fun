/**
 * Tiny in-process LRU+TTL cache for Li.Fi quote responses. Phase 2 budget
 * is 30s freshness (quotes go stale fast) and the cache is keyed by the
 * full request shape so two patrons asking the same question collapse to
 * one upstream call.
 *
 * Deliberately not Redis-backed for MVP: the quote payload is large, the
 * blast radius of a stale-quote signing is owned by the patron, and the
 * widget already re-quotes when a quote is older than 30s on the client
 * side. Move to Redis if we see >1 instance of the API behind a load
 * balancer.
 */

const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 256;

interface CacheEntry<V> {
	value: V;
	expiresAt: number;
}

export class QuoteCache<V> {
	private readonly store = new Map<string, CacheEntry<V>>();
	private readonly ttlMs: number;

	constructor(ttlMs: number = DEFAULT_TTL_MS) {
		this.ttlMs = ttlMs;
	}

	get(key: string): V | null {
		const hit = this.store.get(key);
		if (!hit) return null;
		if (hit.expiresAt <= Date.now()) {
			this.store.delete(key);
			return null;
		}
		this.store.delete(key);
		this.store.set(key, hit);
		return hit.value;
	}

	set(key: string, value: V): void {
		if (this.store.size >= MAX_ENTRIES) {
			const oldest = this.store.keys().next().value;
			if (oldest !== undefined) this.store.delete(oldest);
		}
		this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
	}

	clear(): void {
		this.store.clear();
	}
}
