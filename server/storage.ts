import { db } from "./db";
import bcrypt from "bcryptjs";
import {
  products,
  credentials,
  orders,
  telegramUsers,
  settings,
  payments,
  broadcastChannels,
  broadcastMessages,
  users,
  awsAccounts,
  awsActivities,
  backupConfigs,
  backupLogs,
  type Product,
  type InsertProduct,
  type Credential,
  type InsertCredential,
  type Order,
  type TelegramUser,
  type InsertTelegramUser,
  type InsertOrder,
  type Payment,
  type InsertPayment,
  type BroadcastChannel,
  type InsertBroadcastChannel,
  type BroadcastMessage,
  type InsertBroadcastMessage,
  type User,
  type AwsAccount,
  type InsertAwsAccount,
  type AwsActivity,
  type InsertAwsActivity,
  type SpecialOffer,
  type InsertSpecialOffer,
  specialOffers,
  type BackupConfig,
  type InsertBackupConfig,
  type BackupLog,
  type InsertBackupLog,
  pushSubscriptions
} from "@shared/schema";
import { eq, desc, count, sql, and, or, gt, gte, lte, isNull, isNotNull } from "drizzle-orm";

export interface IStorage {
  // Admin Login
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  initializeAdmin(): Promise<void>;

  // Products
  getProducts(): Promise<Product[]>;
  getAvailableProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  markProductSold(id: number): Promise<void>;

  // Telegram Users
  getTelegramUser(telegramId: string): Promise<TelegramUser | undefined>;
  getAllTelegramUsers(): Promise<TelegramUser[]>;
  createTelegramUser(user: InsertTelegramUser): Promise<TelegramUser>;
  updateTelegramUser(id: number, data: Partial<TelegramUser>): Promise<TelegramUser>;
  updateTelegramUserByChatId(telegramId: string, data: Partial<TelegramUser>): Promise<TelegramUser>;
  deductBalance(userId: number, amount: number): Promise<boolean>;
  getTelegramUsersWithBroadcast(): Promise<TelegramUser[]>;

  // Orders
  getOrders(): Promise<(Order & { product: Product | null; telegramUser: TelegramUser | null })[]>;
  createOrder(order: InsertOrder): Promise<Order>;

  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPayment(id: number): Promise<Payment | undefined>;
  getPaymentByUuid(uuid: string): Promise<Payment | undefined>;
  updatePayment(id: number, data: Partial<Payment>): Promise<Payment>;
  getAllPaymentsWithUsers(): Promise<(Payment & { telegramUser: TelegramUser | null })[]>;

  // Credentials
  getCredentialsByProduct(productId: number): Promise<Credential[]>;
  getAvailableCredential(productId: number): Promise<Credential | undefined>;
  createCredential(credential: InsertCredential): Promise<Credential>;
  markCredentialSold(id: number): Promise<void>;
  deleteCredential(id: number): Promise<void>;

  // Broadcast Channels
  getBroadcastChannels(): Promise<BroadcastChannel[]>;
  createBroadcastChannel(channel: InsertBroadcastChannel): Promise<BroadcastChannel>;
  deleteBroadcastChannel(id: number): Promise<void>;

  // Broadcast Messages
  getBroadcastMessages(): Promise<BroadcastMessage[]>;
  createBroadcastMessage(msg: InsertBroadcastMessage): Promise<BroadcastMessage>;
  updateBroadcastMessage(id: number, msg: Partial<InsertBroadcastMessage>): Promise<BroadcastMessage>;
  deleteBroadcastMessage(id: number): Promise<void>;

  // Stats
  getStats(): Promise<{ totalSales: number; dailySales: number; totalRevenue: number; dailyRevenue: number; availableProducts: number }>;

  // Settings
  getSetting(key: string): Promise<{ key: string; value: string } | undefined>;
  updateSetting(key: string, value: string): Promise<{ key: string; value: string }>;
  setSetting(key: string, value: string): Promise<{ key: string; value: string }>;

  // AWS Checker
  getAwsAccounts(): Promise<AwsAccount[]>;
  getAwsAccount(id: number): Promise<AwsAccount | undefined>;
  createAwsAccount(account: InsertAwsAccount): Promise<AwsAccount>;
  updateAwsAccount(id: number, data: Partial<AwsAccount>): Promise<AwsAccount>;
  deleteAwsAccount(id: number): Promise<void>;
  getAwsActivities(accountId?: number): Promise<(AwsActivity & { account: AwsAccount | null })[]>;
  createAwsActivity(activity: InsertAwsActivity): Promise<AwsActivity>;
  getAwsActivityExists(accountId: number, eventTime: Date, eventName: string): Promise<boolean>;
  deleteAwsNoise(): Promise<void>;
  expireOldPayments(): Promise<void>;
  getPendingPaymentByAmount(userId: number, amount: number): Promise<Payment | undefined>;

