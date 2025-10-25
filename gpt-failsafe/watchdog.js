// gpt-failsafe/watchdog.js - ES Module version
import 'dotenv/config';
import fs from 'fs';
import fetch from 'node-fetch';

const MAIN_SERVER_URL = `http://localhost:${process.env.PORT || 8080}`;
const CONTROLBRIDGE_URL = `http://localhost:${process.env.CONTROLBRIDGE_PORT || 3001}`;
const TASK_QUEUE = './gpt-failsafe/pending-tasks.json';

// GPT-like command endpoint - using ControlBridge /windsurf-task as fallback
const GPT_COMMAND_URL = `${CONTROLBRIDGE_URL}/windsurf-task`;
const LOGS_URL = `${CONTROLBRIDGE_URL}/logs`;
const STATUS_URL = `${MAIN_SERVER_URL}/health`;

// Health check endpoints for different services
const SERVICES = {
  mainServer: `${MAIN_SERVER_URL}/health`,
  controlBridge: `${CONTROLBRIDGE_URL}/status`,
  discordBot: `${MAIN_SERVER_URL}/api/status`
};

async function runCheck() {
  try {
    console.log('🔍 GPT Failsafe: Running system health check...');

    // Check all services
    const serviceChecks = await Promise.all(
      Object.entries(SERVICES).map(async ([service, url]) => {
        try {
          const response = await fetch(url);
          const isOnline = response.ok;
          return { service, online: isOnline };
        } catch (error) {
          return { service, online: false };
        }
      })
    );

    const downServices = serviceChecks
      .filter(({ online }) => !online)
      .map(({ service }) => service);

    // Check recent logs for errors
    let hasErrors = false;
    try {
      const logsResponse = await fetch(LOGS_URL);
      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        const recentLogs = logsData.logs || [];
        hasErrors = recentLogs.some(log =>
          log.toLowerCase().includes('error') ||
          log.toLowerCase().includes('failed') ||
          log.toLowerCase().includes('critical')
        );
      }
    } catch (error) {
      console.warn('Could not check logs:', error.message);
    }

    // If issues detected, send to GPT/ControlBridge
    if (downServices.length > 0 || hasErrors) {
      const input = `🚨 SYSTEM ALERT: ${downServices.join(', ')} services offline. Logs: ${hasErrors ? 'Errors detected' : 'No errors'}. Please investigate and fix.`;

      console.log('📋 Issues detected, sending to GPT/ControlBridge:', input);
      await sendToGPT(input);
    } else {
      console.log('✅ All systems operational');
    }

  } catch (error) {
    const errorMsg = `GPT Failsafe error: ${error.message}`;
    console.error('❌ Failsafe error:', error);
    await queueTask({ input: errorMsg });
  }
}

async function sendToGPT(input) {
  try {
    // First try ControlBridge /windsurf-task endpoint
    const response = await fetch(GPT_COMMAND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: `# GPT Failsafe Alert\n\n${input}\n\nPlease analyze this system alert and provide resolution steps.`
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Alert sent to Windsurf via ControlBridge:', data.message);

      // Also log to ControlBridge logs
      await fetch(`${CONTROLBRIDGE_URL}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log: `GPT Failsafe: Alert sent to Windsurf - ${input}`
        })
      });

    } else {
      throw new Error(`ControlBridge returned ${response.status}`);
    }

  } catch (error) {
    const errorMsg = `GPT/ControlBridge not reachable: ${error.message}`;
    console.error('❌ GPT not reachable. Queuing task.');
    await queueTask({ input: `URGENT: ${input}` });
  }
}

async function queueTask(task) {
  try {
    let queue = [];
    if (fs.existsSync(TASK_QUEUE)) {
      const queueData = fs.readFileSync(TASK_QUEUE, 'utf8');
      queue = JSON.parse(queueData);
    }

    const taskWithMetadata = {
      ...task,
      timestamp: new Date().toISOString(),
      source: 'gpt-failsafe-watchdog',
      queued: true
    };

    queue.push(taskWithMetadata);
    fs.writeFileSync(TASK_QUEUE, JSON.stringify(queue, null, 2));

    console.log('📝 Task queued for later:', task.input);

    // Also log to ControlBridge
    await fetch(`${CONTROLBRIDGE_URL}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        log: `GPT Failsafe: Task queued - ${task.input}`
      })
    }).catch(() => {
      // Silently fail if ControlBridge not available
    });

  } catch (error) {
    console.error('❌ Failed to queue task:', error);
  }
}

async function startWatchdog() {
  console.log('🚀 GPT Failsafe Watchdog starting...');
  console.log('📊 Monitoring services:');
  Object.entries(SERVICES).forEach(([name, url]) => {
    console.log(`   ${name}: ${url}`);
  });
  console.log('⏰ Running checks every 60 seconds...\n');

  // Run initial check
  await runCheck();

  // Schedule checks every 60 seconds
  setInterval(runCheck, 60000);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('\n🛑 GPT Failsafe Watchdog shutting down...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('\n🛑 GPT Failsafe Watchdog shutting down...');
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWatchdog();
}

export { runCheck, sendToGPT, queueTask, startWatchdog };
