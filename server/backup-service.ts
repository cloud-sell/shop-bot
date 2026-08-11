import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import axios from "axios";
import FormData from "form-data";
// Use process.cwd() to get the root directory for temporary files
const PROJECT_ROOT = process.cwd();
const TMP_DIR = path.join(PROJECT_ROOT, "tmp");

export class BackupService {
  private static isRunning = false;

  static async log(configId: number, message: string, level: "info" | "error" | "success" = "info") {
    console.log(`[BackupService] ${message}`);
    await storage.createBackupLog({
      backupConfigId: configId,
      message,
      level
    });
  }

  static async performBackup(configId: number) {
    if (this.isRunning) {
      console.log("Backup already in progress, skipping...");
      return;
    }

    const config = (await storage.getBackupConfigs()).find(c => c.id === configId);
    if (!config || config.status !== "active") return;

    this.isRunning = true;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `backup-${timestamp}.dump`;
    const filePath = path.join(TMP_DIR, fileName);

    // Ensure tmp directory exists
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }

    try {
      await this.log(configId, "Starting database backup process...");

      // Determine pg_dump path
      let pgDumpPath = "pg_dump"; // Default for Linux/Docker
      if (process.platform === "win32") {
        // Look for local windows binaries if they exist
        const winBinPath = path.join(PROJECT_ROOT, "bin", "pg_dump.exe");
        if (fs.existsSync(winBinPath)) {
          pgDumpPath = winBinPath;
        } else {
          // Look in Program Files
          const pgPaths = [
            "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
            "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
            "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
            "C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe"
          ];
          for (const p of pgPaths) {
            if (fs.existsSync(p)) {
              pgDumpPath = p;
              break;
            }
          }
        }
      }

      await this.log(configId, `Using pg_dump: ${pgDumpPath}`);

      const args = [
        "--format=c",
        "--file=" + filePath,
        config.dbUrl
      ];

      const child = spawn(pgDumpPath, args, {
        shell: false,
        env: { ...process.env, PGPASSWORD: "" } // Password is in the URL usually
      });

      let errorOutput = "";

      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
        console.error(`pg_dump error: ${data}`);
      });

      await new Promise((resolve, reject) => {
        child.on("error", (err) => {
          reject(err);
        });
        child.on("close", (code) => {
          if (code === 0) resolve(true);
          else reject(new Error(`pg_dump failed with code ${code}: ${errorOutput}`));
        });
      });

      await this.log(configId, "Database dump created successfully. Uploading to Telegram...", "success");

      // Send to Telegram
      const stats = fs.statSync(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      await this.log(configId, `File size: ${fileSizeInMB.toFixed(2)} MB`);

      const form = new FormData();
      form.append("chat_id", config.chatId);
      form.append("caption", `📊 Database Backup\n🕒 Time: ${new Date().toLocaleString()}\n📦 Size: ${fileSizeInMB.toFixed(2)} MB\n🔗 URL: ${config.dbUrl.split("@")[1] || "Hidden"}`);
      form.append("document", fs.createReadStream(filePath));

      await axios.post(`https://api.telegram.org/bot${config.botToken}/sendDocument`, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      await this.log(configId, "Backup successfully sent to Telegram bot.", "success");
      
      // Update last backup timestamp
      await storage.updateBackupConfig(configId, { lastBackupAt: new Date() });

    } catch (error: any) {
      await this.log(configId, `Backup failed: ${error.message}`, "error");
    } finally {
      // Cleanup
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          await this.log(configId, "Temporary backup file cleaned up.");
        } catch (e) {
          console.error("Failed to delete temp backup file:", e);
        }
      }
      this.isRunning = false;
    }
  }

  static async startBackupScheduler() {
    console.log("Database Backup Scheduler started...");
    
    // Initial cleanup of old logs (older than 7 days)
    try {
      await storage.clearOldBackupLogs(7);
    } catch (e) {
      console.error("Failed initial log cleanup:", e);
    }

    // Run check loop
    setInterval(async () => {
      const configs = await storage.getBackupConfigs();
      for (const config of configs) {
        if (config.status !== "active") continue;

        const lastBackup = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0;
        const now = Date.now();
        const frequencyMs = config.frequency * 60 * 60 * 1000;

        if (now - lastBackup >= frequencyMs) {
          console.log(`Triggering scheduled backup for config ${config.id}...`);
          this.performBackup(config.id);
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }
}
