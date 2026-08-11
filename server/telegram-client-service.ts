import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
import { Api } from "telegram";
import { storage } from "./storage";
import { Server as SocketServer } from "socket.io";
import { log } from "./log";

let client: TelegramClient | null = null;
let ioInstance: SocketServer | null = null;

// Temporary variables for the login process
let tempClient: TelegramClient | null = null;
let tempPhoneCodeHash: string | null = null;
let tempPhoneNumber: string | null = null;

/**
 * Initializes the Telegram Client service, sets up WebSockets and auto-connects if a session exists.
 */
export function initTelegramClientService(io: SocketServer) {
  ioInstance = io;
  
  // Attempt auto-connect on startup
  autoConnect().catch(err => {
    log(`Telegram client auto-connect failed: ${err.message}`, "telegram-client");
  });
}

/**
 * Checks if the primary Telegram Client is currently connected.
 */
export function isClientConnected(): boolean {
  return client !== null && client.connected;
}

/**
 * Auto-connects the Telegram client if credentials exist in Settings.
 */
async function autoConnect() {
  try {
    const sessionSetting = await storage.getSetting("TG_CLIENT_SESSION");
    const apiIdSetting = await storage.getSetting("TG_CLIENT_API_ID");
    const apiHashSetting = await storage.getSetting("TG_CLIENT_API_HASH");

    if (sessionSetting?.value && apiIdSetting?.value && apiHashSetting?.value) {
      log("Found saved Telegram session. Connecting...", "telegram-client");
      const apiId = parseInt(apiIdSetting.value, 10);
      const apiHash = apiHashSetting.value;
      const stringSession = new StringSession(sessionSetting.value);

      client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        useWSS: true,
        deviceModel: process.env.TG_CLIENT_DEVICE_MODEL || "MAC M5",
        systemVersion: process.env.TG_CLIENT_SYSTEM_VERSION || "macOS",
        appVersion: process.env.TG_CLIENT_APP_VERSION || "encrypted sesion",
      });

      await client.connect();
      log("Telegram Client connected successfully!", "telegram-client");
      setupEventListeners(client);
    } else {
      log("No active Telegram MTProto session found in settings.", "telegram-client");
    }
  } catch (err: any) {
    log(`Error during Telegram auto-connect: ${err.message}`, "telegram-client");
  }
}

/**
 * Sets up incoming message event handlers.
 */
function setupEventListeners(tgClient: TelegramClient) {
  tgClient.addEventHandler(async (event: any) => {
    const message = event.message;
    if (!message) return;

    // Retrieve sender information if possible
    let senderName = "Unknown";
    try {
      const sender = await message.getSender();
      if (sender) {
        senderName = sender.firstName || sender.title || sender.username || "Unknown";
      }
    } catch (e) {
      // Ignore if cannot fetch sender
    }

    const chatPeer = message.peerId;
    let chatId = "";
    if (chatPeer) {
      if (chatPeer.userId) chatId = chatPeer.userId.toString();
      else if (chatPeer.chatId) chatId = chatPeer.chatId.toString();
      else if (chatPeer.channelId) chatId = chatPeer.channelId.toString();
    }

    const hasPhoto = !!(message.photo || (message.media && (message.media as any).photo));

    const msgData = {
      id: message.id,
      text: message.message || "",
      date: message.date,
      out: message.out,
      chatId: chatId,
      senderId: message.senderId ? message.senderId.toString() : null,
      senderName: senderName,
      hasPhoto,
    };

    if (ioInstance) {
      ioInstance.emit("telegram_client_message", msgData);
    }
  }, new NewMessage({}));
}

/**
 * Initiates the login flow by sending an OTP request.
 */
export async function sendOtpCode(apiId: number, apiHash: string, phoneNumber: string) {
  // Clear any existing connections
  if (client) {
    try { await client.disconnect(); } catch (e) {}
    client = null;
  }
  if (tempClient) {
    try { await tempClient.disconnect(); } catch (e) {}
    tempClient = null;
  }

  log(`Requesting Telegram OTP for: ${phoneNumber}`, "telegram-client");
  
  const stringSession = new StringSession(""); // Empty session for now
  tempClient = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 3,
    useWSS: true,
    deviceModel: process.env.TG_CLIENT_DEVICE_MODEL || "MAC M5",
    systemVersion: process.env.TG_CLIENT_SYSTEM_VERSION || "macOS",
    appVersion: process.env.TG_CLIENT_APP_VERSION || "encrypted sesion",
  });

  await tempClient.connect();

  const result = await tempClient.sendCode(
    {
      apiId,
      apiHash,
    },
    phoneNumber
  );

  tempPhoneCodeHash = result.phoneCodeHash;
  tempPhoneNumber = phoneNumber;

  // Temporarily store target credentials in DB
  await storage.updateSetting("TG_CLIENT_API_ID", apiId.toString());
  await storage.updateSetting("TG_CLIENT_API_HASH", apiHash);
  await storage.updateSetting("TG_CLIENT_PHONE", phoneNumber);

  return { success: true };
}

