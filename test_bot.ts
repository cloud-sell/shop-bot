import { db } from "./server/db";
import { settings, telegramUsers } from "./shared/schema";
import TelegramBot from "node-telegram-bot-api";

async function main() {
  try {
    const dbSettings = await db.select().from(settings);
    console.log("All DB Settings keys:", dbSettings.map(s => s.key));

    const tokenSetting = dbSettings.find(s => s.key === "TELEGRAM_BOT_TOKEN");
    const token = tokenSetting?.value || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN not found in DB settings or process.env");
      process.exit(1);
    }
    console.log("Found bot token:", token.substring(0, 10) + "...");

    const users = await db.select().from(telegramUsers);
    if (users.length === 0) {
      console.error("No telegram users found in database");
      process.exit(1);
    }
    const targetUser = users[users.length - 1];
    const chatId = targetUser.telegramId;
    console.log(`Sending test message to telegramId (chatId): ${chatId} (${targetUser.username || targetUser.firstName})`);

    const bot = new TelegramBot(token);

    const wallet = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
    const amount = 10.00;
    const paymentId = 9999;

    const responseMsg = `🌐 <b>TRC20 (USDT) Deposit</b>\n` +
      `━━━━━━━━━━━━━━━\n` +
      `💰 Amount to Pay: <code>${amount.toFixed(2)} USDT</code>\n` +
      `📥 Wallet Address:\n<code>${wallet}</code>\n\n` +
      `⚠️ <b>Instructions:</b>\n` +
      `1. Send exactly <b>${amount.toFixed(2)} USDT</b> (TRC20 network) to the address above.\n` +
      `2. Once transaction is complete, click <b>Check payment</b> below or send your <b>Transaction Hash / ID (TXID)</b> directly in the chat.`;

    const keyboard = [
      [{ text: `📋 Copy Wallet Address`, callback_data: `copy_wallet_trc20` }],
      [{ text: `📋 Copy Amount: ${amount.toFixed(2)}`, callback_data: `copy_amount_${amount.toFixed(2)}` }],
      [{ text: '🔄 Check payment', callback_data: `check_payment_${paymentId}` }]
    ];

    console.log("Attempting to send HTML message...");
    try {
      const res = await bot.sendMessage(chatId, responseMsg, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
      });
      console.log("HTML message sent successfully! message_id:", res.message_id);
    } catch (sendErr: any) {
      console.error("Failed to send HTML message. Error details:");
      console.error(sendErr);
    }

  } catch (err) {
    console.error("Error in test script:", err);
  }
  process.exit(0);
}

main();
