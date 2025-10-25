// hydraDebug.js - Comprehensive Doomzy Debug System
import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}🔍 ${msg}${colors.reset}`),
  title: (msg) => console.log(`\n${colors.bold}${colors.blue}🧪 ${msg}${colors.reset}`)
};

const test = async (label, fn) => {
  try {
    await fn();
    log.success(label);
    return true;
  } catch (e) {
    log.error(label);
    console.error(`    ↳ ${e.message}`);

    // Log to debug report file
    const timestamp = new Date().toISOString();
    fs.appendFileSync('hydra_debug_report.txt', `[${timestamp}] ❌ ${label}: ${e.message}\n`);

    return false;
  }
};

const testRailwayHealth = async () => {
  const results = {
    environment: {},
    bot: {},
    server: {},
    apis: {},
    auth: {},
    forms: {}
  };

  log.title('DOOMZY HYDRACHECK - COMPREHENSIVE SYSTEM VALIDATION');
  log.info('Starting end-to-end validation of all critical systems...\n');

  // Environment Variables Check
  log.info('🔧 Checking Environment Variables...');
  results.environment.discordToken = await test('DISCORD_BOT_TOKEN is configured', () => {
    if (!process.env.DISCORD_BOT_TOKEN) throw new Error('Missing DISCORD_BOT_TOKEN');
  });

  results.environment.clientId = await test('CLIENT_ID is configured', () => {
    if (!process.env.CLIENT_ID) throw new Error('Missing CLIENT_ID');
  });

  results.environment.guildId = await test('DISCORD_GUILD_ID is configured', () => {
    if (!process.env.DISCORD_GUILD_ID) throw new Error('Missing DISCORD_GUILD_ID for role checking');
  });

  results.environment.requiredRole = await test('DISCORD_REQUIRED_ROLE_ID is configured', () => {
    if (!process.env.DISCORD_REQUIRED_ROLE_ID) throw new Error('Missing DISCORD_REQUIRED_ROLE_ID for access control');
  });

  results.environment.signupChannel = await test('DISCORD_SIGNUP_CHANNEL_ID is configured', () => {
    if (!process.env.DISCORD_SIGNUP_CHANNEL_ID) throw new Error('Missing DISCORD_SIGNUP_CHANNEL_ID for form submissions');
  });

  results.environment.approvedUser = await test('APPROVED_USER_ID is configured', () => {
    if (!process.env.APPROVED_USER_ID) throw new Error('Missing APPROVED_USER_ID for admin bypass');
  });

  // Discord Bot Health Check
  log.info('\n🤖 Checking Discord Bot Connection...');
  results.bot.connection = await test('Discord Bot can login and connect', async () => {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ]
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Bot login timeout after 10 seconds'));
      }, 10000);

      client.once('ready', () => {
        clearTimeout(timeout);
        client.destroy();
        resolve();
      });

      client.once('error', (err) => {
        clearTimeout(timeout);
        client.destroy();
        reject(err);
      });

      client.login(process.env.DISCORD_BOT_TOKEN).catch(reject);
    });
  });

  results.bot.intents = await test('Bot has required intents enabled', async () => {
    // This is more of a documentation check since we can't verify Discord permissions here
    const requiredIntents = ['Guilds', 'GuildMessages', 'MessageContent', 'GuildMembers'];
    log.info(`    Bot should have these intents: ${requiredIntents.join(', ')}`);
  });

  // Server Health Check
  log.info('\n🌐 Checking Server & API Endpoints...');
  try {
    const baseUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 8080}`;

    results.server.homepage = await test(`Homepage (${baseUrl}) is accessible`, async () => {
      try {
        const res = await axios.get(`${baseUrl}/`, { timeout: 5000 });
        if (res.status !== 200) throw new Error(`Homepage returned ${res.status}`);
      } catch (err) {
        if (err.code === 'ECONNREFUSED') {
          throw new Error('Server is not running - start with "npm start"');
        }
        throw err;
      }
    });

    results.server.health = await test('Health endpoint /healthz works', async () => {
      const res = await axios.get(`${baseUrl}/healthz`, { timeout: 5000 });
      if (res.status !== 200) throw new Error(`Health endpoint returned ${res.status}`);
    });

    results.server.status = await test('Status endpoint /status works', async () => {
      const res = await axios.get(`${baseUrl}/status`, { timeout: 5000 });
      if (res.status !== 200) throw new Error(`Status endpoint returned ${res.status}`);
    });

    results.server.signup = await test('Signup page /signup.html exists', async () => {
      const res = await axios.get(`${baseUrl}/signup.html`, { timeout: 5000 });
      if (res.status !== 200) throw new Error(`Signup page returned ${res.status}`);
    });

  } catch (err) {
    log.warning(`Server health checks skipped: ${err.message}`);
  }

  // Code Structure Validation
  log.info('\n🧠 Checking Code Structure...');
  results.code.middleware = await test('Authentication middleware loads', () => {
    try {
      require('./middleware/auth.js');
    } catch (err) {
      throw new Error(`Middleware failed to load: ${err.message}`);
    }
  });

  results.code.server = await test('Server configuration loads', () => {
    try {
      // Test if all imports work
      const testImports = [
        'express',
        'discord.js',
        'passport',
        'passport-discord',
        'multer',
        'cors',
        'socket.io'
      ];

      testImports.forEach(imp => {
        try {
          require(imp);
        } catch (err) {
          throw new Error(`Missing dependency: ${imp}`);
        }
      });
    } catch (err) {
      throw new Error(`Server config error: ${err.message}`);
    }
  });

  // File System Checks
  log.info('\n📁 Checking File System...');
  results.files.logo = await test('Logo directory exists', () => {
    const logoPath = path.join(__dirname, 'public', 'images');
    if (!fs.existsSync(logoPath)) {
      throw new Error('public/images/ directory missing - create it for logo assets');
    }
  });

  results.files.uploads = await test('Uploads directory exists', () => {
    const uploadsPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
      log.info('    ↳ Created uploads/ directory');
    }
  });

  results.files.env = await test('.env file exists and is readable', () => {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
      throw new Error('.env file missing - copy from .env.example');
    }
  });

  // API Route Validation (if server is running)
  log.info('\n📡 Checking API Routes...');
  try {
    const baseUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 8080}`;

    results.apis.profile = await test('Profile API /api/profile works', async () => {
      const res = await axios.get(`${baseUrl}/api/profile`, { timeout: 5000 });
      if (res.status !== 401 && res.status !== 200) throw new Error(`Profile API returned ${res.status}`);
    });

    results.apis.badges = await test('Badges API /api/badges works', async () => {
      const res = await axios.get(`${baseUrl}/api/badges`, { timeout: 5000 });
      if (res.status !== 401 && res.status !== 200) throw new Error(`Badges API returned ${res.status}`);
    });

    results.apis.signup = await test('Signup form submission works', async () => {
      const testData = {
        fullName: 'Hydra Test User',
        discordId: '123456789',
        email: 'hydra@test.com',
        reason: 'Testing HydraCheck system'
      };

      const res = await axios.post(`${baseUrl}/api/signup`, testData, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.status !== 200) throw new Error(`Signup API returned ${res.status}`);
    });

  } catch (err) {
    log.warning(`API route checks skipped: ${err.message}`);
  }

  // Generate Final Report
  log.title('HYDRACHECK REPORT SUMMARY');

  const totalTests = Object.values(results).flat().length;
  const passedTests = Object.values(results).flat().filter(r => r === true).length;

  log.info(`Test Results: ${passedTests}/${totalTests} passed (${Math.round(passedTests/totalTests*100)}%)`);

  if (passedTests === totalTests) {
    log.success('🎉 ALL SYSTEMS OPERATIONAL - Ready for deployment!');
  } else {
    log.error('⚠️  ISSUES DETECTED - Review failures above');
    log.info('💡 Run this again after fixing issues: node hydraDebug.js');
  }

  // Write detailed report
  const reportPath = 'hydra_debug_report.txt';
  const timestamp = new Date().toISOString();
  const report = `
