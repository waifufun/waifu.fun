import { defaultRoleTemplates } from "@waifufun/agent-actions";
import { Hono } from "hono";

const app = new Hono();

function serializeTemplates() {
	return Object.fromEntries(
		Object.entries(defaultRoleTemplates).map(([slug, template]) => [
			slug,
			{
				enabled: template.enabled,
				...(template.perTxCap !== undefined ? { perTxCap: template.perTxCap.toString() } : {}),
				...(template.dailyCap !== undefined ? { dailyCap: template.dailyCap.toString() } : {}),
			},
		]),
	);
}

app.get("/templates", (c) => c.json({ templates: serializeTemplates() }));

export default app;
