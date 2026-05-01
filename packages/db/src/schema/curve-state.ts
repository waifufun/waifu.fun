import { boolean, index, numeric, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Per-token bonding curve state, mirroring four.meme's `_tokenInfos` struct.
 * `agent_token` is the BEP20 base token address.
 *
 * Four.meme curve state:
 *   - `offers`    = tokens sold on the bonding curve (base side)
 *   - `funds`     = quote raised so far (denominated in `raised_token`)
 *   - `last_price`= last trade price (quote per base, 1e18 scaled)
 *   - `raised_token` = quote asset address (WBNB for default BNB-curve tokens,
 *                      BEP20 address for BEP20-quoted tokens)
 *   - `status`    = four.meme trading status (TRADING / HALT / ADDING_LIQUIDITY / COMPLETED)
 */
export const curveState = pgTable(
	"curve_state",
	{
		agentToken: varchar("agent_token", { length: 42 }).primaryKey(),
		// Legacy / waifu-internal accounting (kept for backward compat; may be phased out)
		waifuBonded: numeric("waifu_bonded", { precision: 78, scale: 0 }).notNull().default("0"),
		curveLimit: numeric("curve_limit", { precision: 78, scale: 0 }).notNull().default("0"),
		// Four.meme state
		raisedToken: varchar("raised_token", { length: 42 }),
		offers: numeric("offers", { precision: 78, scale: 0 }).notNull().default("0"),
		funds: numeric("funds", { precision: 78, scale: 0 }).notNull().default("0"),
		lastPrice: numeric("last_price", { precision: 78, scale: 0 }),
		status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
		// Graduation
		isGraduated: boolean("is_graduated").notNull().default(false),
		pancakeswapPair: varchar("pancakeswap_pair", { length: 42 }),
		graduatedAt: timestamp("graduated_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		statusIdx: index("idx_curve_state_status").on(table.status),
	}),
);
