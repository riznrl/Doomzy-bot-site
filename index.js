import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import DiscordStrategy from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder, Partials } from 'discord.js';
import multer from 'multer';
import fs from 'fs';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { requireAuth, setDiscordClient } from './middleware/auth.js';

const app = express();

// --- Minimal crash guard so Railway doesn't 502 ---
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

// --- Env helpers ---
const env = (k, d = '') => process.env[k] ?? d;
const PORT = Number(env('PORT', 8080));
const SESSION_SECRET = env('SESSION_SECRET', 'dev_' + Math.random().toString(36).slice(2));

// Accept either comma-separated string or JSON array for IDs
function parseIdList(v) {
  if (!v) return [];
  try {
    if (v.trim().startsWith('[')) return JSON.parse(v).map(String);
  } catch (_) {}
  return v.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

const ALLOWED_USER_IDS = parseIdList(env('ALLOWED_USER_IDS')); // e.g. "1417596590335725710,1234"

// Optional channels (string IDs)
const PROFILES_CHANNEL_ID  = env('PROFILES_CHANNEL_ID');
const BADGES_CHANNEL_ID    = env('BADGES_CHANNEL_ID');
const RESOURCES_CHANNEL_ID = env('RESOURCES_CHANNEL_ID');
const TASKS_CHANNEL_ID     = env('TASKS_CHANNEL_ID');
const STORAGE_CHANNEL_ID   = env('STORAGE_CHANNEL_ID');
const GLOBAL_FEED_CHANNEL_ID = env('GLOBAL_FEED_CHANNEL_ID');
const SITE_ANNOUNCEMENTS_ID = env('SITE_ANNOUNCEMENTS_ID');

// OAuth settings
const CLIENT_ID     = env('CLIENT_ID');
const CLIENT_SECRET = env('CLIENT_SECRET');
const REDIRECT_URI  = env('REDIRECT_URI', 'https://doomzyink.com/auth/callback');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create HTTP server and Socket.IO
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.set('trust proxy', 1);
app.use(session({
  name: 'sess',
  secret: SESSION_SECRET,
  httpOnly: true,
  sameSite: 'lax',
  secure: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Health for Railway
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// ---- Improved API status route ----
app.get('/api/status', async (_req, res) => {
  res.json({
    ok: true,
    bot: client?.user?.tag || 'offline',
    uptime: process.uptime(),
    guilds: client?.guilds?.cache?.size || 0
  });
});

// Safe status (no secrets)
app.get('/status', (_req, res) => {
  res.json({
    ok: true,
    hasDiscordToken: Boolean(process.env.DISCORD_BOT_TOKEN),
    allowedUsers: ALLOWED_USER_IDS.length,
    profiles: Boolean(PROFILES_CHANNEL_ID),
    resources: Boolean(RESOURCES_CHANNEL_ID),
    badges: Boolean(BADGES_CHANNEL_ID),
    tasks: Boolean(TASKS_CHANNEL_ID),
    globalFeed: Boolean(GLOBAL_FEED_CHANNEL_ID),
    siteAnnouncements: Boolean(SITE_ANNOUNCEMENTS_ID)
  });
});

// ---- Discord OAuth2 (login) ----
if (CLIENT_ID && REDIRECT_URI) {
  passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET || 'unused-when-using-bot-only',
    callbackURL: REDIRECT_URI,
    scope: ['identify']
  }, (accessToken, refreshToken, profile, done) => {
    return done(null, { id: profile.id, username: profile.username, avatar: profile.avatar });
  }));
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));
  app.use(passport.initialize());
  app.use(passport.session());
  app.get('/auth/login', passport.authenticate('discord'));
  app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/?login=failed' }), (req, res) => {
    if (req.user) {
      req.session.user = {
        id: req.user.id,
        username: req.user.username,
        avatar: req.user.avatar
      };
    }
    res.redirect('/dashboard?login=success');
  });
  app.get('/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ ok: false });
    res.json({ ok: true, user: req.user });
  });
  app.get('/auth/logout', (req, res) => req.logout(() => res.redirect('/')));
}

// ---- Discord bot setup ----
let client = null;

// ✅ Graceful-intent fallback + safer bot init
async function initBot() {
  try {
    const token = env('DISCORD_BOT_TOKEN');
    if (!token) {
      console.warn('❌ No DISCORD_BOT_TOKEN provided, skipping bot initialization.');
      return null;
    }

    const baseIntents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
    const optionalIntents = [GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers];

    try {
      client = new Client({
        intents: [...baseIntents, ...optionalIntents],
        partials: [Partials.Channel]
      });
    } catch (err) {
      console.warn('⚠️ Privileged intents failed, falling back to minimal intents:', err.message);
      client = new Client({
        intents: baseIntents,
        partials: [Partials.Channel]
      });
    }

    client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName === 'ping') {
        await interaction.reply('🏓 Pong from DoomzyInkBot!');
      }
    });

    await client.login(token).catch(e => {
      console.error('💥 Discord login failed:', e.message);
      return null;
    });

    await registerCommands().catch(e => console.warn('Slash registration skipped:', e.message));

    setDiscordClient(client);
    return client;
  } catch (err) {
    console.error('💥 initBot() failed (non-fatal):', err);
    return null;
  }
}

// ---- Start HTTP server first ---
server.listen(PORT, '0.0.0.0', () =>
  console.log(`🌐 Web server listening on :${PORT}`)
);

// ---- WebSocket connection handling ----
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// ---- Discord message listener for site announcements ---
function setupDiscordListeners(bot) {
  bot.on('messageCreate', (msg) => {
    if (
      SITE_ANNOUNCEMENTS_ID &&
      msg.channelId === SITE_ANNOUNCEMENTS_ID &&
      !msg.author.bot
    ) {
      io.emit('trigger-announcement-notification', {
        message: msg.content.slice(0, 150),
        url: `https://discord.com/channels/${msg.guildId}/${msg.channelId}/${msg.id}`
      });
    }
  });
}

// ---- Register Slash Commands ----
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Health check')
];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN || '');
async function registerCommands() {
  try {
    if (!process.env.CLIENT_ID) return;
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands.map(c => c.toJSON()) });
    console.log('✅ Slash commands registered');
  } catch (e) {
    console.warn('Slash registration skipped:', e.message);
  }
}

// ✅ ---- Enhanced Debug Bot Login (Final Section) ----
(async () => {
  try {
    const token = env('DISCORD_BOT_TOKEN');
    console.log('🧩 Starting DoomzyInkBot login sequence...');
    if (!token) {
      console.warn('❌ DISCORD_BOT_TOKEN is missing or empty! Check Railway variables.');
    } else {
      console.log('✅ DISCORD_BOT_TOKEN appears to be set.');
      console.log('🔑 Token begins with:', token.slice(0, 10) + '...');
    }

    const bot = await initBot();
    if (bot) {
      console.log(`🤖 Bot ready as ${bot?.user?.tag ?? 'unknown'}`);
      setupDiscordListeners(bot);
    } else {
      console.warn('⚠️ initBot() returned null — bot not initialized.');
    }
  } catch (err) {
    console.error('💥 Failed to login bot (non-fatal):', err?.message || err);
  }
})();
