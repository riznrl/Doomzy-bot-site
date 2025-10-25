// ---------- Non-destructive startup guards ----------
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason?.stack || reason);
});

setInterval(() => {
  try {
    console.log('🫀 alive', new Date().toISOString());
  } catch {}
}, 15000);

// -----------------------------------------------------
import express from 'express';
import { promises as fsp } from 'fs';
import process from 'process';
import 'dotenv/config';
import { runHydraCheck } from './hydraDebug.js';
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
  AttachmentBuilder,
  Partials
} from 'discord.js';
import multer from 'multer';
import fs from 'fs';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { requireAuth, setDiscordClient } from './middleware/auth.js';

const upload = multer({ dest: 'uploads/' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let startupError = null;
let coreStatus = '🟡 Not Started';

// Debug express
export const debugApp = express();
const DEBUG_PORT = process.env.PORT || 3000;
debugApp.get('/', (req, res) =>
  res.send(`<h1>Doomzy Debug</h1><p>Status: ${coreStatus}</p>${startupError ? `<pre>${startupError}</pre>` : 'No errors'}`)
);
debugApp.get('/status', (req, res) =>
  res.json({ status: coreStatus, error: startupError, time: new Date().toISOString() })
);
debugApp.get('/debug', async (req, res) => {
  try {
    const log = await fsp.readFile('./logs/debug.log', 'utf-8');
    res.send(`<pre>${log}</pre>`);
  } catch {
    res.send('No debug log found.');
  }
});
const debugServer = debugApp.listen(DEBUG_PORT, () =>
  console.log(`🧠 Debug server listening on port ${DEBUG_PORT}`)
);

coreStatus = '🟢 Running main startup logic...';

// -----------------------------------------------------

async function logToControlBridge(message, type = 'error') {
  try {
    const url = `http://localhost:${process.env.CONTROLBRIDGE_PORT || 3001}/log`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        log: `[${type.toUpperCase()}] ${message}`,
        timestamp: new Date().toISOString(),
        source: 'doomzy-server'
      })
    }).catch(() => {});
  } catch (err) {
    console.error('ControlBridge logging failed:', err.message);
  }
}

const env = (k, d = '') => process.env[k] ?? d;
const PORT = Number(env('PORT', 8080));
const SESSION_SECRET = env('SESSION_SECRET', 'dev_' + Math.random().toString(36).slice(2));

const ALLOWED_USER_IDS = env('ALLOWED_USER_IDS')?.split(/[\s,]+/).filter(Boolean) || [];
const PROFILES_CHANNEL_ID = env('PROFILES_CHANNEL_ID');
const BADGES_CHANNEL_ID = env('BADGES_CHANNEL_ID');
const RESOURCES_CHANNEL_ID = env('RESOURCES_CHANNEL_ID');
const TASKS_CHANNEL_ID = env('TASKS_CHANNEL_ID');
const STORAGE_CHANNEL_ID = env('STORAGE_CHANNEL_ID');
const GLOBAL_FEED_CHANNEL_ID = env('GLOBAL_FEED_CHANNEL_ID');
const SITE_ANNOUNCEMENTS_ID = env('SITE_ANNOUNCEMENTS_ID');
const CLIENT_ID = env('CLIENT_ID');
const CLIENT_SECRET = env('CLIENT_SECRET');
const REDIRECT_URI = env('REDIRECT_URI', 'https://doomzyink.com/auth/callback');

// --- EXPRESS ---
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.set('trust proxy', 1);
app.use(
  session({
    name: 'sess',
    secret: SESSION_SECRET,
    httpOnly: true,
    sameSite: 'lax',
    secure: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

app.get('/healthz', (_, res) => res.status(200).send('ok'));
app.get('/health', (_, res) => res.status(200).send('OK'));

// ---- DISCORD LOGIN ----
if (CLIENT_ID && REDIRECT_URI) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: CLIENT_ID,
        clientSecret: CLIENT_SECRET || 'unused',
        callbackURL: REDIRECT_URI,
        scope: ['identify']
      },
      (accessToken, refreshToken, profile, done) => done(null, { id: profile.id, username: profile.username, avatar: profile.avatar })
    )
  );
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));
  app.use(passport.initialize());
  app.use(passport.session());
  app.get('/auth/login', passport.authenticate('discord'));
  app.get(
    '/auth/callback',
    passport.authenticate('discord', { failureRedirect: '/?login=failed' }),
    (req, res) => {
      if (req.user) req.session.user = req.user;
      res.redirect('/dashboard?login=success');
    }
  );
  app.get('/auth/me', (req, res) =>
    req.user ? res.json({ ok: true, user: req.user }) : res.status(401).json({ ok: false })
  );
  app.get('/auth/logout', (req, res) => req.logout(() => res.redirect('/')));
}

// ---- DISCORD BOT ----
let client = null;
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN || '');

async function registerCommands() {
  try {
    if (!process.env.CLIENT_ID) return;
    const commands = [
      new SlashCommandBuilder().setName('ping').setDescription('Health check'),
      new SlashCommandBuilder()
        .setName('update_page')
        .setDescription('Upload HTML/JS for a page')
        .addStringOption((opt) => opt.setName('page').setDescription('page name').setRequired(true))
    ];
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands.map((c) => c.toJSON())
    });
    console.log('✅ Slash commands registered');
  } catch (e) {
    console.warn('Slash registration skipped:', e.message);
  }
}

async function initBot() {
  try {
    const token = env('DISCORD_BOT_TOKEN');
    if (!token) {
      await logToControlBridge('No DISCORD_BOT_TOKEN provided', 'warning');
      return;
    }
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ],
      partials: [Partials.Channel]
    });
    client.on('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));
    await client.login(token);
    await registerCommands();
    setDiscordClient(client);
  } catch (e) {
    console.error('Discord init failed:', e.message);
  }
}

io.on('connection', (socket) => {
  console.log('🔌 Connected:', socket.id);
  socket.on('disconnect', () => console.log('🔌 Disconnected:', socket.id));
});

// ---- ROUTES ----
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ... keep your API routes as written ...

// ---- LAUNCH FIXED ----
(async () => {
  try {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 Web server listening on :${PORT}`);
      console.log(`🔧 ControlBridge monitoring active`);
      coreStatus = '🟢 Server running';
    });

    // ✅ Non-blocking ControlBridge launch
    import('./doomzy-controlbridge/index.js')
      .then(() => console.log(`🌉 ControlBridge started on port ${process.env.CONTROLBRIDGE_PORT || 3001}`))
      .catch((e) => console.error('ControlBridge failed to start (non-fatal):', e?.stack || e));

    // ✅ Non-blocking Task Executor
    import('./task-executor.js')
      .then((task) => {
        if (typeof task.startTaskMonitoring === 'function') {
          task.startTaskMonitoring();
          console.log(`📋 Task Executor started`);
        } else {
          console.warn('⚠️ Task Executor missing startTaskMonitoring()');
        }
      })
      .catch((err) => console.warn('⚠️ Task Executor failed to start:', err.message));

    // ✅ Discord Bot
    await initBot();

    console.log('✅ Startup complete, all systems initialized.');
  } catch (err) {
    console.error('🚨 Startup failure:', err?.stack || err);
    await logToControlBridge(`Startup error: ${err?.message || err}`, 'error');
  }
})();

// ---- GRACEFUL SHUTDOWN ----
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received. Shutting down...');
  try {
    debugServer.close();
    server.close();
    process.exit(0);
  } catch (e) {
    console.error('Shutdown error:', e);
    process.exit(1);
  }
});
