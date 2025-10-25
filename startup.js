// ---------- Non-destructive startup guards ----------
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason?.stack || reason);
});

// Heartbeat so Railway health checks don't recycle us before logs print
setInterval(() => {
  try {
    console.log('🫀 alive', new Date().toISOString());
  } catch {}
}, 15000);
// -----------------------------------------------------

// Debug scaffold - Do not remove
import express from 'express';
import { promises as fs } from 'fs';
import process from 'process';

let startupError = null;
let coreStatus = '🟡 Not Started';

export const debugApp = express();
const DEBUG_PORT = process.env.PORT || 3000;

debugApp.get('/', (req, res) => {
  res.send(`<h1>Doomzy Debug</h1><p>Status: ${coreStatus}</p>${startupError ? `<pre>${startupError}</pre>` : 'No errors'}`);
});

debugApp.get('/status', (req, res) => {
  res.json({ status: coreStatus, error: startupError, time: new Date().toISOString() });
});

debugApp.get('/debug', async (req, res) => {
  try {
    const log = await fs.readFile('./logs/debug.log', 'utf-8');
    res.send(`<pre>${log}</pre>`);
  } catch (e) {
    res.send('No debug log found.');
  }
});

const debugServer = debugApp.listen(DEBUG_PORT, () => {
  console.log(`🧠 Debug server listening on port ${DEBUG_PORT}`);
});

// Wrap the rest of the startup file in a try/catch
coreStatus = '🟢 Running main startup logic...';

// Original imports and code continue below
import 'dotenv/config';
import { runHydraCheck } from './hydraDebug.js';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Import auth middleware
import { requireAuth, setDiscordClient } from './middleware/auth.js';

