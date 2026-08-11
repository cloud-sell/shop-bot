# CloudShop - Telegram Cloud Account Selling Bot

## Overview

CloudShop is a full-stack application for selling cloud account credentials through a Telegram bot, with an admin web dashboard for management. The system allows administrators to add, manage, and sell cloud service credentials (AWS, DigitalOcean, Google Cloud, etc.) while customers interact through a Telegram bot to browse and purchase accounts.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS with custom premium purple-blue glass UI theme
- **Build Tool**: Vite with path aliases (@/, @shared/, @assets/)

The frontend follows a page-based structure with protected routes requiring authentication. The layout uses a shell component with sidebar navigation for dashboard, products, orders, and settings pages.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints defined in shared/routes.ts with Zod validation
- **Build**: esbuild for production bundling with selective dependency bundling

The server uses a modular approach with routes registered through a central function. Authentication middleware protects all API endpoints except login.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: shared/schema.ts (shared between frontend and backend)
- **Migrations**: Drizzle Kit with migrations stored in /migrations
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple

Key database tables:
- `products`: Cloud account credentials with type, content, price, and status
- `telegram_users`: Telegram user information for order tracking
- `orders`: Purchase records linking products and Telegram users
- `payments`: Payment transactions for Cryptomus integration with UUID tracking
- `settings`: Key-value configuration storage (e.g., Telegram bot token)
- `users`: Admin users via Replit Auth
- `sessions`: Session storage for authentication

### Authentication
- **Method**: Replit Auth (OpenID Connect)
- **Session Management**: Express sessions with PostgreSQL store
- **Implementation**: Located in server/replit_integrations/auth/

The auth system handles user login via Replit's OAuth flow, stores user profiles in the database, and protects routes with the `isAuthenticated` middleware.

### Telegram Bot Integration
- **Library**: node-telegram-bot-api
- **Configuration**: Bot token stored in settings table, configurable via dashboard
- **Features**: Product browsing, purchasing, credential delivery, and payment methods
- **Payment Methods**: Binance, Cryptocurrency (BTC, ETH, USDT), Cryptomus
- **Profile Display**: Shows user ID, balance, and purchased goods count

### Payment Gateway Integration
- **Cryptomus**: Payment gateway for accepting USDT, BTC, and other crypto payments
- **API Endpoints**:
  - `POST /api/payments/create-cryptomus`: Create payment and generate invoice
  - `POST /api/payments/webhook`: Handle Cryptomus payment confirmations
- **Features**: 
  - Automatic balance updates on payment confirmation
  - Payment status tracking (pending, completed, failed)
  - Webhook integration for real-time payment updates

## External Dependencies

### Third-Party Services
- **Replit Auth**: OAuth/OIDC authentication provider
- **Telegram Bot API**: Customer-facing bot interface
- **PostgreSQL**: Primary database (provisioned via Replit)

### Key NPM Packages
- `drizzle-orm` + `drizzle-kit`: Database ORM and migrations
- `node-telegram-bot-api`: Telegram bot functionality
- `express-session` + `connect-pg-simple`: Session management
- `@tanstack/react-query`: Frontend data fetching
- `zod` + `drizzle-zod`: Schema validation
- `recharts`: Dashboard analytics charts
- `date-fns`: Date formatting

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption
- `REPL_ID`: Replit environment identifier
- `ISSUER_URL`: Replit OIDC issuer (defaults to https://replit.com/oidc)