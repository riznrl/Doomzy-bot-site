// middleware/auth.js
import { Client, GatewayIntentBits } from 'discord.js';

// Discord client for role checking (shared instance)
let discordClient = null;

export const setDiscordClient = (client) => {
  discordClient = client;
};

export const requireAuth = async (req, res, next) => {
  try {
    const user = req.user || req.session?.user;
    if (!user) {
      return res.status(401).json({ ok: false, error: 'auth_required' });
    }

    // Check for admin bypass first
    const approvedUserId = process.env.APPROVED_USER_ID;
    if (approvedUserId && user.id === approvedUserId) {
      console.log(`✅ Admin bypass granted for user ${user.username} (${user.id})`);
      return next();
    }

    // Check role-based access if enabled
    const requiredRoleId = process.env.DISCORD_REQUIRED_ROLE_ID;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (requiredRoleId && guildId && discordClient) {
      try {
        const guild = await discordClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
          console.log(`❌ User ${user.username} (${user.id}) not found in guild`);
          return res.status(403).json({ ok: false, error: 'guild_member_not_found' });
        }

        const hasRequiredRole = member.roles.cache.has(requiredRoleId);
        if (!hasRequiredRole) {
          console.log(`❌ User ${user.username} (${user.id}) missing required role ${requiredRoleId}`);
          return res.status(403).json({ ok: false, error: 'insufficient_permissions' });
        }

        console.log(`✅ Role-based access granted for user ${user.username} (${user.id})`);
      } catch (error) {
        console.error('Error checking user roles:', error);
        return res.status(500).json({ ok: false, error: 'role_check_failed' });
      }
    }

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ ok: false, error: 'auth_error' });
  }
};
