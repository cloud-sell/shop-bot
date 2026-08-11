import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { log } from "./log";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  log(`Client connected: ${socket.id}`, "socket.io");
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));



app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function startServer() {
  try {
    console.log("[SERVER] Registering routes...");
    await registerRoutes(httpServer, app, io);
    
    // Initialize Admin and Database Tables
    console.log("[SERVER] Initializing admin...");
    const { storage } = await import("./storage");
    await storage.initializeAdmin();

    // Start AWS Background Sync
    console.log("[SERVER] Starting AWS sync...");
    const { startAwsBackgroundSync } = await import("./aws-service");
    startAwsBackgroundSync();

    // Init VAPID Push Notifications
    console.log("[SERVER] Initializing push notifications...");
    const { initPushNotifications } = await import("./push-notifications");
    await initPushNotifications();

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    });

    const port = parseInt(process.env.PORT || "5000", 10);
    console.log(`[SERVER] Attempting to listen on port ${port}...`);
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
      },
      () => {
        log(`Server started: Port ${port}`);
        console.log(`✅ Server successfully listening on http://0.0.0.0:${port}`);
      },
    );

    if (process.env.NODE_ENV === "production") {
      console.log("[SERVER] Serving static assets...");
      serveStatic(app);
    } else {
      console.log("[SERVER] Setting up Vite dev server...");
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
  } catch (error) {
    log(`Failed to start server: ${error}`);
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
