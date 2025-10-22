# Bigger is Better - Dashboard & Discord Bot

A modern productivity dashboard with Discord integration. Features task management, file uploads, and a beautiful landing page with Discord OAuth authentication.

## Features

- 🎨 **Modern Landing Page**: "Bigger is Better" branded landing page with Discord login
- 🔐 **Discord Authentication**: Secure OAuth login system
- 👤 **User Profiles**: Complete profile system with bio, badges, and avatar management
- 📁 **Resources Gallery**: Beautiful grid gallery for browsing and uploading files
- 📅 **Task Management**: Create and manage tasks with priorities and due dates
- 🤖 **Discord Bot Integration**: Bot handles task storage and file uploads
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
STORAGE_CHANNEL_ID=your_storage_channel_id
TASKS_CHANNEL_ID=your_tasks_channel_id
PROFILES_CHANNEL_ID=your_profiles_channel_id
BADGES_CHANNEL_ID=your_badges_channel_id
RESOURCES_CHANNEL_ID=your_resources_channel_id
GUILD_ID=your_guild_id_here
SITE_URL=http://localhost:8080
SESSION_SECRET=your_random_secret_string
GLOBAL_FEED_CHANNEL_ID=your_global_feed_channel_id
```

**Note**: Set `ALLOWED_USER_IDS` to your Discord user ID (or comma-separated list of allowed IDs) to restrict access. Leave empty to allow all authenticated users.

### Discord Channel Setup
1. Create these channels in your Discord server:
   - `#profiles` - For storing user profile data (JSON files)
   - `#badges` - For storing the badges registry
   - `#resources` - For storing avatar images and other media files
   - `#tasks` - For storing task data
   - `#global-feed` - For storing global feed posts (one message = one post)
   - `#storage` - For file uploads and attachments

2. Copy each channel ID and add them to your `.env` file

### Badge System Setup
1. Upload your badge icons (PNG files) to the `#resources` channel
2. Note the message IDs of each badge icon
3. Create a `badges.json` file with your badge definitions:
```json
{
  "kind": "doomzy/badges@1",
  "badges": [
    { "id": "vip", "label": "VIP", "mediaId": "your_message_id_here" },
    { "id": "editor", "label": "Editor", "mediaId": "your_message_id_here" }
  ]
}
```
4. Upload this file to your `#badges` channel via the Discord web interface

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
- `GET /profile.html` - User profile management page
- `GET /resources.html` - Resources gallery page
- `GET /healthz` - Railway health check
- `GET /status` - Service status and configuration info
- `GET /api/profile` - Get current user profile data
- `POST /api/profile` - Update user profile (bio, badges, avatar)
- `GET /api/badges` - Get available badges registry
- `GET /api/resources` - Get resources for gallery
- `GET /api/media/:messageId` - Media proxy for avatars and badges
- `GET /api/global/feed` - Get global feed posts
- `POST /api/global/post` - Post to global feed
- Discord OAuth endpoints: `/auth/login`, `/auth/callback`, `/auth/logout`

## Railway Deployment

This application is hardened for Railway deployment with crash guards and health endpoints.

### Health Endpoints
- `GET /healthz` - Simple health check for Railway (returns `ok`)
- `GET /status` - Detailed status with bot and configuration info
- `GET /api/status` - Bot status and system information

### Deployment Features
- **Crash-resistant**: HTTP server starts first, bot login is non-fatal
- **Environment guards**: Console warnings for missing critical variables
- **Robust auth**: Handles session failures gracefully
- **Error handling**: All API endpoints handle Discord bot unavailability

### Required Environment Variables

Set these in Railway → Variables:

```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here
REDIRECT_URI=https://your-domain.com/auth/callback
SITE_URL=https://your-domain.com
GUILD_ID=your_guild_id_here
RESOURCES_CHANNEL_ID=your_resources_channel_id
BADGES_CHANNEL_ID=your_badges_channel_id
PROFILES_CHANNEL_ID=your_profiles_channel_id
TASKS_CHANNEL_ID=your_tasks_channel_id
STORAGE_CHANNEL_ID=your_storage_channel_id
ALLOWED_USER_IDS=1417596590335725710
SESSION_SECRET=your_long_random_string
```

**Note**: `ALLOWED_USER_IDS` accepts comma-separated values or JSON arrays like `["1417596590335725710"]`.
