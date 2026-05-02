import { Hono } from "hono";

const app = new Hono();

// V2 staking routes - placeholder (schema migration pending)
app.get("/stats", (c) =>
	c.json({
		totalStaked: "0",
		estimatedAPY: "0",
		totalDistributed: "0",
		stakerCount: 0,
		note: "v2 staking not yet available",
	}),
);

app.get("/:address", (c) => c.json({ stakedAmount: "0", earnedRewards: "0", veWaifuBalance: "0" }));

export default app;
