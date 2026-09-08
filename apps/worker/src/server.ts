import http from "node:http";
import { pool } from "./db.js";
import { logger } from "./logger.js";
import { env } from "./env.js";

interface WorkerStats {
  bootTime: Date;
  processedCount: number;
  failedCount: number;
  currentJobId: string | null;
  lastHeartbeat: Date | null;
}

export const workerStats: WorkerStats = {
  bootTime: new Date(),
  processedCount: 0,
  failedCount: 0,
  currentJobId: null,
  lastHeartbeat: null,
};

export function startHealthServer(port = Number(process.env.WORKER_PORT || process.env.PORT || 3001)): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health" || url.pathname === "/") {
      try {
        // Test database connectivity
        await pool.query("SELECT 1");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "healthy",
            uptimeSeconds: Math.floor((Date.now() - workerStats.bootTime.getTime()) / 1000),
            currentJobId: workerStats.currentJobId,
            lastHeartbeat: workerStats.lastHeartbeat,
            hasOpenRouterFallback: Boolean(env.OPENROUTER_API_KEY),
            timestamp: new Date().toISOString(),
          }, null, 2)
        );
      } catch (err) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "degraded",
            error: "Database check failed",
            timestamp: new Date().toISOString(),
          })
        );
      }
      return;
    }

    if (url.pathname === "/metrics") {
      try {
        const queueRes = await pool.query<{ count: string }>(
          `SELECT count(*) FROM simulation_jobs WHERE status = 'queued'`
        );
        const activeRes = await pool.query<{ count: string }>(
          `SELECT count(*) FROM simulation_jobs WHERE status NOT IN ('queued', 'completed', 'failed')`
        );
        const completedRes = await pool.query<{ count: string; input_tokens: string; output_tokens: string }>(
          `SELECT count(*), coalesce(sum(input_tokens), 0) as input_tokens, coalesce(sum(output_tokens), 0) as output_tokens
           FROM simulation_jobs WHERE status = 'completed'`
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            queueDepth: Number(queueRes.rows[0]?.count || 0),
            activeSimulations: Number(activeRes.rows[0]?.count || 0),
            completedSimulations: Number(completedRes.rows[0]?.count || 0),
            workerLocalProcessed: workerStats.processedCount,
            workerLocalFailed: workerStats.failedCount,
            totalInputTokens: Number(completedRes.rows[0]?.input_tokens || 0),
            totalOutputTokens: Number(completedRes.rows[0]?.output_tokens || 0),
            uptimeSeconds: Math.floor((Date.now() - workerStats.bootTime.getTime()) / 1000),
            timestamp: new Date().toISOString(),
          }, null, 2)
        );
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(port, () => {
    logger.info(`worker health server listening on port ${port}`, {
      healthEndpoint: `http://localhost:${port}/health`,
      metricsEndpoint: `http://localhost:${port}/metrics`,
    });
  });

  return server;
}
