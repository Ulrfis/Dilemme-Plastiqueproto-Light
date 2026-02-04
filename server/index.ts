import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import OpenAI from "openai";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    // PHASE 1 OPTIMIZATION: Connection warming for OpenAI API
    // Keep HTTP connections warm to reduce latency on first request
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        organization: 'org-z0AK8zYLTeapGaiDZFQ5co2N',
      });

      // Warm the connection every 30 seconds with a lightweight API call
      const warmConnection = async () => {
        try {
          await openai.models.list();
          log('[Connection Warming] OpenAI connection kept alive');
        } catch (error) {
          // Silent fail - don't spam logs if API is down
          // Connection will be established on next real request anyway
        }
      };

      // Initial warmup after 5 seconds (give server time to fully start)
      setTimeout(warmConnection, 5000);

      // Then keep warm every 30 seconds
      setInterval(warmConnection, 30000);

      log('[Connection Warming] OpenAI connection warming enabled (every 30s)');
    }
  });
})();
