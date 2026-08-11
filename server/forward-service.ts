import TelegramBot from "node-telegram-bot-api";
import { storage } from "./storage";
import { Server as SocketServer } from "socket.io";
import { log } from "./log";

let forwardBot: TelegramBot | null = null;
let forwardInterval: NodeJS.Timeout | null = null;
let ioInstance: SocketServer | null = null;

interface ForwardGroup {
  groupId: string;
  groupName: string;
  sentCount: number;
  lastSentAt: string | null;
}

/**
 * Parses public or private Telegram post/channel links to extract fromChatId and messageId.
 */
export function parseTelegramPostLink(link: string): { fromChatId: string; messageId: number } | null {
  try {
    const cleanLink = link.trim();
    
    // Pattern 1: https://t.me/c/123456789/123 (private channel link)
    const privateMatch = cleanLink.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/c\/(\d+)\/(\d+)/);
    if (privateMatch) {
      return {
        fromChatId: `-100${privateMatch[1]}`,
        messageId: parseInt(privateMatch[2], 10),
      };
    }

    // Pattern 2: https://t.me/username/123 (public channel link)
    const publicMatch = cleanLink.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/([a-zA-Z0-9_]{5,})\/(\d+)/);
    if (publicMatch) {
      if (publicMatch[1] !== 'c') {
        return {
          fromChatId: `@${publicMatch[1]}`,
          messageId: parseInt(publicMatch[2], 10),
        };
      }
    }
  } catch (err) {
    console.error("[FORWARD] Failed to parse post link:", err);
  }
  return null;
}

export async function getDetectedGroups(): Promise<ForwardGroup[]> {
  const setting = await storage.getSetting("TG_FORWARD_GROUPS");
  if (!setting?.value) return [];
  try {
    return JSON.parse(setting.value);
  } catch (e) {
    return [];
  }
}

export async function saveDetectedGroups(groups: ForwardGroup[]) {
  await storage.updateSetting("TG_FORWARD_GROUPS", JSON.stringify(groups));
  if (ioInstance) {
    ioInstance.emit("tg_forward_stats", groups);
  }
}

export async function addOrUpdateGroup(groupId: string, groupName: string) {
  const groups = await getDetectedGroups();
  const index = groups.findIndex(g => g.groupId === groupId);
  if (index >= 0) {
    if (groups[index].groupName !== groupName) {
      groups[index].groupName = groupName;
      await saveDetectedGroups(groups);
    }
  } else {
    groups.push({
      groupId,
      groupName,
      sentCount: 0,
      lastSentAt: null
    });
    await saveDetectedGroups(groups);
    log(`Auto-detected new group for forward bot: ${groupName} (${groupId})`, "telegram-forward");
  }
}

export async function removeGroup(groupId: string) {
  let groups = await getDetectedGroups();
  const initialLength = groups.length;
  groups = groups.filter(g => g.groupId !== groupId);
  if (groups.length !== initialLength) {
    await saveDetectedGroups(groups);
    log(`Removed group ${groupId} from forward bot list`, "telegram-forward");
  }
}

/**
 * Manually fetches updates from Bot API to discover groups if polling was offline.
 */
export async function syncGroupsManually() {
  if (!forwardBot) {
    throw new Error("Forward bot is not initialized. Save a bot token first.");
  }
  
  log("Starting manual group sync via getUpdates...", "telegram-forward");
  
  try {
    const isPolling = forwardBot.isPolling();
    if (isPolling) {
      await forwardBot.stopPolling();
    }
    
    const updates = await forwardBot.getUpdates({ limit: 100, timeout: 0 });
    
    for (const update of updates) {
      if (update.my_chat_member) {
        const chat = update.my_chat_member.chat;
        const status = update.my_chat_member.new_chat_member.status;
        if (chat.type === "group" || chat.type === "supergroup") {
          if (status === "member" || status === "administrator") {
            await addOrUpdateGroup(chat.id.toString(), chat.title || "Unknown Group");
          } else if (status === "left" || status === "kicked") {
            await removeGroup(chat.id.toString());
          }
        }
      }
      if (update.message) {
        const chat = update.message.chat;
        if (chat.type === "group" || chat.type === "supergroup") {
          await addOrUpdateGroup(chat.id.toString(), chat.title || "Unknown Group");
        }
      }
    }
    
    if (isPolling) {
      await forwardBot.startPolling();
    }
    
    return { success: true, count: (await getDetectedGroups()).length };
  } catch (err: any) {
    log(`Manual group sync error: ${err.message}`, "telegram-forward");
    if (forwardBot && !forwardBot.isPolling()) {
      try { await forwardBot.startPolling(); } catch (e) {}
    }
    throw err;
  }
}

/**
 * Runs a single tick of the forwarding job.
 */
