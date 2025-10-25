# GPT Failsafe Watchdog

This module enables autonomous issue detection and resolution for your site (Windsurf). It performs:
- Regular system status checks (GPT, Discord Bot, Railway, Windsurf backend)
- Log scanning for errors or warnings
- Automatic task queuing and GPT command submission
- Backup task queue if GPT is temporarily down
- `flush-pending.js` can replay queued tasks when GPT is back online

## Setup Instructions

1. Drop `gpt-failsafe/` into your root project directory.
2. Add a cron job or schedule `watchdog.js` using your preferred runner:
   ```bash
   node gpt-failsafe/watchdog.js
   ```
3. Optionally run `flush-pending.js` to send any missed tasks.
4. Make sure your GPT endpoint is accessible at `/api/gptops/command`.

---
