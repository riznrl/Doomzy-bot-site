# Doomzy Bot Site


This is the official site interface for the **Doomzy** ecosystem. The project connects users via Discord and grants access only to approved community members. Windsurf handles deployments and UI improvements. This file outlines key behavior and expectations to keep development focused and safe.

---

## 🔒 Access Control (Discord-Gated)

- All users **can visit the login page**, but **no access is granted by default**.
- The exception is the **admin user** (you) who bypasses restrictions.
- If a user is **not part of the Discord server**, they must:
  1. Fill out a **signup form** on the site.
  2. That form includes:
     - Full Name
     - Discord ID
     - Email
     - Reason for Joining
     - A **visual slider** to confirm submission
  3. The form is posted by the Discord bot into a **private channel** (e.g. `#signup-requests`).
  4. Admins review the form and change the user's **Discord role** if approved.
  5. Users with the correct role are allowed access on next login.

---

## ✅ Tomorrow’s Task Coverage

These items are built or scheduled:
- [x] Real-time global feed (via Socket.io)
- [x] Site-wide persistent voice chat (under construction)
- [x] Custom user profiles with banner image
- [x] Clicking a user in a feed links to their profile
- [x] Role-based gating at login
- [x] `#signup-requests` approval queue from form
- [ ] Animated site announcement notification system
- [ ] Better skinning of VC UI
- [ ] Integrated header nav bar (`Global Feed`, `Search`, `Settings`, `Profile`)

---

## 🧪 HydraCheck Debug System

Doomzy includes a comprehensive debugging system called **HydraCheck** that validates all critical systems before deployment.

### Running HydraCheck

```bash
# Run comprehensive system validation
npm run debug
# or
npm test

# Or run directly
node hydraDebug.js
```

### What HydraCheck Validates

- ✅ **Environment Variables**: All required variables are present and valid
- ✅ **Discord Bot Connection**: Bot can login with proper intents
- ✅ **Server Health**: All endpoints respond correctly
- ✅ **API Routes**: Authentication and functionality work properly
- ✅ **File System**: Required directories and assets exist
- ✅ **Code Structure**: All imports and middleware load without errors

### HydraCheck Output

The system provides color-coded output:
- 🟢 **Green**: System working correctly
- 🔴 **Red**: Critical failure detected
- 🟡 **Yellow**: Warning or optional feature

### Debug Report

HydraCheck generates a detailed report in `hydra_debug_report.txt` with:
- Timestamped error logs
- Specific failure reasons
- Environment validation status
- API endpoint health checks

### Railway Integration

The startup process automatically runs a lightweight version of HydraCheck before starting the server:

```bash
npm start  # Runs HydraCheck validation then starts server
```

---

## 🛠 Deployment Notes (Railway)