  // Special Offers
  getSpecialOffers(): Promise<(SpecialOffer & { product: Product | null })[]>;
  getSpecialOffer(id: number): Promise<SpecialOffer | undefined>;
  createSpecialOffer(offer: InsertSpecialOffer): Promise<SpecialOffer>;
  updateSpecialOffer(id: number, data: Partial<InsertSpecialOffer>): Promise<SpecialOffer>;
  deleteSpecialOffer(id: number): Promise<void>;
  getActiveSpecialOffers(): Promise<(SpecialOffer & { product: Product | null })[]>;

  // Backups
  getBackupConfigs(): Promise<BackupConfig[]>;
  createBackupConfig(config: InsertBackupConfig): Promise<BackupConfig>;
  updateBackupConfig(id: number, data: Partial<BackupConfig>): Promise<BackupConfig>;
  getBackupLogs(limit?: number): Promise<BackupLog[]>;
  createBackupLog(log: InsertBackupLog): Promise<BackupLog>;
  clearOldBackupLogs(days: number): Promise<void>;
  
  // Push Subscriptions
  savePushSubscription(userId: number, subscription: any): Promise<void>;
  getPushSubscriptions(userId?: number): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  // Settings
  async getSetting(key: string): Promise<{ key: string; value: string } | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async initializeAdmin(): Promise<void> {
    // Create push_subscriptions table if not exists
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          subscription JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log('[DB] push_subscriptions table verified/created');
    } catch (err) {
      console.error('[DB] Failed to create push_subscriptions table:', err);
    }

    // Initialize default branding settings
    const defaultSettings = [
      { key: "STORE_NAME", value: "Shopeefy" },
      { key: "SUPPORT_USERNAME", value: "@rochana_imesh" },
      { key: "SUPPORT_BTN_TEXT", value: "Write to Support" },
      { key: "LOADING_TEXT", value: "Shopeefy..." },
      { key: "TRC20_WALLET_ADDRESS", value: "" },
      { key: "APTOS_WALLET_ADDRESS", value: "" },
      { key: "PAYMENT_TRC20_ENABLED", value: "false" },
      { key: "PAYMENT_APTOS_ENABLED", value: "false" },
      { key: "TRC20_VERIFICATION_MODE", value: "binance" },
      { key: "APTOS_VERIFICATION_MODE", value: "binance" }
    ];

