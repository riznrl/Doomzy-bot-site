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
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { requireAuth, setDiscordClient } from './middleware/auth.js';

const app = express();

// --- Safety guards (crash protection) ---
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

// --- Env helpers ---
const env = (k, d = '') => process.env[k] ?? d;
const PORT = Number(env('PORT', 8080));
const SESSION_SECRET = env('SESSION_SECRET', 'dev_' + Math.random().toString(36).slice(2));
const IS_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;

// --- Parse ID list ---
function parseIdList(v) {
  if (!v) return [];
  try {
    if (v.trim().startsWith('[')) return JSON.parse(v).map(String);
  } catch (_) {}
  return v.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

const ALLOWED_USER_IDS = parseIdList(env('ALLOWED_USER_IDS'));
const CLIENT_ID = env('CLIENT_ID');
const CLIENT_SECRET = env('CLIENT_SECRET');
const REDIRECT_URI = env('REDIRECT_URI', 'https://doomzyink.com/auth/callback');

// --- Path setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Express / Socket.IO setup ---
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
    secure: !IS_RAILWAY && process.env.NODE_ENV === 'production'
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// --- Health endpoints (prevents Railway SIGTERM restarts) ---
console.log('🧠 Registering health endpoints...');
const HEALTH_RESPONSE = 'ok';

['/', '/health', '/healthz', '/status', '/up', '/ready', '/live'].forEach(path =>
  app.get(path, (_req, res) => res.status(200).type('text/plain').send(HEALTH_RESPONSE))
);

// --- JSON status endpoint for frontend diagnostics ---
app.get('/api/status', async (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot: client?.user?.tag || 'offline',
    guilds: client?.guilds?.cache?.size || 0,
    railway: IS_RAILWAY,
    hasDiscordToken: Boolean(process.env.DISCORD_BOT_TOKEN),
    allowedUsers: ALLOWED_USER_IDS.length
  });
});

console.log('✅ Health endpoints ready.');

// --- Graceful shutdown logging ---
process.on('SIGTERM', () => {
  console.warn('⚠️ Received SIGTERM (likely Railway health check timeout)');
});
process.on('SIGINT', () => {
  console.warn('⚠️ Received SIGINT — shutting down gracefully.');
});

// --- Discord bot setup ---
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

    // Use new clientReady event to avoid deprecation warning
    client.once('clientReady', () => {
      console.log(`🤖 Logged in as ${client.user.tag}`);
    });

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

// --- Slash Commands ---
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Health check')
];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN || '');

async function registerCommands() {
  try {
    if (!process.env.CLIENT_ID) return;
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log('✅ Slash commands registered');
  } catch (e) {
    console.warn('⚠️ Slash registration skipped:', e.message);
  }
}

// --- Start Bot ---
(async () => {
  console.log('🧩 Starting DoomzyInkBot login sequence...');
  const bot = await initBot();
  if (bot) console.log(`🤖 Bot ready as ${bot.user.tag}`);
  else console.warn('⚠️ Bot initialization failed.');
})();

// --- Socket.IO keepalive logging ---
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);
  socket.on('disconnect', () => console.log('🔌 User disconnected:', socket.id));
});

// --- Keepalive loop (prevents Railway idle stop) ---
setInterval(() => {
  console.log(`🫀 alive ${new Date().toISOString()}`);
}, 300000); // every 5 minutes

// --- Start server ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server listening on :${PORT} (Railway=${IS_RAILWAY})`);
});
