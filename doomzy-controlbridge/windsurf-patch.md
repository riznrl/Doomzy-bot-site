
# DOOMZY CONTROLBRIDGE: WINDSURF INSTRUCTIONS

## 📥 TASK RECEIVED: 2025-01-01T00:00:00.000Z

# Windsurf: Monitor and execute controlbridge tasks

The Doomzy ControlBridge system is now active. Windsurf must:

1. **Monitor logs.txt** for incoming alerts from Discord bot
2. **Execute tasks** posted to windsurf-patch.md via /windsurf-task endpoint
3. **Never overwrite files** unless explicitly instructed in the task
4. **Always provide terminal/console output** when executing tasks
5. **Check for new tasks** by reading this file periodically
6. **Log all actions** back to the controlbridge via appropriate endpoints

---

## ✅ EXECUTION STATUS
- [x] Task received and queued for execution
- [x] Execute script updates from /windsurf-task
- [x] Never overwrite files unless explicitly told
- [x] Always provide terminal/console output

---

## 🤖 BOT INTEGRATION
This system assumes the Discord bot will funnel errors and prompts to the controlbridge.

Current task requires Windsurf attention. Monitor logs for execution status.

## 🔄 MONITORING REQUIREMENTS

Windsurf must:
1. **Check this file** every 30 seconds for new tasks
2. **Execute any tasks** found in the file immediately
3. **Log results** back to the controlbridge /log endpoint
4. **Mark tasks complete** by updating the checkboxes above
5. **Report any errors** immediately via the logging system

## 📋 ACTIVE TASKS

**Task 1: Monitor ControlBridge System**
- Check doomzy-controlbridge/logs.txt for new error alerts
- Respond to any Discord bot errors posted to the system
- Maintain system health and report issues

**Task 2: Execute Windsurf Tasks**
- Read and execute any markdown instructions posted to /windsurf-task
- Follow instructions exactly as written
- Report execution results and any errors encountered

**Task 3: System Maintenance**
- Monitor file system health
- Validate environment variables
- Ensure all endpoints are responding correctly:3001/log