/**
 * Signs in using the received OTP and optional 2FA password.
 */
export async function signInClient(code: string, password?: string) {
  if (!tempClient || !tempPhoneCodeHash || !tempPhoneNumber) {
    throw new Error("No pending login session found. Send OTP first.");
  }

  log(`Signing in with OTP code...`, "telegram-client");

  try {
    let user: any;
    try {
      const result = await tempClient.invoke(
        new Api.auth.SignIn({
          phoneNumber: tempPhoneNumber,
          phoneCodeHash: tempPhoneCodeHash,
          phoneCode: code,
        })
      );
      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        throw new Error("SignUp is required; this account is not registered on Telegram.");
      }
      user = result.user;
    } catch (err: any) {
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        if (!password) {
          throw new Error("Two-step verification is enabled. Please enter your 2FA password.");
        }
        try {
          user = await tempClient.signInWithPassword(
            {
              apiId: tempClient.apiId,
              apiHash: tempClient.apiHash,
            },
            {
              password: () => Promise.resolve(password),
              onError: (e: any) => Promise.resolve(true),
            }
          );
        } catch (pwErr: any) {
          if (pwErr.message === "AUTH_USER_CANCEL") {
            throw new Error("Invalid 2FA password. Please check your credentials.");
          }
          throw pwErr;
        }
      } else {
        throw err;
      }
    }

    const sessionString = tempClient.session.save() as unknown as string;
    await storage.updateSetting("TG_CLIENT_SESSION", sessionString);

    client = tempClient;
    tempClient = null;
    tempPhoneCodeHash = null;
    tempPhoneNumber = null;

    setupEventListeners(client);

    log(`Telegram client login successful for user: ${user.id}`, "telegram-client");

    return {
      success: true,
      user: {
        id: user.id.toString(),
        username: user.username || "",
        firstName: user.firstName || "",
      }
    };
  } catch (err: any) {
    log(`Login error: ${err.message}`, "telegram-client");
    throw err;
  }
}

/**
 * Fetches the list of active chats/dialogs.
 */
export async function getChats() {
  if (!client || !client.connected) {
    throw new Error("Telegram client is not connected.");
  }

  const contactIds = new Set<string>();
  try {
    const contactsResult = await client.invoke(new Api.contacts.GetContacts({ hash: 0 }));
    if (contactsResult && 'users' in contactsResult) {
      for (const u of contactsResult.users) {
        if ('id' in u) {
          contactIds.add(u.id.toString());
        }
      }
    }
  } catch (err: any) {
    log(`Failed to fetch contacts: ${err.message}`, "telegram-client");
  }

  const dialogs = await client.getDialogs({});
  return dialogs.map(d => {
    let name = d.name || d.title || "Unknown";
    let type = "user";
    if (d.isGroup) type = "group";
    else if (d.isChannel) type = "channel";

    const isBot = d.isUser && d.entity && 'bot' in d.entity ? !!(d.entity as any).bot : false;

    return {
      id: d.id ? d.id.toString() : "",
      name,
      unreadCount: d.unreadCount || 0,
      lastMessage: d.message ? d.message.message : "",
      date: d.date,
      type,
      username: d.entity && 'username' in d.entity ? d.entity.username : null,
      isContact: d.isUser && d.id && contactIds.has(d.id.toString()),
      isBot,
    };
  });
}

/**
 * Fetches messages history for a target chat.
 */
export async function getChatMessages(chatId: string, limit = 50) {
  if (!client || !client.connected) {
    throw new Error("Telegram client is not connected.");
  }

  let peer;
  try {
    peer = await client.getInputEntity(chatId);
  } catch (err) {
    // Fallback if entity is not fully resolved in cache
    peer = chatId;
  }

  const messages = await client.getMessages(peer, { limit });
  
  const parsedMessages = await Promise.all(messages.map(async (m) => {
    let senderName = "Unknown";
    try {
      if (m.sender) {
        senderName = m.sender.firstName || m.sender.title || m.sender.username || "Unknown";
      }
    } catch (e) {}

    const hasPhoto = !!(m.photo || (m.media && (m.media as any).photo));

    return {
      id: m.id,
      text: m.message || "",
      date: m.date,
      out: m.out,
      senderId: m.senderId ? m.senderId.toString() : null,
      senderName,
      hasPhoto,
    };
  }));

  return parsedMessages.reverse(); // Return in oldest-first order for message lists
}

