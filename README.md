# Bigger is Better - Dashboard & Discord Bot

A modern productivity dashboard with Discord integration. Features task management, file uploads, and a beautiful landing page with Discord OAuth authentication.

## Features

- 🎨 **Modern Landing Page**: "Bigger is Better" branded landing page with Discord login
- 🔐 **Discord Authentication**: Secure OAuth login system
- 📅 **Task Management**: Create and manage tasks with priorities and due dates
- 🤖 **Discord Bot Integration**: Bot handles task storage and file uploads
- 📁 **File Upload System**: Upload files through the dashboard
- 📱 **Responsive Design**: Works on all devices
- 🌈 **Beautiful UI**: Glassmorphism design with purple gradients

## Setup

### Discord Bot Setup
1. Create a Discord application at https://discord.com/developers/applications
2. Go to the "Bot" section and create a bot
3. Copy the bot token
4. Go to the "OAuth2" section and add the redirect URI: `https://yourdomain.com/auth/callback`
5. Copy the Client ID

### Environment Variables
Create a `.env` file with:
```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here
REDIRECT_URI=http://localhost:8080/auth/callback
PORT=8080
STORAGE_CHANNEL_ID=your_discord_channel_id_for_file_storage
TASKS_CHANNEL_ID=your_discord_channel_id_for_tasks
SESSION_SECRET=your_random_secret_string
```

### Running Locally
```bash
npm install
npm start
```

Visit `http://localhost:8080` to see the landing page!

## How It Works

1. **Landing Page**: Users see the "Bigger is Better" landing page with Discord login
2. **Authentication**: OAuth flow redirects users through Discord
3. **Dashboard**: After login, users access the full dashboard with tasks and file uploads
4. **Bot Integration**: The Discord bot handles backend operations and storage

## Discord Bot Permissions

Your bot needs these permissions in the channels where it will operate:
- Send Messages
- Use Slash Commands
- Attach Files
- Read Message History

## Endpoints

- `GET /` - Landing page with Discord login
- `GET /dashboard` - Protected dashboard (requires authentication)
- `GET /api/status` - Bot status and health check
- `POST /api/tasks` - Create tasks (Discord bot integration)
- `POST /api/upload/chunk` - Upload file chunks
- `POST /api/upload/manifest` - Complete file upload
- Discord OAuth endpoints: `/auth/login`, `/auth/callback`, `/auth/logout`

## Deployment

Deploy on Railway, Heroku, or any Node.js hosting platform. Make sure to set all environment variables correctly.