async function performForwardJob() {
  const statusSetting = await storage.getSetting("TG_FORWARD_STATUS");
  if (statusSetting?.value !== "running") return;

  const postLinkSetting = await storage.getSetting("TG_FORWARD_POST_LINK");
  if (!postLinkSetting?.value) {
    log("Forward job active but no post link configured.", "telegram-forward");
    return;
  }

  const parsed = parseTelegramPostLink(postLinkSetting.value);
  if (!parsed) {
    log(`Forward job active but failed to parse post link: ${postLinkSetting.value}`, "telegram-forward");
    return;
  }

  const { fromChatId, messageId } = parsed;
  const groups = await getDetectedGroups();

  if (groups.length === 0) {
    log("Forward job running but no target groups detected.", "telegram-forward");
    return;
  }

  // Filter out disabled groups
  const activeGroups = groups.filter(g => !g.disabled);
  if (activeGroups.length === 0) {
    log("Forward job running but all groups are disabled/restricted.", "telegram-forward");
    return;
  }

  log(`Running forward job. Source: ${fromChatId} message ${messageId} to ${activeGroups.length} active groups.`, "telegram-forward");

  if (!forwardBot) {
    log("Forward job running but forwardBot is null.", "telegram-forward");
    return;
  }

  const updatedGroups = [...groups];

  for (const group of updatedGroups) {
    if (group.disabled) continue; // Skip disabled groups

    try {
      await forwardBot.forwardMessage(group.groupId, fromChatId, messageId);
      group.sentCount += 1;
      group.lastSentAt = new Date().toISOString();
      log(`Successfully forwarded post to group ${group.groupName} via Bot`, "telegram-forward");
    } catch (err: any) {
      log(`Failed to forward via Bot to group ${group.groupName}: ${err.message || err}`, "telegram-forward");
    }
  }

  await saveDetectedGroups(updatedGroups);
}

/**
 * Manually tests message forwarding.
 */
export async function testForwardMessage(): Promise<{ success: boolean; totalGroups: number; sentCount: number; errors: string[] }> {
  const postLinkSetting = await storage.getSetting("TG_FORWARD_POST_LINK");
  if (!postLinkSetting?.value) {
    throw new Error("No source post link configured. Please set and save it first.");
  }

  const parsed = parseTelegramPostLink(postLinkSetting.value);
  if (!parsed) {
    throw new Error(`Failed to parse post link: ${postLinkSetting.value}`);
  }

  const { fromChatId, messageId } = parsed;
  const groups = await getDetectedGroups();

  if (groups.length === 0) {
    throw new Error("No target groups detected. Add the bot to your groups first.");
  }

  // Filter active groups for forwarding
  const activeGroups = groups.filter(g => !g.disabled);
  if (activeGroups.length === 0) {
    throw new Error("All detected groups are currently disabled/restricted. Enable at least one to test.");
  }

  if (!forwardBot) {
    throw new Error("Forward bot is not initialized. Please configure a valid Bot Token first.");
  }

  const updatedGroups = [...groups];
  let sentCount = 0;
  const errors: string[] = [];

  for (const group of updatedGroups) {
    if (group.disabled) continue; // Skip disabled groups

    try {
      await forwardBot.forwardMessage(group.groupId, fromChatId, messageId);
      group.sentCount += 1;
      group.lastSentAt = new Date().toISOString();
      sentCount++;
      log(`[TEST] Successfully forwarded post to group ${group.groupName} via Bot`, "telegram-forward");
    } catch (err: any) {
      errors.push(`${group.groupName}: ${err.message || err}`);
      log(`[TEST] Bot forward failed to group ${group.groupName}: ${err.message || err}`, "telegram-forward");
    }
  }

  await saveDetectedGroups(updatedGroups);

  return {
    success: sentCount > 0,
    totalGroups: activeGroups.length,
    sentCount,
    errors
  };
}


export function startForwardScheduler(intervalMinutes: number) {
  if (forwardInterval) {
    clearInterval(forwardInterval);
    forwardInterval = null;
  }

  const ms = intervalMinutes * 60 * 1000;
  log(`Starting forward scheduler. Interval: ${intervalMinutes} minutes (${ms}ms)`, "telegram-forward");
  
  // Run once immediately
  performForwardJob().catch(err => {
    log(`Initial forward job failed: ${err.message}`, "telegram-forward");
  });

  forwardInterval = setInterval(() => {
    performForwardJob().catch(err => {
      log(`Scheduled forward job failed: ${err.message}`, "telegram-forward");
    });
  }, ms);
}

export function stopForwardScheduler() {
  if (forwardInterval) {
    clearInterval(forwardInterval);
    forwardInterval = null;
    log("Forward scheduler stopped.", "telegram-forward");
  }
}

/**
 * Initializes the forward service, starts bot polling and schedules jobs if config exists.
 */
