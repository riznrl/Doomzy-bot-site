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

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.user) {
    return next();
  }
  res.redirect('/?login=required');
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

// Tasks create (site -> bot tasks channel)
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, due, priority, id } = req.body;
    const channelId = process.env.TASKS_CHANNEL_ID;
    const chan = await client.channels.fetch(channelId);
    const msg = await chan.send(`📝 **${title}**\nDue: ${due}\nPriority: ${priority}\nID: ${id}`);
    res.json({ ok: true, id: msg.id });
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