// ControlBridge error logging helper
async function logToControlBridge(message, type = 'error') {
  try {
    const controlBridgeUrl = `http://localhost:${process.env.CONTROLBRIDGE_PORT || 3001}`;
    await fetch(`${controlBridgeUrl}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        log: `[${type.toUpperCase()}] ${message}`,
        timestamp: new Date().toISOString(),
        source: 'doomzy-server'
      })
    }).catch(() => {
      // Silently fail if controlbridge isn't running
    });
  } catch (err) {
    // Fallback to console if controlbridge fails
    console.error('ControlBridge logging failed:', err.message);
  }
}

// --- Env helpers ---
const env = (k, d = '') => process.env[k] ?? d;
const PORT = Number(env('PORT', 8080));
const SESSION_SECRET = env('SESSION_SECRET', 'dev_' + Math.random().toString(36).slice(2));

const ALLOWED_USER_IDS = env('ALLOWED_USER_IDS')?.split(/[\s,]+/).filter(Boolean) || [];

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

// Create HTTP server and Socket.IO
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, specify your domain
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

// Health endpoint for GPT Failsafe system
app.get('/health', (_req, res) => res.status(200).send('OK'));

// Minimal health endpoint for diagnostics bar
app.get('/api/status', async (req, res) => {
  res.json({
    ok: true,
    bot: client ? (client.user ? client.user.tag : 'connecting') : 'disabled',
    uptime: process.uptime(),
    guilds: client ? client.guilds.cache.size : 0
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

// Auth middleware for JSON responses
const requireAuthJson = async (req, res, next) => {
  try {
    const user = req.user || req.session?.user;
    if (!user) return res.status(401).json({ ok: false, error: 'Authentication required' });
    if (ALLOWED_USER_IDS.length && !ALLOWED_USER_IDS.includes(String(user.id))) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    return next();
  } catch (e) {
    console.error('requireAuthJson error', e);
    return res.status(401).json({ ok: false, error: 'Authentication error' });
  }
};

// Root route - always serve the landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve signup page (no auth required - this is for new user requests)
app.get('/signup.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// ---- Discord bot (non-fatal) ----
let client = null;

async function initBot() {
  try {
    const token = env('DISCORD_BOT_TOKEN');
    if (!token) {
      const warning = 'No DISCORD_BOT_TOKEN provided, skipping bot initialization.';
      console.warn(warning);
      await logToControlBridge(warning, 'warning');
      return null;
    }

    await logToControlBridge('Initializing Discord bot...', 'info');

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ],
      partials: [Partials.Channel]
    });

    client.on('ready', () => {
      const readyMsg = `Discord bot logged in as ${client.user.tag}`;
      console.log(`🤖 ${readyMsg}`);
      logToControlBridge(readyMsg, 'success');
    });

    client.on('error', async (error) => {
      const errorMsg = `Discord bot error: ${error.message}`;
      console.error('Discord bot error:', error);
      await logToControlBridge(errorMsg, 'error');
    });

    await client.login(token);
    await registerCommands();
    setDiscordClient(client);

    const successMsg = 'Discord bot initialized successfully';
    console.log(`✅ ${successMsg}`);
    await logToControlBridge(successMsg, 'success');

    return client;
  } catch (error) {
    const errorMsg = `Failed to initialize Discord bot: ${error.message}`;
    console.error('Failed to initialize bot (non-fatal):', error.message);
    await logToControlBridge(errorMsg, 'error');
    return null;
  }
}

// ---- Register a few slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('update_page')
    .setDescription('Upload HTML/JS for a page')
    .addStringOption(opt => opt.setName('page').setDescription('page name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Health check'),
  new SlashCommandBuilder()
    .setName('approve')
    .setDescription('Approve a signup request by message ID')
    .addStringOption(opt => opt.setName('message_id').setDescription('Discord message ID of the signup request').setRequired(true)),
  new SlashCommandBuilder()
    .setName('reject')
    .setDescription('Reject a signup request by message ID')
    .addStringOption(opt => opt.setName('message_id').setDescription('Discord message ID of the signup request').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for rejection').setRequired(false))
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
    console.warn('Slash registration skipped:', e.message);
  }
}

// WebSocket connection handling
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

// ---- Log in the Discord bot, but do NOT crash the HTTP server if login fails ---
(async () => {
  try {
    const token = env('DISCORD_BOT_TOKEN');
    if (!token) {
      const warning = 'No DISCORD_BOT_TOKEN provided, skipping bot login.';
      console.warn(warning);
      await logToControlBridge(warning, 'warning');
      return;
    }

    await logToControlBridge('Starting Discord bot initialization...', 'info');

    const bot = await initBot();
    if (bot) {
      const readyMsg = `Discord bot ready as ${bot?.user?.tag ?? 'unknown'}`;
      console.log(`🤖 ${readyMsg}`);
      await logToControlBridge(readyMsg, 'success');
      setupDiscordListeners(bot);
    } else {
      await logToControlBridge('Discord bot initialization failed', 'error');
    }
  } catch (err) {
    const errorMsg = `Failed to login Discord bot: ${err?.message || err}`;
    console.error('Failed to login bot (non-fatal):', err?.message || err);
    await logToControlBridge(errorMsg, 'error');
  }
})();

// Signup request handler
app.post('/api/signup', async (req, res) => {
  await logToControlBridge(`Signup request from ${req.body.discordId} (${req.body.email})`, 'info');

  try {
    const { fullName, discordId, email, reason } = req.body;

    // Validate required fields
    if (!fullName || !discordId || !email || !reason) {
      await logToControlBridge('Signup validation failed: missing required fields', 'error');
      return res.status(400).json({ ok: false, error: 'missing_required_fields' });
    }

    const signupChannelId = process.env.DISCORD_SIGNUP_CHANNEL_ID;
    if (!signupChannelId) {
      console.error('DISCORD_SIGNUP_CHANNEL_ID not configured');
      await logToControlBridge('Signup failed: DISCORD_SIGNUP_CHANNEL_ID not configured', 'error');
      return res.status(500).json({ ok: false, error: 'signup_channel_not_configured' });
    }

    if (!client) {
      console.error('Discord bot not available for signup processing');
      await logToControlBridge('Signup failed: Discord bot not available', 'error');
      return res.status(503).json({ ok: false, error: 'bot_not_available' });
    }

    // Create signup embed
    const embed = {
      title: '🆕 New Community Access Request',
      color: 0x8b5cf6,
      fields: [
        { name: 'Full Name', value: fullName, inline: true },
        { name: 'Discord ID', value: discordId, inline: true },
        { name: 'Email', value: email, inline: true },
        { name: 'Reason for Joining', value: reason.slice(0, 1000), inline: false },
        { name: 'Submitted', value: new Date().toLocaleString(), inline: true },
        { name: 'Status', value: '⏳ **Pending Review**', inline: true }
      ],
      footer: {
        text: 'Use /approve or /reject commands to process this request'
      }
    };

    // Send to signup channel
    const channel = await client.channels.fetch(signupChannelId);
    if (!channel) {
      console.error(`Signup channel ${signupChannelId} not found`);
      await logToControlBridge(`Signup failed: channel ${signupChannelId} not found`, 'error');
      return res.status(500).json({ ok: false, error: 'signup_channel_not_found' });
    }

    const message = await channel.send({ embeds: [embed] });

    const successMsg = `Signup request submitted by ${fullName} (${discordId}) - Message ID: ${message.id}`;
    console.log(`✅ ${successMsg}`);
    await logToControlBridge(successMsg, 'success');

    res.json({
      ok: true,
      messageId: message.id,
      message: 'Your application has been submitted successfully. You will be notified once it is reviewed.'
    });

  } catch (error) {
    const errorMsg = `Signup submission error: ${error.message}`;
    console.error('Signup submission error:', error);
    await logToControlBridge(errorMsg, 'error');
    res.status(500).json({ ok: false, error: 'signup_submission_failed' });
  }
});

// Example protected route (profile)
app.get('/profile.html', async (req, res, next) => {
  await requireAuth(req, res, next);
}, async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// Serve Socket.IO client
app.get('/socket.io/socket.io.js', (req, res) => {
  try {
    const clientPath = path.join(__dirname, 'node_modules', 'socket.io-client', 'dist', 'socket.io.js');
    res.sendFile(clientPath);
  } catch (error) {
    console.error('Failed to serve Socket.IO client:', error);
    res.status(500).send('Socket.IO client not available');
  }
});

// Dashboard route (protected)
app.get('/dashboard', async (req, res, next) => {
  await requireAuth(req, res, next);
}, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Upload -> Discord RESOURCES channel (direct upload)
app.post('/api/resources/upload', async (req, res, next) => {
  await requireAuthJson(req, res, next);
}, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'no_file' });
    if (!client) return res.status(503).json({ ok: false, error: 'bot_not_available' });

    const ch = client.channels.cache.get(RESOURCES_CHANNEL_ID);
    if (!ch) return res.status(500).json({ ok: false, error: 'channel_missing' });

    // If fits under 8MB, send directly. If larger, chunking.
    const MAX = 7.8 * 1024 * 1024;
    let buf;
    try {
      buf = req.file.buffer || fs.readFileSync(req.file.path);
    } catch (error) {
      console.error('Failed to read file:', error);
      return res.status(500).json({ ok: false, error: 'file_read_error' });
    }

    if (buf.length <= MAX) {
      try {
        const msg = await ch.send({ files: [{ attachment: buf, name: req.file.originalname }] });
        fs.unlinkSync(req.file.path);
        return res.json({ ok: true, messageId: msg.id, name: req.file.originalname, size: buf.length });
      } catch (error) {
        console.error('Failed to upload file:', error);
        return res.status(500).json({ ok: false, error: 'upload_failed' });
      }
    }

    // Quick chunk (simple series; can optimize later)
    const chunks = [];
    for (let i = 0; i < buf.length; i += MAX) chunks.push(buf.slice(i, i + MAX));
    const ids = [];
    for (let i = 0; i < chunks.length; i++) {
      const partName = `${req.file.originalname}.part${String(i + 1).padStart(3, '0')}`;
      try {
        const msg = await ch.send({ files: [{ attachment: chunks[i], name: partName }] });
        ids.push(msg.id);
      } catch (error) {
        console.error('Failed to upload chunk:', error);
        return res.status(500).json({ ok: false, error: 'chunk_upload_failed' });
      }
    }
    fs.unlinkSync(req.file.path);
    return res.json({ ok: true, chunked: true, parts: ids, total: chunks.length, name: req.file.originalname });
  } catch (err) {
    console.error('upload failed', err);
    res.status(500).json({ ok: false, error: 'upload_failed' });
  }
});

// Profile API - Get current user's profile
app.get('/api/profile', async (req, res, next) => {
  await requireAuthJson(req, res, next);
}, async (req, res) => {
  try {
    const user = req.user || req.session.user;
    if (!user) return res.status(401).json({ error: 'not-authenticated' });

    const { GUILD_ID } = process.env;
    let roles = [];

    try {
      if (GUILD_ID && client?.guilds?.cache) {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(user.id).catch(() => null);
        roles = member ? member.roles.cache.map(r => ({ id: r.id, name: r.name })) : [];
      }
    } catch (error) {
      console.error('Error fetching guild roles:', error);
    }

    res.json({
      ok: true,
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      roles
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'server' });
  }
});

// Badges registry
app.get('/api/badges', async (req, res, next) => {
  await requireAuthJson(req, res, next);
}, async (req, res) => {
  try {
    const { BADGES_CHANNEL_ID } = process.env;
    if (!BADGES_CHANNEL_ID) return res.status(500).json({ ok: false, error: 'BADGES_CHANNEL_ID not configured' });

    const mf = await fetchAttachmentJsonByPrefix(BADGES_CHANNEL_ID, 'badges');
    res.json({ ok: true, badges: mf?.badges || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Resources gallery
app.get('/api/resources', async (req, res, next) => {
  await requireAuthJson(req, res, next);
}, async (req, res) => {
  try {
    const chanId = RESOURCES_CHANNEL_ID;
    if (!chanId) return res.status(500).json({ error: 'missing RESOURCES_CHANNEL_ID' });

    if (!client) return res.status(503).json({ error: 'bot not available' });

    const chan = await client.channels.fetch(chanId);
    if (!chan || !chan.isTextBased()) return res.status(500).json({ error: 'bad-channel' });

    const msgs = await chan.messages.fetch({ limit: 100 });
    const items = [...msgs.values()].flatMap(m =>
      m.attachments.size ? [...m.attachments.values()] : []
    ).map(a => ({
      id: a.id,
      url: a.url,
      name: a.name,
      size: a.size
    }));

    res.json({ items });
  } catch (e) {
    console.error('Resources error', e);
    res.status(500).json({ error: 'server' });
  }
});

// Resources list route
app.get('/api/resources/list', async (req, res, next) => {
  await requireAuthJson(req, res, next);
}, async (req, res) => {
  try {
    const ch = client.channels.cache.get(RESOURCES_CHANNEL_ID);
    if (!ch) return res.status(500).json({ ok: false, error: 'no_channel' });

    const limit = Math.min(Number(req.query.limit) || 40, 80);
    const msgs = await ch.messages.fetch({ limit });
    const items = [...msgs.values()]
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map(m => ({
        id: m.id,
        ts: m.createdTimestamp,
        author: m.author?.username,
        text: m.content,
        attachments: m.attachments ? [...m.attachments.values()].map(mapAttachment) : []
      }));
    res.json({ ok: true, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'list_fail' });
  }
});

// Tasks add route
app.post('/api/tasks/add', async (req, res, next) => {
  await requireAuthJson(req, res, next);
}, async (req, res) => {
  try {
    const ch = client.channels.cache.get(TASKS_CHANNEL_ID);
    if (!ch) return res.status(500).json({ ok: false, error: 'no_channel' });

    const { title, due, note } = req.body;
    if (!title) return res.status(400).json({ ok: false, error: 'missing_title' });

    const author = req.session.user;
    const embed = {
      title: `🗒️ ${title}`,
      description: note ? String(note).slice(0, 1900) : undefined,
      color: 0x8b5cf6,
      fields: [
        { name: 'By', value: author.username, inline: true },
        ...(due ? [{ name: 'Due', value: new Date(due).toLocaleString(), inline: true }] : [])
      ],
      timestamp: new Date()
    };

    const msg = await ch.send({ embeds: [embed] });
    res.json({ ok: true, id: msg.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'task_fail' });
  }
});

// Helper function for Discord channel operations
async function fetchAttachmentJsonByPrefix(channelId, filenameStartsWith) {
  if (!client) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    let before;
    for (let i = 0; i < 10; i++) { // scan up to ~1000 messages
      const msgs = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!msgs?.size) break;
      for (const m of msgs.values()) {
        const att = [...m.attachments.values()].find(a => a.name?.startsWith(filenameStartsWith));
        if (att) {
          const r = await fetch(att.url);
          return await r.json();
        }
      }
      before = msgs.last().id;
    }
  } catch (error) {
    console.error('Error fetching attachment:', error);
  }
  return null;
}

// Helper for detecting file types
function detectKind(name, contentType){
  const n = (name||'').toLowerCase();
  if ((contentType||'').startsWith('image/')) return 'image';
  if ((contentType||'').startsWith('video/')) return 'video';
  if ((contentType||'').startsWith('audio/')) return 'audio';
  if (n.endsWith('.pdf')) return 'pdf';
  return 'file';
}

// Helper for mapping Discord attachments
function mapAttachment(a){
  return {
    url: a.url,
    proxyUrl: a.proxyURL ?? a.proxyUrl,
    name: a.name,
    size: a.size,
    contentType: a.contentType,
    kind: detectKind(a.name, a.contentType)
  };
}

// Chunked upload: receive chunks from site, send to Discord channel
app.post('/api/upload/chunk', upload.single('chunk'), async (req, res) => {
  try {
    const { filename, index, total } = req.body;
    const filePath = req.file.path;
    const channelId = process.env.STORAGE_CHANNEL_ID;
    if (!channelId) throw new Error('Missing STORAGE_CHANNEL_ID');

    if (!client) return res.status(503).json({ ok: false, error: 'bot not available' });

    try {
      const chan = await client.channels.fetch(channelId);
      const file = new AttachmentBuilder(filePath, { name: `${filename}.part${index}` });
      const msg = await chan.send({ content: `Chunk ${index}/${total} for ${filename}`, files: [file] });

      fs.unlinkSync(filePath);
      return res.json({ ok: true, url: msg.attachments.first()?.url || null });
    } catch (error) {
      console.error('Failed to upload chunk:', error);
      return res.status(500).json({ ok: false, error: 'chunk_upload_failed' });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
// Manifest save (site tells bot which chunk URLs form a file)
app.post('/api/upload/manifest', async (req, res) => {
  try {
    const { filename, parts } = req.body; // parts: [{url, index}]
    const channelId = process.env.STORAGE_CHANNEL_ID;
    if (!channelId) throw new Error('Missing STORAGE_CHANNEL_ID');

    if (!client) return res.status(503).json({ ok: false, error: 'bot not available' });

    try {
      const chan = await client.channels.fetch(channelId);
      const json = JSON.stringify({ type: 'manifest', filename, parts, ts: Date.now() }, null, 2);

      // Ensure uploads directory exists
      fs.mkdirSync('uploads', { recursive: true });
      const tmp = path.join('uploads', `manifest-${Date.now()}.json`);
      fs.writeFileSync(tmp, json);

      const msg = await chan.send({ content: `Manifest for ${filename}`, files: [tmp] });
      fs.unlinkSync(tmp);

      res.json({ ok: true, manifestMessageId: msg.id });
    } catch (error) {
      console.error('Failed to create manifest:', error);
      res.status(500).json({ ok: false, error: 'manifest_creation_failed' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Media proxy (for avatar/badges)
app.get('/api/media/:messageId', async (req, res, next) => {
  await requireAuthJson(req, res, next);
}, async (req, res) => {
  try {
    const { RESOURCES_CHANNEL_ID } = process.env;
    if (!RESOURCES_CHANNEL_ID) return res.status(500).json({ ok: false, error: 'RESOURCES_CHANNEL_ID not configured' });

    if (!client) return res.status(503).json({ ok: false, error: 'bot not available' });

    const ch = await client.channels.fetch(RESOURCES_CHANNEL_ID);
    const msg = await ch.messages.fetch(req.params.messageId).catch(() => null);
    const att = msg?.attachments?.first();
    if (!att) return res.status(404).end();

    const r = await fetch(att.url);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    r.body.pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Helper function for Discord channel operations
async function fetchAttachmentJsonByPrefix(channelId, filenameStartsWith) {
  if (!client) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    let before;
    for (let i = 0; i < 10; i++) { // scan up to ~1000 messages
      const msgs = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!msgs?.size) break;
      for (const m of msgs.values()) {
        const att = [...m.attachments.values()].find(a => a.name?.startsWith(filenameStartsWith));
        if (att) {
          const r = await fetch(att.url);
          return await r.json();
        }
      }
      before = msgs.last().id;
    }
  } catch (error) {
    console.error('Error fetching attachment:', error);
  }
  return null;
}

// Helper for detecting file types
function detectKind(name, contentType){
  const n = (name||'').toLowerCase();
  if ((contentType||'').startsWith('image/')) return 'image';
  if ((contentType||'').startsWith('video/')) return 'video';
  if ((contentType||'').startsWith('audio/')) return 'audio';
  if (n.endsWith('.pdf')) return 'pdf';
  return 'file';
}

// Helper for mapping Discord attachments
function mapAttachment(a){
  return {
    url: a.url,
    proxyUrl: a.proxyURL ?? a.proxyUrl,
    name: a.name,
    size: a.size,
    contentType: a.contentType,
    kind: detectKind(a.name, a.contentType)
  };
}

// Disk upload temp (site-side uploads -> bot forwards to Discord storage channel)
const upload = multer({ dest: 'uploads/' });

console.log('🛠 initializing routes & middleware…');

// Add logging to signup API
try {
  const stack = app?._router?.stack || [];
  const signupLayer = stack.find(layer => layer?.route?.path === '/api/signup');
  const originalSignupHandler = signupLayer?.route?.stack?.[0]?.handle;
  if (originalSignupHandler) {
    app.post('/api/signup', async (req, res) => {
      try {
        await logToControlBridge(`Signup request from ${req.body?.discordId} (${req.body?.email})`, 'info');
      } catch (e) { console.warn('logToControlBridge failed (non-fatal):', e?.message || e); }
      return originalSignupHandler(req, res);
    });
  } else {
    console.warn('Signup route not found yet; skipping debug wrapper.');
  }
} catch (e) {
  console.warn('Signup wrapper init skipped (non-fatal):', e?.message || e);
}

server.listen(PORT, '0.0.0.0', () => {
  try {
    console.log(`🌐 Web server listening on :${PORT}`);
  } catch {}
  console.log(`🔧 ControlBridge monitoring: Active (checking every 10s)`);
  coreStatus = '🟢 Server running';

    // Start ControlBridge server in background
  try {
    await import('./doomzy-controlbridge/index.js');
    console.log(`🌉 ControlBridge started on port ${process.env.CONTROLBRIDGE_PORT || 3001}`);
  } catch (e) {
    console.error('ControlBridge failed to start (non-fatal):', e?.stack || e);
  }

  // Start Task Executor in background
  import('./task-executor.js').then((module) => {
    module.startTaskMonitoring();
    console.log(`📋 Task Executor started`);
  }).catch(err => {
    console.warn('⚠️ Task Executor failed to start:', err.message);
  });
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM. Shutting down gracefully...');
  try {
    debugServer.close();
    server.close();
    process.exit(0);
  } catch (e) {
    console.error('Error during shutdown:', e);
    process.exit(1);
  }
});
