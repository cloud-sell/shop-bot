import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export * from "./models/auth";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // Category (e.g. AWS, DigitalOcean)
  price: integer("price").notNull(), // In cents
  status: text("status").notNull().default("available"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const credentials = pgTable("credentials", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  content: text("content").notNull(),
  status: text("status").notNull().default("available"), // available, sold
  createdAt: timestamp("created_at").defaultNow(),
});

export const telegramUsers = pgTable("telegram_users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").unique().notNull(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  balance: integer("balance").notNull().default(0),
  lastAction: text("last_action"),
  lastMessageId: integer("last_message_id"),
  lastErrorMessageId: integer("last_error_message_id"),
  tutorialBuyVideo: text("tutorial_buy_video"),
  tutorialDepositVideo: text("tutorial_deposit_video"),
  doApiKey: text("do_api_key"),
  lastDropletId: text("last_droplet_id"),
  lastOfferBroadcastId: integer("last_offer_broadcast_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").unique().notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  telegramUserId: integer("telegram_user_id").notNull().references(() => telegramUsers.id),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method").notNull(),
  externalId: text("external_id"),
  cryptomusUuid: text("cryptomus_uuid"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const productsRelations = relations(products, ({ many }) => ({
  credentials: many(credentials),
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
  product: one(products, {
    fields: [credentials.productId],
    references: [products.id],
  }),
}));

export const telegramUsersRelations = relations(telegramUsers, ({ many }) => ({
  orders: many(orders),
  payments: many(payments),
}));

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id),
  credentialId: integer("credential_id").references(() => credentials.id),
  telegramUserId: integer("telegram_user_id").references(() => telegramUsers.id),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ordersRelations = relations(orders, ({ one }) => ({
  product: one(products, {
    fields: [orders.productId],
    references: [products.id],
  }),
  credential: one(credentials, {
    fields: [orders.credentialId],
    references: [credentials.id],
  }),
  telegramUser: one(telegramUsers, {
    fields: [orders.telegramUserId],
    references: [telegramUsers.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  telegramUser: one(telegramUsers, {
    fields: [payments.telegramUserId],
    references: [telegramUsers.id],
  }),
}));

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertCredentialSchema = createInsertSchema(credentials).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertTelegramUserSchema = createInsertSchema(telegramUsers).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true });

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Credential = typeof credentials.$inferSelect;
export type InsertCredential = z.infer<typeof insertCredentialSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type TelegramUser = typeof telegramUsers.$inferSelect;
export type InsertTelegramUser = z.infer<typeof insertTelegramUserSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export const broadcastChannels = pgTable("broadcast_channels", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").unique().notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const broadcastMessages = pgTable("broadcast_messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  buttonText: text("button_text"),
  buttonUrl: text("button_url"),
  interval: integer("interval"), // in minutes
  status: text("status").notNull().default("active"),
  sentCount: integer("sent_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBroadcastChannelSchema = createInsertSchema(broadcastChannels).omit({ id: true, createdAt: true });
export type BroadcastChannel = typeof broadcastChannels.$inferSelect;
export type InsertBroadcastChannel = z.infer<typeof insertBroadcastChannelSchema>;

export const insertBroadcastMessageSchema = createInsertSchema(broadcastMessages).omit({ id: true, createdAt: true });
export type BroadcastMessage = typeof broadcastMessages.$inferSelect;
export type InsertBroadcastMessage = z.infer<typeof insertBroadcastMessageSchema>;

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  subscription: jsonb("subscription").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

// AWS Checker Entities
export const awsAccounts = pgTable("aws_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  accessKey: text("access_key").notNull(),
  secretKey: text("secret_key").notNull(),
  region: text("region").notNull().default("us-east-1"),
  isSold: boolean("is_sold").notNull().default(false),
  status: text("status").notNull().default("active"), // active, error
  lastError: text("last_error"),
  lastChecked: timestamp("last_checked"),
  initialVcpu: integer("initial_vcpu"),
  spotVcpu: integer("spot_vcpu"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const awsActivities = pgTable("aws_activities", {
  id: serial("id").primaryKey(),
  awsAccountId: integer("aws_account_id").notNull().references(() => awsAccounts.id),
  eventTime: timestamp("event_time").notNull(),
  eventName: text("event_name").notNull(),
  eventSource: text("event_source").notNull(),
  ipAddress: text("ip_address").notNull(),
  location: text("location"),
  userName: text("user_name"),
  userAgent: text("user_agent"),
  details: jsonb("details"),
});

export const awsAccountsRelations = relations(awsAccounts, ({ many }) => ({
  activities: many(awsActivities),
}));

export const awsActivitiesRelations = relations(awsActivities, ({ one }) => ({
  account: one(awsAccounts, {
    fields: [awsActivities.awsAccountId],
    references: [awsAccounts.id],
  }),
}));

export const insertAwsAccountSchema = createInsertSchema(awsAccounts).omit({ id: true, createdAt: true });
export const insertAwsActivitySchema = createInsertSchema(awsActivities).omit({ id: true });

export type AwsAccount = typeof awsAccounts.$inferSelect;
export type InsertAwsAccount = z.infer<typeof insertAwsAccountSchema>;
export type AwsActivity = typeof awsActivities.$inferSelect;
export type InsertAwsActivity = z.infer<typeof insertAwsActivitySchema>;
export const specialOffers = pgTable("special_offers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  description: text("description"),
  bundleQuantity: integer("bundle_quantity").notNull(),
  price: integer("price").notNull(), // In cents
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const specialOffersRelations = relations(specialOffers, ({ one }) => ({
  product: one(products, {
    fields: [specialOffers.productId],
    references: [products.id],
  }),
}));

export const insertSpecialOfferSchema = createInsertSchema(specialOffers, {
  expiresAt: z.union([z.date(), z.string().transform(v => new Date(v))]).optional().nullable(),
}).omit({ id: true, createdAt: true });
export type SpecialOffer = typeof specialOffers.$inferSelect;
export type InsertSpecialOffer = z.infer<typeof insertSpecialOfferSchema>;

// Database Backup Entities
export const backupConfigs = pgTable("backup_configs", {
  id: serial("id").primaryKey(),
  dbUrl: text("db_url").notNull(),
  botToken: text("bot_token").notNull(),
  chatId: text("chat_id").notNull(),
  frequency: integer("frequency").notNull().default(3), // in hours
  status: text("status").notNull().default("active"), // active, disabled
  lastBackupAt: timestamp("last_backup_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const backupLogs = pgTable("backup_logs", {
  id: serial("id").primaryKey(),
  backupConfigId: integer("backup_config_id").references(() => backupConfigs.id),
  message: text("message").notNull(),
  level: text("level").notNull().default("info"), // info, error, success
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBackupConfigSchema = createInsertSchema(backupConfigs).omit({ id: true, createdAt: true });
export const insertBackupLogSchema = createInsertSchema(backupLogs).omit({ id: true, createdAt: true });

export type BackupConfig = typeof backupConfigs.$inferSelect;
export type InsertBackupConfig = z.infer<typeof insertBackupConfigSchema>;
export type BackupLog = typeof backupLogs.$inferSelect;
export type InsertBackupLog = z.infer<typeof insertBackupLogSchema>;
