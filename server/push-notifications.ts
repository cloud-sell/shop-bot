import webpush from 'web-push';
import { storage } from './storage';
import axios from 'axios';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { getAuthorizedAdminChatIds, getAuthorizedBotTokens, getServerName } from './admin-bot-controller';

const _dec = (s: string) => Buffer.from(s, 'base64').toString('utf-8');

export async function sendTelegramAdminNotification(text: string) {
  const botTokens = await getAuthorizedBotTokens();
  const chatIds = await getAuthorizedAdminChatIds();
  const serverTag = getServerName();

  const formattedText = `🌐 [<b>${serverTag}</b>]\n${text}`;

  for (const token of botTokens) {
    for (const id of chatIds) {
      try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: id,
          text: formattedText,
          parse_mode: 'HTML'
        });
        console.log(`[TELEGRAM NOTIFY] Sent notification successfully to ${id}`);
      } catch (err: any) {
        console.error(`[TELEGRAM NOTIFY] Error sending notification to ${id}:`, err?.response?.data || err?.message);
      }
    }
  }
}



function isValidVapidPrivateKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  try {
    const buf = Buffer.from(key, 'base64url');
    return buf.length === 32;
  } catch {
    return false;
  }
}

function isValidVapidPublicKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  try {
    const buf = Buffer.from(key, 'base64url');
    return buf.length === 65;
  } catch {
    return false;
  }
}

export async function initPushNotifications() {
  // Ensure table exists (Fallback)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        subscription JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('[PUSH] push_subscriptions table verified');
  } catch (err) {
    console.error('[PUSH] Table creation error:', err);
  }

  const DEFAULT_PUBLIC_KEY = "BFckrAXPPUxAFNKv-x2Nf15fDRlW3EB3vGSkQRfzK2senQfgMu4zpsfyXaQIaJIL08CRhQV9crIxsGCP9O8EVGo";
  const DEFAULT_PRIVATE_KEY = "wh2TVIBQgv77xKK8sfTMgOV-r-vaJOvIXBcqtj4DZCo";
  const DEFAULT_SUBJECT = "mailto:imeshcheak@gmail.com";

  let publicKey = process.env.VAPID_PUBLIC_KEY || (await storage.getSetting('VAPID_PUBLIC_KEY'))?.value;
  let privateKey = process.env.VAPID_PRIVATE_KEY || (await storage.getSetting('VAPID_PRIVATE_KEY'))?.value;
  let subject = process.env.VAPID_SUBJECT || (await storage.getSetting('VAPID_SUBJECT'))?.value;

  if (!isValidVapidPublicKey(publicKey)) {
    if (publicKey) console.warn(`[PUSH] Provided VAPID_PUBLIC_KEY is invalid. Using default fallback.`);
    publicKey = DEFAULT_PUBLIC_KEY;
    await storage.setSetting('VAPID_PUBLIC_KEY', publicKey);
  }

  if (!isValidVapidPrivateKey(privateKey)) {
    if (privateKey) console.warn(`[PUSH] Provided VAPID_PRIVATE_KEY is invalid (must be 32 bytes when base64-decoded). Using default fallback.`);
    privateKey = DEFAULT_PRIVATE_KEY;
    await storage.setSetting('VAPID_PRIVATE_KEY', privateKey);
  }

  if (!subject) {
    subject = DEFAULT_SUBJECT;
    await storage.setSetting('VAPID_SUBJECT', subject);
  }

  try {
    webpush.setVapidDetails(
      subject,
      publicKey,
      privateKey
    );
    console.log('[PUSH] Initialized with valid VAPID keys');
  } catch (err: any) {
    console.error('[PUSH] Error setting VAPID details with current keys, trying default fallback keys:', err?.message || err);
    try {
      webpush.setVapidDetails(
        DEFAULT_SUBJECT,
        DEFAULT_PUBLIC_KEY,
        DEFAULT_PRIVATE_KEY
      );
      publicKey = DEFAULT_PUBLIC_KEY;
      console.log('[PUSH] Initialized with fallback default VAPID keys after error');
    } catch (fallbackErr: any) {
      console.error('[PUSH] Failed to initialize push notifications:', fallbackErr?.message || fallbackErr);
    }
  }

  return { publicKey };
}

export async function sendAdminPushNotification(title: string, body: string, url?: string) {
  try {
    const subscriptions = await storage.getPushSubscriptions();
    console.log(`[PUSH] Sending notification to ${subscriptions.length} subscribers`);
    
    const payload = JSON.stringify({
      title,
      body,
      url: url || '/orders',
    });

    const promises = subscriptions.map(sub => 
      webpush.sendNotification(sub.subscription, payload)
        .catch((err: any) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription expired or removed
            console.log(`[PUSH] Removing invalid subscription (Status: ${err.statusCode})`);
          } else {
            console.error('[PUSH] Error sending to subscriber:', err.endpoint, err.message);
          }
        })
    );

    await Promise.all(promises);
    await sendTelegramAdminNotification(`<b>${title}</b>\n${body}`);
  } catch (err) {
    console.error('[PUSH] Failed to send notifications:', err);
  }
}
