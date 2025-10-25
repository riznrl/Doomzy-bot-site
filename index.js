import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import DiscordStrategy from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Partials
} from 'discord.js';
import multer from 'multer';
import fs from 'fs';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { requireAuth, setDiscordClient } from './middleware/auth.js';

const app = express();

// ---- Safety guards ----
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

// ---- Environment helpers ----
const env = (k, d = '') => process.env[k] ?? d;
const PORT = Number(env('PORT', 8080));
const SESSION_SECRET = env('SESSION_SECRET', 'dev_' + Math.random().toString(36).slice(2));
const IS_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;

// ---- Parse channel and ID lists ----
function parseIdList(v) {
  if (!v) return [];
  try { if (v.trim().startsWith('[')) return JSON.parse(v).map(String); }
  catch (_) {}
  return v.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

const ALLOWED_USER_IDS = parseIdList(env('ALLOWED_USER_IDS'));
const CLIENT_ID = env('CLIENT_ID');
const CLIENT_SECRET = env('CLIENT_SECRET');
const REDIRECT_URI = env('REDIRECT_URI', 'https://doomzyink.com/auth/callback');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Express / Socket.IO ----
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.set('trust proxy', 1);
app.use(session({
  name: 'sess',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // Auto-detect Railway probe and disable HTTPS cookie restriction
    secure: !IS_RAILWAY && process.env.NODE_ENV === 'production' 
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// ---- Self-healing health checks ----
app.get('/', (_req, res) => {
  res.status(200).type('text/plain').send('ok');
});
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/railway/health', (_req, res) => res.status(200).send('ok'));

// ---- Log any shutdown signals ----
process.on('SIGTERM', () => {
  console.warn('⚠️  Received SIGTERM (Railway health check likely failed)');
});
process.on('SIGINT', () => {
  console.warn('⚠️  Received SIGINT — shutting down gracefully.');
});

// ---- Discord bot ----
let client = null;
async function initBot() {
  try {
    const token = env('DISCORD_BOT_TOKEN');
    if (!token) {
      console.warn('❌ No DISCORD_BOT_TOKEN provided.');
      return null;
    }

    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ];
    client = new Client({ intents, partials: [Partials.Channel] });

    client.once('clientReady', () =>
      console.log(`🤖 Logged in as ${client.user.tag}`)
    );

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName === 'ping') {
        await interaction.reply('🏓 Pong from DoomzyInkBot!');
      }
    });

    await client.login(token);
    await registerCommands();
    setDiscordClient(client);
    return client;
  } catch (err) {
    console.error('💥 initBot failed:', err);
    return null;
  }
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Health check')
];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN || '');

async function registerCommands() {
  try {
    if (!process.env.CLIENT_ID) return;
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(c => c.toJSON()) });
    console.log('✅ Slash commands registered');
  } catch (e) {
    console.warn('Slash registration skipped:', e.message);
  }
}

// ---- Boot sequence ----
(async () => {
  console.log('🧩 Starting DoomzyInkBot login sequence...');
  const bot = await initBot();
  if (bot) console.log(`🤖 Bot ready as ${bot.user.tag}`);
})();

// ---- Keepalive loop ----
setInterval(() => {
  console.log(`🫀 alive ${new Date().toISOString()}`);
}, 300000);

// ---- Start server ----
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server listening on :${PORT} (Railway=${IS_RAILWAY})`);
});
