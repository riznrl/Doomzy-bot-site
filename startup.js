// startup.js - Safe startup with HydraCheck validation
import 'dotenv/config';
import { runHydraCheck } from './hydraDebug.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
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

// --- Minimal crash guard so Railway doesn't 502 ---
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

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
      console.warn('No DISCORD_BOT_TOKEN provided, skipping bot initialization.');
      return null;
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

    client.on('ready', () => {
      console.log(`🤖 Logged in as ${client.user.tag}`);
    });

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'ping') {
        await interaction.reply('Pong from DoomzyInkBot!');
      }

      if (interaction.commandName === 'approve') {
        const messageId = interaction.options.getString('message_id');
        if (!messageId) {
          return await interaction.reply({ content: '❌ Please provide a message ID to approve.', ephemeral: true });
        }

        try {
          const channel = await interaction.guild.channels.fetch(process.env.DISCORD_SIGNUP_CHANNEL_ID);
          const message = await channel.messages.fetch(messageId);

          const embed = message.embeds[0];
          if (embed) {
            embed.fields.find(f => f.name === 'Status').value = '✅ **Approved**';
            embed.color = 0x10b981;
            await message.edit({ embeds: [embed] });
          }

          await interaction.reply({ content: `✅ Signup request ${messageId} has been approved!`, ephemeral: true });
          console.log(`✅ Admin ${interaction.user.tag} approved signup request ${messageId}`);
        } catch (error) {
          console.error('Error approving signup:', error);
          await interaction.reply({ content: '❌ Failed to approve signup request. Check if the message ID is valid.', ephemeral: true });
        }
      }

      if (interaction.commandName === 'reject') {
        const messageId = interaction.options.getString('message_id');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!messageId) {
          return await interaction.reply({ content: '❌ Please provide a message ID to reject.', ephemeral: true });
        }

        try {
          const channel = await interaction.guild.channels.fetch(process.env.DISCORD_SIGNUP_CHANNEL_ID);
          const message = await channel.messages.fetch(messageId);

          const embed = message.embeds[0];
          if (embed) {
            embed.fields.find(f => f.name === 'Status').value = '❌ **Rejected**';
            embed.fields.push({ name: 'Rejection Reason', value: reason, inline: false });
            embed.color = 0xef4444;
            await message.edit({ embeds: [embed] });
          }

          await interaction.reply({ content: `❌ Signup request ${messageId} has been rejected.`, ephemeral: true });
          console.log(`❌ Admin ${interaction.user.tag} rejected signup request ${messageId}: ${reason}`);
        } catch (error) {
          console.error('Error rejecting signup:', error);
          await interaction.reply({ content: '❌ Failed to reject signup request. Check if the message ID is valid.', ephemeral: true });
        }
      }
    });

    await client.login(token);
    await registerCommands();
    setDiscordClient(client);
    return client;
  } catch (error) {
    console.error('Failed to initialize bot (non-fatal):', error.message);
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
      console.warn('No DISCORD_BOT_TOKEN provided, skipping bot login.');
      return;
    }
    const bot = await initBot();
    if (bot) {
      console.log(`🤖 Bot ready as ${bot?.user?.tag ?? 'unknown'}`);
      setupDiscordListeners(bot);
    }
  } catch (err) {
    console.error('Failed to login bot (non-fatal):', err?.message || err);
  }
})();

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server listening on :${PORT}`);
});
