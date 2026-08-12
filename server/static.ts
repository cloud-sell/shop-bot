import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // Do NOT serve index.html for missing assets (/assets/*.js, .css, etc.)
  app.use("/assets/*", (_req, res) => {
    res.status(404).send("Asset not found");
  });

  // fall through to index.html if the file doesn't exist for SPA routes
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