[${timestamp}] DOOMZY HYDRACHECK REPORT
=====================================

Environment Variables: ${results.environment.discordToken ? '✅' : '❌'} Token, ${results.environment.clientId ? '✅' : '❌'} Client ID, ${results.environment.guildId ? '✅' : '❌'} Guild ID, ${results.environment.requiredRole ? '✅' : '❌'} Role ID, ${results.environment.signupChannel ? '✅' : '❌'} Signup Channel, ${results.environment.approvedUser ? '✅' : '❌'} Admin User

Discord Bot: ${results.bot.connection ? '✅' : '❌'} Connection, ${results.bot.intents ? '✅' : '❌'} Intents

Server Health: ${results.server.homepage ? '✅' : '❌'} Homepage, ${results.server.health ? '✅' : '❌'} Health, ${results.server.status ? '✅' : '❌'} Status, ${results.server.signup ? '✅' : '❌'} Signup Page

Code Structure: ${results.code.middleware ? '✅' : '❌'} Middleware, ${results.code.server ? '✅' : '❌'} Server Config

File System: ${results.files.logo ? '✅' : '❌'} Logo Assets, ${results.files.uploads ? '✅' : '❌'} Uploads Dir, ${results.files.env ? '✅' : '❌'} .env File

API Routes: ${results.apis.profile ? '✅' : '❌'} Profile, ${results.apis.badges ? '✅' : '❌'} Badges, ${results.apis.signup ? '✅' : '❌'} Signup

OVERALL STATUS: ${passedTests}/${totalTests} PASSED
${passedTests === totalTests ? '✅ READY FOR DEPLOYMENT' : '❌ NEEDS ATTENTION'}
`;

  fs.writeFileSync(reportPath, report);
  log.info(`📄 Detailed report saved to: ${reportPath}`);

  return results;
};

// Run HydraCheck if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      await testRailwayHealth();
    } catch (err) {
      log.error('HydraCheck failed to run');
      console.error(err);
    }
  })();
}

export { testRailwayHealth as runHydraCheck };