    for (const s of defaultSettings) {
      const existing = await db.select().from(settings).where(eq(settings.key, s.key));
      if (existing.length === 0) {
        await db.insert(settings).values({ key: s.key, value: s.value });
      }
    }

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      const existing = await this.getUserByEmail(email);
      if (!existing) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.insert(users).values({
          email,
          password: hashedPassword,
          firstName: "Admin",
          lastName: "User"
        });
        console.log(`Admin user initialized with email: ${email}`);
      }
    }
  }

  async updateSetting(key: string, value: string): Promise<{ key: string; value: string }> {
    const [existing] = await db.select().from(settings).where(eq(settings.key, key));
    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(settings).values({ key, value }).returning();
    return inserted;
  }

  async setSetting(key: string, value: string): Promise<{ key: string; value: string }> {
    return this.updateSetting(key, value);
  }

  // Products
  async getProducts(): Promise<Product[]> {
    return await db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getAvailableProducts(): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.status, "available")).orderBy(desc(products.createdAt));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    const [updatedProduct] = await db
      .update(products)
      .set(product)
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async markProductSold(id: number): Promise<void> {
    await db.update(products).set({ status: "sold" }).where(eq(products.id, id));
  }

  // Credentials
  async getCredentialsByProduct(productId: number): Promise<Credential[]> {
    return await db.select().from(credentials).where(eq(credentials.productId, productId)).orderBy(desc(credentials.createdAt));
  }

  async getAvailableCredential(productId: number): Promise<Credential | undefined> {
    const [credential] = await db.select().from(credentials).where(and(eq(credentials.productId, productId), eq(credentials.status, "available"))).limit(1);
    return credential;
  }

  async createCredential(credential: InsertCredential): Promise<Credential> {
    const [newCredential] = await db.insert(credentials).values(credential).returning();
    return newCredential;
  }

  async markCredentialSold(id: number): Promise<void> {
    await db.update(credentials).set({ status: "sold" }).where(eq(credentials.id, id));
  }

  async deleteCredential(id: number): Promise<void> {
    await db.delete(credentials).where(eq(credentials.id, id));
  }

  // Broadcast Channels
  async getBroadcastChannels(): Promise<BroadcastChannel[]> {
    return await db.select().from(broadcastChannels).orderBy(desc(broadcastChannels.createdAt));
  }

  async createBroadcastChannel(channel: InsertBroadcastChannel): Promise<BroadcastChannel> {
    const [newChannel] = await db.insert(broadcastChannels).values(channel).returning();
    return newChannel;
  }

  async deleteBroadcastChannel(id: number): Promise<void> {
    await db.delete(broadcastChannels).where(eq(broadcastChannels.id, id));
  }

  // Broadcast Messages
  async getBroadcastMessages(): Promise<BroadcastMessage[]> {
    try {
      return await db.select().from(broadcastMessages).orderBy(desc(broadcastMessages.createdAt));
    } catch (err) {
      console.error('Failed to get broadcast messages, table might not exist yet:', err);
      return [];
    }
  }

  async createBroadcastMessage(msg: InsertBroadcastMessage): Promise<BroadcastMessage> {
    const [newMsg] = await db.insert(broadcastMessages).values(msg).returning();
    return newMsg;
  }

  async updateBroadcastMessage(id: number, msg: Partial<InsertBroadcastMessage>): Promise<BroadcastMessage> {
    const [updated] = await db.update(broadcastMessages).set(msg).where(eq(broadcastMessages.id, id)).returning();
    return updated;
  }

  async deleteBroadcastMessage(id: number): Promise<void> {
    await db.delete(broadcastMessages).where(eq(broadcastMessages.id, id));
  }

  // Telegram Users
  async getTelegramUser(telegramId: string): Promise<TelegramUser | undefined> {
    const [user] = await db.select().from(telegramUsers).where(eq(telegramUsers.telegramId, telegramId));
    return user;
  }

  async getAllTelegramUsers(): Promise<TelegramUser[]> {
    return await db.select().from(telegramUsers).orderBy(desc(telegramUsers.createdAt));
  }

  async createTelegramUser(user: InsertTelegramUser): Promise<TelegramUser> {
    const [newUser] = await db.insert(telegramUsers).values(user).returning();
    return newUser;
  }

  async updateTelegramUser(id: number, data: Partial<TelegramUser>): Promise<TelegramUser> {
    const [updated] = await db
      .update(telegramUsers)
      .set(data)
      .where(eq(telegramUsers.id, id))
      .returning();
    return updated;
  }

  async updateTelegramUserByChatId(telegramId: string, data: Partial<TelegramUser>): Promise<TelegramUser> {
    const [updated] = await db
      .update(telegramUsers)
      .set(data)
      .where(eq(telegramUsers.telegramId, telegramId))
      .returning();
    return updated;
  }

  async getTelegramUsersWithBroadcast(): Promise<TelegramUser[]> {
    return await db.select().from(telegramUsers).where(isNotNull(telegramUsers.lastOfferBroadcastId));
  }

  async deductBalance(userId: number, amount: number): Promise<boolean> {
    const [result] = await db
      .update(telegramUsers)
      .set({
        balance: sql`${telegramUsers.balance} - ${amount}`
      })
      .where(and(eq(telegramUsers.id, userId), gte(telegramUsers.balance, amount)))
      .returning();
    
    return !!result;
  }

  // Orders
  async getOrders(): Promise<(Order & { product: Product | null; telegramUser: TelegramUser | null; credential: Credential | null })[]> {
    return await db.query.orders.findMany({
      with: {
        product: true,
        telegramUser: true,
        credential: true,
      },
      orderBy: desc(orders.createdAt),
    }) as (Order & { product: Product | null; telegramUser: TelegramUser | null; credential: Credential | null })[];
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }

  // Payments
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async getPaymentByUuid(uuid: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.cryptomusUuid, uuid));
    return payment;
  }

  async updatePayment(id: number, data: Partial<Payment>): Promise<Payment> {
    const [updated] = await db
      .update(payments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return updated;
  }

  async getAllPaymentsWithUsers(): Promise<(Payment & { telegramUser: TelegramUser | null })[]> {
    return await db.query.payments.findMany({
      with: {
        telegramUser: true,
      },
      orderBy: desc(payments.createdAt),
    });
  }

  async getPaymentsForUser(userId: number): Promise<Payment[]> {
    return await db.select()
      .from(payments)
      .where(eq(payments.telegramUserId, userId))
      .orderBy(desc(payments.createdAt));
  }

  // Stats
  async getStats(): Promise<{ totalSales: number; dailySales: number; totalRevenue: number; dailyRevenue: number; availableProducts: number }> {
    const [sales] = await db.select({ count: count() }).from(orders);
    
    // Daily sales (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [dailySalesResult] = await db.select({ count: count() })
      .from(orders)
      .where(sql`${orders.createdAt} >= ${twentyFourHoursAgo}`);

    // Total revenue
    const revenueResult = await db.select({
      total: sql<number>`COALESCE(SUM(${products.price}), 0)`
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id));

    // Daily revenue (last 24 hours)
    const dailyRevenueResult = await db.select({
      total: sql<number>`COALESCE(SUM(${products.price}), 0)`
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .where(sql`${orders.createdAt} >= ${twentyFourHoursAgo}`);

    const totalRevenue = Number(revenueResult[0]?.total || 0);
    const dailyRevenue = Number(dailyRevenueResult[0]?.total || 0);

    const [available] = await db.select({ count: count() }).from(products).where(eq(products.status, "available"));

    return {
      totalSales: sales.count,
      dailySales: dailySalesResult.count,
      totalRevenue: totalRevenue,
      dailyRevenue: dailyRevenue,
      availableProducts: available.count,
    };
  }

  // AWS Checker Implementation
  async getAwsAccounts(): Promise<AwsAccount[]> {
    return await db.select().from(awsAccounts).orderBy(desc(awsAccounts.createdAt));
  }

  async getAwsAccount(id: number): Promise<AwsAccount | undefined> {
    const [account] = await db.select().from(awsAccounts).where(eq(awsAccounts.id, id));
    return account;
  }

  async createAwsAccount(account: InsertAwsAccount): Promise<AwsAccount> {
    const sanitizedAccount = {
      ...account,
      accessKey: account.accessKey.trim(),
      secretKey: account.secretKey.trim()
    };
    const [newAccount] = await db.insert(awsAccounts).values(sanitizedAccount).returning();
    return newAccount;
  }

  async updateAwsAccount(id: number, data: Partial<AwsAccount>): Promise<AwsAccount> {
    const sanitizedData = { ...data };
    if (sanitizedData.accessKey) sanitizedData.accessKey = sanitizedData.accessKey.trim();
    if (sanitizedData.secretKey) sanitizedData.secretKey = sanitizedData.secretKey.trim();

    const [updated] = await db
      .update(awsAccounts)
      .set(sanitizedData)
      .where(eq(awsAccounts.id, id))
      .returning();
    return updated;
  }

  async deleteAwsAccount(id: number): Promise<void> {
    await db.delete(awsActivities).where(eq(awsActivities.awsAccountId, id));
    await db.delete(awsAccounts).where(eq(awsAccounts.id, id));
  }

  async getAwsActivities(accountId?: number): Promise<(AwsActivity & { account: AwsAccount | null })[]> {
    const filters = accountId ? [eq(awsActivities.awsAccountId, accountId)] : [];
    
    return await db.query.awsActivities.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
      with: {
        account: true,
      },
      orderBy: desc(awsActivities.eventTime),
      limit: 1000,
    }) as (AwsActivity & { account: AwsAccount | null })[];
  }

  async createAwsActivity(activity: InsertAwsActivity): Promise<AwsActivity> {
    const [newActivity] = await db.insert(awsActivities).values(activity).returning();
    return newActivity;
  }

  async getAwsActivityExists(accountId: number, eventTime: Date, eventName: string): Promise<boolean> {
    const [existing] = await db
      .select({ id: awsActivities.id })
      .from(awsActivities)
      .where(
        and(
          eq(awsActivities.awsAccountId, accountId),
          eq(awsActivities.eventTime, eventTime),
          eq(awsActivities.eventName, eventName)
        )
      )
      .limit(1);
    return !!existing;
  }
  
  async deleteAwsNoise(): Promise<void> {
    await db.delete(awsActivities).where(
      sql`${awsActivities.eventName} IN ('LookupEvents', 'ListManagedNotificationEvents', 'GetServiceQuota', 'ListServiceQuotas', 'GetAccountQuota', 'GetEventSelectors', 'ListTags', 'DescribeInstances')`
    );
  }

  async expireOldPayments(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db.update(payments)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(payments.status, 'pending'),
          sql`${payments.createdAt} < ${oneHourAgo}`
        )
      );
  }

  async getPendingPaymentByAmount(userId: number, amount: number): Promise<Payment | undefined> {
    const [existing] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.telegramUserId, userId),
          eq(payments.amount, amount),
          eq(payments.status, 'pending')
        )
      )
      .limit(1);
    return existing;
  }

  // Special Offers
  async getSpecialOffers(): Promise<(SpecialOffer & { product: Product | null })[]> {
    return await db.query.specialOffers.findMany({
      with: {
        product: true
      },
      orderBy: desc(specialOffers.createdAt)
    }) as (SpecialOffer & { product: Product | null })[];
  }

  async getSpecialOffer(id: number): Promise<SpecialOffer | undefined> {
    const [offer] = await db.select().from(specialOffers).where(eq(specialOffers.id, id));
    return offer;
  }

  async createSpecialOffer(offer: InsertSpecialOffer): Promise<SpecialOffer> {
    const [newOffer] = await db.insert(specialOffers).values(offer).returning();
    return newOffer;
  }

  async updateSpecialOffer(id: number, data: Partial<InsertSpecialOffer>): Promise<SpecialOffer> {
    const [updated] = await db.update(specialOffers).set(data).where(eq(specialOffers.id, id)).returning();
    return updated;
  }

  async deleteSpecialOffer(id: number): Promise<void> {
    await db.delete(specialOffers).where(eq(specialOffers.id, id));
  }

  async getActiveSpecialOffers(): Promise<(SpecialOffer & { product: Product | null })[]> {
    const results = await db
      .select({
        offer: specialOffers,
        product: products,
      })
      .from(specialOffers)
      .leftJoin(products, eq(specialOffers.productId, products.id))
      .where(
        and(
          eq(specialOffers.status, "active"),
          or(
            isNull(specialOffers.expiresAt),
            gt(specialOffers.expiresAt, new Date())
          )
        )
      )
      .orderBy(desc(specialOffers.createdAt));

    const enriched = await Promise.all(results.map(async r => {
      try {
        const stock = await db.select({ value: sql<number>`count(*)` })
          .from(credentials)
          .where(and(eq(credentials.productId, r.offer.productId), eq(credentials.status, "available")));
        
        const availableCount = Number(stock[0]?.value || 0);
        const required = r.offer.bundleQuantity || 1;
        
        if (availableCount < required) return null;
        
        return {
          ...r.offer,
          product: r.product
        };
      } catch (err) {
        console.error(`Error processing offer ${r.offer.id}:`, err);
        return null;
      }
    }));

    return enriched.filter((o): o is any => o !== null);
  }

  // Backups Implementation
  async getBackupConfigs(): Promise<BackupConfig[]> {
    return await db.select().from(backupConfigs);
  }

  async createBackupConfig(config: InsertBackupConfig): Promise<BackupConfig> {
    const [newConfig] = await db.insert(backupConfigs).values(config).returning();
    return newConfig;
  }

  async updateBackupConfig(id: number, data: Partial<BackupConfig>): Promise<BackupConfig> {
    const [updated] = await db
      .update(backupConfigs)
      .set(data)
      .where(eq(backupConfigs.id, id))
      .returning();
    return updated;
  }

  async getBackupLogs(limit: number = 50): Promise<BackupLog[]> {
    return await db.select().from(backupLogs).orderBy(desc(backupLogs.createdAt)).limit(limit);
  }

  async createBackupLog(log: InsertBackupLog): Promise<BackupLog> {
    const [newLog] = await db.insert(backupLogs).values(log).returning();
    return newLog;
  }

  async clearOldBackupLogs(days: number): Promise<void> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await db.delete(backupLogs).where(sql`${backupLogs.createdAt} < ${cutoff}`);
  }

  // Push Subscriptions
  async savePushSubscription(userId: number, subscription: any): Promise<void> {
    const [existing] = await db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), sql`${pushSubscriptions.subscription}->>'endpoint' = ${subscription.endpoint}`))
      .limit(1);

    if (!existing) {
      await db.insert(pushSubscriptions).values({
        userId,
        subscription,
      });
    }
  }

  async getPushSubscriptions(userId?: number): Promise<any[]> {
    const query = db.select().from(pushSubscriptions);
    if (userId) {
      query.where(eq(pushSubscriptions.userId, userId));
    }
    return await query;
  }
}

export const storage = new DatabaseStorage();
