# DigitalOcean App Platform Configuration

Your application is ready to be hosted on DigitalOcean App Platform. Below are the steps and configurations needed for a successful deployment.

## Prerequisites
- A DigitalOcean account.
- A GitHub/GitLab/Bitbucket repository containing this project.
- A PostgreSQL database (DigitalOcean Managed Database is recommended).

## Deployment Steps
1. **Create App**: In DigitalOcean, click "Create" -> "Apps" and connect your repository.
2. **Environment Variables**: Add the following in the DigitalOcean App Platform dashboard:
   - `DATABASE_URL`: Your production database connection string.
   - `TELEGRAM_BOT_TOKEN`: Your Telegram Bot API token.
   - `SESSION_SECRET`: A long, random string for session security.
   - `NODE_ENV`: `production`
   - `PGSSLMODE`: `no-verify` (if using a self-signed certificate, though managed DBs usually provide proper certs).
3. **Build Command**: `npm run build`
4. **Run Command**: `npm start`
5. **HTTP Port**: Set to `5000`.

## Database Setup
Run the following command once to push your schema to the production database:
```bash
npm run db:push
```

## Static Assets
The application serves static files from the `dist/public` directory in production. Ensure your build script correctly bundles the frontend.
