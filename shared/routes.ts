import { z } from 'zod';
import { insertProductSchema, insertCredentialSchema, products, credentials, orders, telegramUsers, payments } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  products: {
    list: {
      method: 'GET' as const,
      path: '/api/products',
      responses: {
        200: z.array(z.custom<typeof products.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/products',
      input: insertProductSchema,
      responses: {
        201: z.custom<typeof products.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/products/:id',
      input: insertProductSchema.partial(),
      responses: {
        200: z.custom<typeof products.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/products/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  orders: {
    list: {
      method: 'GET' as const,
      path: '/api/orders',
      responses: {
        200: z.array(z.custom<typeof orders.$inferSelect & { 
          product: typeof products.$inferSelect | null, 
          telegramUser: typeof telegramUsers.$inferSelect | null,
          credential: typeof credentials.$inferSelect | null
        }>()),
      },
    },
  },
  credentials: {
    list: {
      method: 'GET' as const,
      path: '/api/products/:productId/credentials',
      responses: {
        200: z.array(z.custom<Credential>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/credentials',
      input: insertCredentialSchema,
      responses: {
        201: z.custom<Credential>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/credentials/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/credentials/:id',
      input: insertCredentialSchema.partial(),
      responses: {
        200: z.custom<Credential>(),
        404: errorSchemas.notFound,
      },
    },
  },
  stats: {
    get: {
      method: 'GET' as const,
      path: '/api/stats',
      responses: {
        200: z.object({
          totalSales: z.number(),
          dailySales: z.number(),
          totalRevenue: z.number(),
          dailyRevenue: z.number(),
          availableProducts: z.number(),
        }),
      },
    },
  },
  settings: {
    get: {
      method: 'GET' as const,
      path: '/api/settings/:key',
      responses: {
        200: z.object({ key: z.string(), value: z.string() }).optional(),
      },
    },
    update: {
      method: 'POST' as const,
      path: '/api/settings',
      input: z.object({ key: z.string(), value: z.string() }),
      responses: {
        200: z.object({ key: z.string(), value: z.string() }),
      },
    },
  },
  telegramUsers: {
    list: {
      method: 'GET' as const,
      path: '/api/telegram-users',
      responses: {
        200: z.array(z.custom<typeof telegramUsers.$inferSelect>()),
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/telegram-users/:id',
      input: z.object({ balance: z.number().optional(), purchased: z.number().optional() }),
      responses: {
        200: z.custom<typeof telegramUsers.$inferSelect>(),
      },
    },
  },
  payments: {
    list: {
      method: 'GET' as const,
      path: '/api/payments',
      responses: {
        200: z.array(z.custom<typeof payments.$inferSelect & { telegramUser: typeof telegramUsers.$inferSelect | null }>()),
      },
    },
  },
  broadcast: {
    channels: {
      list: {
        method: 'GET' as const,
        path: '/api/broadcast/channels',
        responses: {
          200: z.array(z.custom<any>()),
        },
      },
      create: {
        method: 'POST' as const,
        path: '/api/broadcast/channels',
        input: z.object({ channelId: z.string(), name: z.string() }),
        responses: {
          201: z.custom<any>(),
        },
      },
      delete: {
        method: 'DELETE' as const,
        path: '/api/broadcast/channels/:id',
        responses: {
          204: z.void(),
        },
      },
    },
    send: {
      method: 'POST' as const,
      path: '/api/broadcast/send',
      input: z.object({ 
        message: z.string(),
        imageUrl: z.string().optional(),
        buttonText: z.string().optional(),
        buttonUrl: z.string().optional(),
        channelIds: z.array(z.string()).optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean(), count: z.number() }),
      },
    },
    messages: {
      list: {
        method: 'GET' as const,
        path: '/api/broadcast/messages',
        responses: {
          200: z.array(z.custom<any>()),
        },
      },
      create: {
        method: 'POST' as const,
        path: '/api/broadcast/messages',
        input: z.object({ 
          content: z.string(), 
          imageUrl: z.string().optional().nullable(), 
          buttonText: z.string().optional().nullable(),
          buttonUrl: z.string().optional().nullable(),
          interval: z.number().nullable() 
        }),
        responses: {
          201: z.custom<any>(),
        },
      },
      update: {
        method: 'PATCH' as const,
        path: '/api/broadcast/messages/:id',
        input: z.object({ 
          content: z.string().optional(), 
          imageUrl: z.string().optional().nullable(), 
          buttonText: z.string().optional().nullable(),
          buttonUrl: z.string().optional().nullable(),
          interval: z.number().nullable().optional(), 
          status: z.string().optional(), 
          sentCount: z.number().optional() 
        }),
        responses: {
          200: z.custom<any>(),
        },
      },
      delete: {
        method: 'DELETE' as const,
        path: '/api/broadcast/messages/:id',
        responses: {
          204: z.void(),
        },
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
