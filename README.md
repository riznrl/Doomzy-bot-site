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

## 🛠 Deployment Notes (Railway)

We are still deploying via [Railway](https://railway.app) until the current cycle ends. Once deployed, Windsurf can hot-patch updates as long as they follow the guidelines in this README.

---

## 🔁 DO NOT

- Do **not** let any unapproved user enter the app.
- Do **not** rewrite the login/approval flow unless instructed.
- Do **not** remove any Discord or Socket.io connections.

---

## ⚙ Required ENV Vars

Ensure the following variables exist in Railway:

```env
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_REQUIRED_ROLE_ID=
DISCORD_SIGNUP_CHANNEL_ID=
APPROVED_USER_ID=  # Your own user ID, bypasses role check
```

This ensures smooth operation with Discord API and secure user handling.

---

## 🔧 Maintained By

This project is maintained by Windsurf and Doomzy Core.

Pull requests must be approved before merging.
