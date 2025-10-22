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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ extended: true }));

// Sessions for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || 'doomzyink-secret',
  resave: false,
  saveUninitialized: false
}));

// ---- Discord OAuth2 (login) ----
if (process.env.CLIENT_ID && process.env.REDIRECT_URI) {
  passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET || 'unused-when-using-bot-only',
    callbackURL: process.env.REDIRECT_URI,
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
    // Store user in session as backup (Passport should already store in req.user)
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

// ---- Static site ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth gate middleware (add this near the top, after session setup) ----
const requireAuth = (req, res, next) => {
  // Accept either Passport user or your own session user
  const user = req.user || (req.session && req.session.user);

  // Not logged in → send to login
  if (!user) return res.redirect('/auth/login');

  // If you gate by allowed IDs, enforce it here
  const allow = (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (allow.length && !allow.includes(String(user.id))) {
    // You can render a nicer page here if you want
    return res.status(403).send('Access denied');
  }
  return next();
};

// Authentication middleware for JSON APIs
function requireAuthJson(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Authentication required' });
  next();
}

// Dashboard route (protected)
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Root route - always serve the landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Discord bot ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.on('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// Minimal health endpoint for diagnostics bar
app.get('/api/status', async (req, res) => {
  res.json({
    ok: true,
    bot: client.user ? client.user.tag : null,
    uptime: process.uptime(),
    guilds: client.guilds.cache.size
  });
});

// Disk upload temp (site-side uploads -> bot forwards to Discord storage channel)
const upload = multer({ dest: 'uploads/' });

// Chunked upload: receive chunks from site, send to Discord channel
app.post('/api/upload/chunk', upload.single('chunk'), async (req, res) => {
  try {
    const { filename, index, total } = req.body;
    const filePath = req.file.path;
    const channelId = process.env.STORAGE_CHANNEL_ID;
    if (!channelId) throw new Error('Missing STORAGE_CHANNEL_ID');

    const chan = await client.channels.fetch(channelId);
    const file = new AttachmentBuilder(filePath, { name: `${filename}.part${index}` });
    const msg = await chan.send({ content: `Chunk ${index}/${total} for ${filename}`, files: [file] });

    fs.unlinkSync(filePath);
    return res.json({ ok: true, url: msg.attachments.first()?.url || null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Manifest save (site tells bot which chunk URLs form a file)
app.post('/api/upload/manifest', async (req, res) => {
  try {
    const { filename, parts } = req.body; // parts: [{url, index}]
    const channelId = process.env.STORAGE_CHANNEL_ID;
    const chan = await client.channels.fetch(channelId);
    const json = JSON.stringify({ type: 'manifest', filename, parts, ts: Date.now() }, null, 2);
    fs.mkdirSync('uploads', { recursive: true });
    const tmp = path.join('uploads', `manifest-${Date.now()}.json`);
    fs.writeFileSync(tmp, json);
    const msg = await chan.send({ content: `Manifest for ${filename}`, files: [tmp] });
    fs.unlinkSync(tmp);
    res.json({ ok: true, manifestMessageId: msg.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Profile & Badges API (Discord as storage) ----

// Profile read
app.get('/api/profile/:userId', requireAuthJson, async (req, res) => {
  try {
    const { PROFILES_CHANNEL_ID } = process.env;
    if (!PROFILES_CHANNEL_ID) return res.status(500).json({ ok: false, error: 'PROFILES_CHANNEL_ID not configured' });

    const userId = req.params.userId;
    const found = await fetchAttachmentJsonByPrefix(PROFILES_CHANNEL_ID, `profile-${userId}.json`);
    res.json({
      ok: true,
      profile: found || {
        kind: 'doomzy/profile@1',
        userId,
        displayName: req.user?.global_name || req.user?.username || 'User',
        status: '',
        avatarMediaId: null,
        galleryMediaIds: [],
        badges: [],
        updatedAt: Date.now()
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Profile update
app.post('/api/profile', requireAuthJson, async (req, res) => {
  try {
    const { PROFILES_CHANNEL_ID } = process.env;
    if (!PROFILES_CHANNEL_ID) return res.status(500).json({ ok: false, error: 'PROFILES_CHANNEL_ID not configured' });

    const me = req.user;
    const data = {
      kind: 'doomzy/profile@1',
      userId: me.id,
      displayName: (req.body.displayName || '').slice(0, 64),
      status: (req.body.status || '').slice(0, 280),
      avatarMediaId: req.body.avatarMediaId || null,
      galleryMediaIds: Array.isArray(req.body.galleryMediaIds) ? req.body.galleryMediaIds.slice(0, 20) : [],
      badges: Array.isArray(req.body.badges) ? req.body.badges.slice(0, 12) : [],
      updatedAt: Date.now()
    };

    fs.mkdirSync('uploads', { recursive: true });
    const p = path.join('uploads', `profile-${me.id}.json`);
    fs.writeFileSync(p, JSON.stringify(data, null, 2));

    const ch = await client.channels.fetch(PROFILES_CHANNEL_ID);
    await ch.send({ files: [{ attachment: p, name: `profile-${me.id}.json` }] });
    fs.unlinkSync(p);

    res.json({ ok: true, profile: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Badges registry
app.get('/api/badges', requireAuthJson, async (req, res) => {
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

// Media proxy (for avatar/badges)
app.get('/api/media/:messageId', requireAuthJson, async (req, res) => {
  try {
    const { RESOURCES_CHANNEL_ID } = process.env;
    if (!RESOURCES_CHANNEL_ID) return res.status(500).json({ ok: false, error: 'RESOURCES_CHANNEL_ID not configured' });

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

// Resources gallery
app.get('/api/resources/latest', requireAuthJson, async (req, res) => {
  try {
    const { RESOURCES_CHANNEL_ID } = process.env;
    if (!RESOURCES_CHANNEL_ID) return res.status(500).json({ ok: false, error: 'RESOURCES_CHANNEL_ID not configured' });

    const ch = await client.channels.fetch(RESOURCES_CHANNEL_ID);
    const coll = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    if (!coll) return res.json({ ok: true, items: [] });

    const items = [];
    for (const m of coll.values()) {
      const att = m.attachments?.first();
      if (!att) continue;
      items.push({
        messageId: m.id,
        fileName: att.name,
        contentType: att.contentType || null,
        size: att.size || null
      });
    }
    res.json({ ok: true, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Register a few slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('update_page')
    .setDescription('Upload HTML/JS for a page')
    .addStringOption(opt => opt.setName('page').setDescription('page name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Health check')
];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || '');

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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong from DoomzyInkBot!');
  }
});

// Start server & bot
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🌐 Web server running on :${port}`);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Failed to login bot:', err.message);
});

registerCommands();
