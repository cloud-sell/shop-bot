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

  let publicKey = (await storage.getSetting('VAPID_PUBLIC_KEY'))?.value;
  let privateKey = (await storage.getSetting('VAPID_PRIVATE_KEY'))?.value;
  let subject = (await storage.getSetting('VAPID_SUBJECT'))?.value;

  if (!publicKey || !privateKey || !subject) {
    if (!publicKey) publicKey = "BLi12JZdvdRbULvhPcN-pwedf_t72vUTO4XT-R_AfB58GRSfr_wkB7G-KFffQXFclHxhOQn4Qf-yidRm0o0_Img";
    if (!privateKey) privateKey = "rfNmhj1wxk2Bo4zjk5lY7PeOadLP6ZHbvVooox7qdIY";
    if (!subject) subject = "mailto:imeshcheak@gmail.com";

    await storage.setSetting('VAPID_PUBLIC_KEY', publicKey);
    await storage.setSetting('VAPID_PRIVATE_KEY', privateKey);
    await storage.setSetting('VAPID_SUBJECT', subject);
  }

  webpush.setVapidDetails(
    subject,
    publicKey,
    privateKey
  );
  
  console.log('[PUSH] Initialized with user-configured VAPID keys');
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
