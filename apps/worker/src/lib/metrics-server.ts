import { type Server, createServer } from "node:http";

import { metricsRegistry } from "@waifufun/metrics";

import type { Logger } from "pino";

export function startMetricsServer(logger: Logger): Server {
	const port = Number(process.env.WORKER_METRICS_PORT ?? process.env.METRICS_PORT ?? 9101);
	const hostname = process.env.WORKER_METRICS_HOST ?? "0.0.0.0";

	const server = createServer(async (req, res) => {
		if (req.url?.split("?")[0] !== "/metrics") {
			res.writeHead(404, { "content-type": "text/plain" });
			res.end("not found");
			return;
		}

		const apiKey = process.env.METRICS_API_KEY;
		if (apiKey && req.headers.authorization !== `Bearer ${apiKey}`) {
			res.writeHead(401, { "content-type": "text/plain" });
			res.end("unauthorized");
			return;
		}

		res.writeHead(200, { "content-type": metricsRegistry.contentType });
		res.end(await metricsRegistry.metrics());
	});

	server.listen(port, hostname, () => {
		logger.info({ hostname, port }, "worker metrics server listening");
	});

	return server;
}