/**
 * Sends a text message to a specific chat peer.
 */
export async function sendChatMessage(chatId: string, text: string) {
  if (!client || !client.connected) {
    throw new Error("Telegram client is not connected.");
  }

  let peer;
  try {
    peer = await client.getInputEntity(chatId);
  } catch (err) {
    peer = chatId;
  }

  const result = await client.sendMessage(peer, { message: text });
  
  return {
    id: result.id,
    text: result.message || "",
    date: result.date,
    out: result.out,
    senderId: result.senderId ? result.senderId.toString() : null,
    senderName: "Me",
  };
}

/**
 * Logs out and clears Telegram MTProto credentials.
 */
export async function logoutClient() {
  log("Logging out and disconnecting Telegram Client...", "telegram-client");
  
  if (client) {
    try { await client.disconnect(); } catch (e) {}
    client = null;
  }
  if (tempClient) {
    try { await tempClient.disconnect(); } catch (e) {}
    tempClient = null;
  }

  tempPhoneCodeHash = null;
  tempPhoneNumber = null;

  // Remove settings
  await storage.updateSetting("TG_CLIENT_SESSION", "");
  await storage.updateSetting("TG_CLIENT_API_ID", "");
  await storage.updateSetting("TG_CLIENT_API_HASH", "");
  await storage.updateSetting("TG_CLIENT_PHONE", "");

  return { success: true };
}

/**
 * Fetches detailed info about a user, group, or channel.
 */
export async function getPeerDetails(peerId: string) {
  if (!client || !client.connected) {
    throw new Error("Telegram client is not connected.");
  }

  let peer: any;
  try {
    peer = await client.getInputEntity(peerId);
  } catch (err) {
    peer = peerId;
  }

  const entity = await client.getEntity(peer);

  if (entity instanceof Api.User) {
    const fullResult = await client.invoke(
      new Api.users.GetFullUser({
        id: peer,
      })
    );
    const fullUser = fullResult.fullUser;
    
    // Check if the user is in contact list
    const contactIds = new Set<string>();
    try {
      const contactsResult = await client.invoke(new Api.contacts.GetContacts({ hash: 0 }));
      if (contactsResult && 'users' in contactsResult) {
        for (const u of contactsResult.users) {
          if ('id' in u) {
            contactIds.add(u.id.toString());
          }
        }
      }
    } catch (e) {}

    return {
      type: "user",
      id: entity.id.toString(),
      firstName: entity.firstName || "",
      lastName: entity.lastName || "",
      username: entity.username || "",
      phone: entity.phone || "",
      bio: fullUser.about || "",
      isBot: !!entity.bot,
      isPremium: !!entity.premium,
      isVerified: !!entity.verified,
      isContact: contactIds.has(entity.id.toString()),
    };
  } else if (entity instanceof Api.Channel) {
    const fullResult = await client.invoke(
      new Api.channels.GetFullChannel({
        channel: peer,
      })
    );
    const fullChat = fullResult.fullChat;
    return {
      type: entity.megagroup ? "group" : "channel",
      id: entity.id.toString(),
      name: entity.title || "",
      username: entity.username || "",
      about: fullChat.about || "",
      participantsCount: fullChat.participantsCount || 0,
      isVerified: !!entity.verified,
    };
  } else {
    // Legacy Chat group
    const fullResult = await client.invoke(
      new Api.messages.GetFullChat({
        chatId: entity.id,
      })
    );
    const fullChat = fullResult.fullChat;
    return {
      type: "group",
      id: entity.id.toString(),
      name: entity.title || "",
      about: fullChat.about || "",
      participantsCount: fullResult.users ? fullResult.users.length : 0,
    };
  }
}

export function getTelegramClient() {
  return client;
}

export async function downloadMessageMedia(chatId: string, messageId: number) {
  if (!client || !client.connected) {
    throw new Error("Telegram client is not connected.");
  }

  let peer;
  try {
    peer = await client.getInputEntity(chatId);
  } catch (err) {
    peer = chatId;
  }

  const messages = await client.getMessages(peer, { ids: [messageId] });
  if (!messages || messages.length === 0) {
    return null;
  }

  const message = messages[0];
  if (!message.media) {
    return null;
  }

  const buffer = await client.downloadMedia(message.media, {});
  return buffer;
}


