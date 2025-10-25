
// doomzy-controlbridge/index.js - ES Module version
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.CONTROLBRIDGE_PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS for external requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

console.log('🚀 DOOMZY CONTROLBRIDGE STARTING...');
console.log(`📡 Listening on port ${PORT}`);
console.log('📝 Available endpoints:');
console.log('   POST /log - Receive logs from Discord bot');
console.log('   POST /windsurf-task - Receive tasks for Windsurf');
console.log('   GET /status - Bridge health check');
console.log('   GET /logs - View recent logs');
console.log('   GET /task - View current Windsurf task\n');

// Log endpoint - receives logs from Discord bot
app.post('/log', (req, res) => {
  try {
    const log = req.body.log || 'No log content provided.';
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${log}\n`;

    // Append to logs.txt
    fs.appendFileSync('./doomzy-controlbridge/logs.txt', logEntry);

    console.log('📨 Log received:', log);

    // Echo back for confirmation
    res.json({
      ok: true,
      timestamp,
      message: 'Log received and stored',
      logLength: logEntry.length
    });

  } catch (error) {
    console.error('❌ Error processing log:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Windsurf task endpoint - receives tasks for Windsurf to execute
app.post('/windsurf-task', (req, res) => {
  try {
    const task = req.body.task || 'No task provided';
    const timestamp = new Date().toISOString();

    // Write task to windsurf-patch.md
    const taskContent = `# DOOMZY CONTROLBRIDGE: WINDSURF INSTRUCTIONS

## DO NOT DEVIATE FROM THESE TASKS

Windsurf is to read each section and execute ONLY the described actions. Do not invent features. Do not reorder.

---

## 📥 TASK RECEIVED: ${timestamp}

${task}

---

## ✅ EXECUTION STATUS
- [ ] Task received and queued for execution
- [ ] Execute script updates from /windsurf-task
- [ ] Never overwrite files unless explicitly told
- [ ] Always provide terminal/console output

---

## 🤖 BOT INTEGRATION
This system assumes the Discord bot will funnel errors and prompts to the controlbridge.

Current task requires Windsurf attention. Monitor logs for execution status.
`;

    fs.writeFileSync('./doomzy-controlbridge/windsurf-patch.md', taskContent);

    console.log('📋 Windsurf task written to patch.md');
    console.log('📝 Task preview:', task.substring(0, 100) + '...');

    // Log the task reception
    const logEntry = `[${timestamp}] 📋 WINDSURF TASK RECEIVED: ${task.substring(0, 50)}...\n`;
    fs.appendFileSync('./doomzy-controlbridge/logs.txt', logEntry);

    res.json({
      ok: true,
      timestamp,
      message: 'Task forwarded to Windsurf',
      taskLength: task.length,
      status: 'queued'
    });

  } catch (error) {
    console.error('❌ Error processing Windsurf task:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Health check endpoint
app.get('/status', (req, res) => {
  const stats = {
    ok: true,
    uptime: process.uptime(),
    port: PORT,
    logsFileSize: fs.existsSync('./doomzy-controlbridge/logs.txt')
      ? fs.statSync('./doomzy-controlbridge/logs.txt').size
      : 0,
    taskFileExists: fs.existsSync('./doomzy-controlbridge/windsurf-patch.md')
  };

  res.json(stats);
});

// View recent logs endpoint
app.get('/logs', (req, res) => {
  try {
    if (fs.existsSync('./doomzy-controlbridge/logs.txt')) {
      const logs = fs.readFileSync('./doomzy-controlbridge/logs.txt', 'utf8');
      const lines = logs.split('\n').filter(line => line.trim()).slice(-50); // Last 50 lines
      res.json({ ok: true, logs: lines, totalLines: lines.length });
    } else {
      res.json({ ok: true, logs: [], totalLines: 0, message: 'No logs yet' });
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// View current task endpoint
app.get('/task', (req, res) => {
  try {
    if (fs.existsSync('./doomzy-controlbridge/windsurf-patch.md')) {
      const task = fs.readFileSync('./doomzy-controlbridge/windsurf-patch.md', 'utf8');
      res.json({ ok: true, task, exists: true });
    } else {
      res.json({ ok: true, task: '', exists: false, message: 'No active task' });
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Clear logs endpoint (admin only - basic protection)
app.delete('/logs', (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (adminToken !== process.env.CONTROLBRIDGE_ADMIN_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Unauthorized' });
    }

    fs.writeFileSync('./doomzy-controlbridge/logs.txt', '# Logs will be appended here.\n');
    console.log('🗑️ Logs cleared by admin');
    res.json({ ok: true, message: 'Logs cleared' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('ControlBridge error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`\n🌉 DOOMZY CONTROLBRIDGE ONLINE`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📝 Logs: POST /log`);
  console.log(`📋 Tasks: POST /windsurf-task`);
  console.log(`🔍 Health: GET /status`);
  console.log(`📄 View Logs: GET /logs`);
  console.log(`📄 View Task: GET /task\n`);

  // Initial status check
  console.log('📊 INITIAL STATUS:');
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   ControlBridge Port: ${PORT}`);
  console.log(`   Admin Token: ${process.env.CONTROLBRIDGE_ADMIN_TOKEN ? 'SET' : 'NOT SET'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 ControlBridge shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 ControlBridge shutting down...');
  process.exit(0);
});

export default app;