export async function initForwardService(io: SocketServer) {
  ioInstance = io;
  log("Initializing Telegram Forward service...", "telegram-forward");

  try {
    const tokenSetting = await storage.getSetting("TG_FORWARD_BOT_TOKEN");
    const statusSetting = await storage.getSetting("TG_FORWARD_STATUS");
    const intervalSetting = await storage.getSetting("TG_FORWARD_INTERVAL");

    if (tokenSetting?.value) {
      await reinitForwardBot(tokenSetting.value);

      if (statusSetting?.value === "running") {
        const interval = parseInt(intervalSetting?.value || "1", 10);
        startForwardScheduler(interval);
      }
    }
  } catch (err: any) {
    log(`Failed to initialize Telegram Forward service: ${err.message}`, "telegram-forward");
  }
}

export async function reinitForwardBot(token: string) {
  if (forwardBot) {
    try {
      await forwardBot.stopPolling();
    } catch (e) {}
    forwardBot = null;
  }

  const mainTokenSetting = await storage.getSetting("TELEGRAM_BOT_TOKEN");
  const mainToken = mainTokenSetting?.value;
  const isSameToken = token === mainToken;

  if (isSameToken) {
    log("Forward bot token is identical to main bot token. Disabling polling to prevent conflict.", "telegram-forward");
    forwardBot = new TelegramBot(token, { polling: false });
  } else {
    log("Starting forward bot polling (different token)...", "telegram-forward");
    forwardBot = new TelegramBot(token, { polling: true });

    forwardBot.on("polling_error", (err: any) => {
      if (err.code === "ETELEGRAM" && err.message.includes("409 Conflict")) {
        console.warn("[FORWARD BOT Polling Error] 409 Conflict: another instance is polling.");
      } else {
        console.error("[FORWARD BOT] Polling error:", err.message);
      }
    });

    forwardBot.on("my_chat_member", async (update) => {
      const chat = update.chat;
      const status = update.new_chat_member.status;
      if (chat.type === "group" || chat.type === "supergroup") {
        if (status === "member" || status === "administrator") {
          await addOrUpdateGroup(chat.id.toString(), chat.title || "Unknown Group");
        } else if (status === "left" || status === "kicked") {
          await removeGroup(chat.id.toString());
        }
      }
    });

    forwardBot.on("message", async (msg) => {
      const chat = msg.chat;
      if (chat.type === "group" || chat.type === "supergroup") {
        await addOrUpdateGroup(chat.id.toString(), chat.title || "Unknown Group");
      }
    });
  }
}

/**
 * Updates configurations, re-starts scheduler or re-initializes bot.
 */
export async function updateForwardConfig(config: {
  botToken?: string;
  postLink?: string;
  interval?: number;
  status?: "running" | "stopped";
}) {
  let tokenChanged = false;
  let schedulerChanged = false;

  if (config.botToken !== undefined) {
    const currentToken = await storage.getSetting("TG_FORWARD_BOT_TOKEN");
    if (currentToken?.value !== config.botToken) {
      await storage.updateSetting("TG_FORWARD_BOT_TOKEN", config.botToken);
      tokenChanged = true;
    }
  }

  if (config.postLink !== undefined) {
    await storage.updateSetting("TG_FORWARD_POST_LINK", config.postLink);
  }

  if (config.interval !== undefined) {
    const currentInterval = await storage.getSetting("TG_FORWARD_INTERVAL");
    if (currentInterval?.value !== config.interval.toString()) {
      await storage.updateSetting("TG_FORWARD_INTERVAL", config.interval.toString());
      schedulerChanged = true;
    }
  }

  if (config.status !== undefined) {
    const currentStatus = await storage.getSetting("TG_FORWARD_STATUS");
    if (currentStatus?.value !== config.status) {
      await storage.updateSetting("TG_FORWARD_STATUS", config.status);
      schedulerChanged = true;
    }
  }

  if (tokenChanged && config.botToken) {
    await reinitForwardBot(config.botToken);
  }

  if (schedulerChanged || tokenChanged) {
    const statusSetting = await storage.getSetting("TG_FORWARD_STATUS");
    const intervalSetting = await storage.getSetting("TG_FORWARD_INTERVAL");
    const status = statusSetting?.value;
    const interval = parseInt(intervalSetting?.value || "1", 10);

    if (status === "running" && forwardBot) {
      startForwardScheduler(interval);
    } else {
      stopForwardScheduler();
    }
  }

  return getForwardConfig();
}

export async function getForwardConfig() {
  return {
    botToken: (await storage.getSetting("TG_FORWARD_BOT_TOKEN"))?.value || "",
    postLink: (await storage.getSetting("TG_FORWARD_POST_LINK"))?.value || "",
    interval: parseInt((await storage.getSetting("TG_FORWARD_INTERVAL"))?.value || "1", 10),
    status: (await storage.getSetting("TG_FORWARD_STATUS"))?.value || "stopped",
  };
}

export async function clearForwardCounters() {
  const groups = await getDetectedGroups();
  const cleared = groups.map(g => ({
    ...g,
    sentCount: 0,
    lastSentAt: null
  }));
  await saveDetectedGroups(cleared);
  return cleared;
}
