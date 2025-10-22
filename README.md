# DoomzyInk — All-in-One (Website + Discord Bot)

Deploy on Railway. One Node app serves your dashboard AND runs your Discord bot.

## Railway (mobile)
- Connect repo OR upload folder.
- Add Variables:
```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=1430339848484688053
REDIRECT_URI=https://<your-railway-subdomain>.up.railway.app/auth/callback
PORT=8080
STORAGE_CHANNEL_ID=your_storage_channel_id
TASKS_CHANNEL_ID=your_tasks_channel_id
SESSION_SECRET=change_me
CLIENT_SECRET=your_discord_client_secret_if_using_oauth
```
- Open the service URL to test. Diagnostics bar shows bot status.

## Endpoints
- GET `/api/status`
- POST `/api/tasks` → {title, due, priority, id}
- POST `/api/upload/chunk` (form-data: chunk, fields: filename,index,total)
- POST `/api/upload/manifest` → { filename, parts:[{url,index}] }
