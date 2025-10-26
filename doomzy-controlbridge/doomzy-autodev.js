/**
 * Doomzy AutoDev Engine
 * ----------------------
 * Handles code modification, commit, and deploy tasks from Discord.
 * Requires .env variables:
 *   GITHUB_TOKEN
 *   GITHUB_REPO
 *   EXECUTOR_CHANNEL_ID
 *   EXECUTOR_BOT_ID
 *   AUTO_DEPLOY=true
 */

import fs from "fs";
import path from "path";
import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { Octokit } from "@octokit/rest";
import { exec } from "child_process";
import util from "util";

const run = util.promisify(exec);

const {
  GITHUB_TOKEN,
  GITHUB_REPO,
  EXECUTOR_CHANNEL_ID,
  AUTO_DEPLOY,
  CLIENT_ID,
} = process.env;

const [owner, repo] = GITHUB_REPO.split("/");
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// --- helper logging to console and Discord
export async function logToDiscord(client, msg) {
  console.log("🪵", msg);
  const channel = client.channels.cache.get(EXECUTOR_CHANNEL_ID);
  if (channel) {
    try {
      await channel.send(`\`\`\`ansi\n[0;35m[AutoDev][0m ${msg}\n\`\`\``);
    } catch (e) {
      console.warn("Failed to log to Discord:", e.message);
    }
  }
}

// --- commit and push changes to GitHub
export async function commitAndPushFile(
  filePath,
  content,
  commitMsg = "AutoDev commit"
) {
  const fileName = path.basename(filePath);
  await logToDiscord(
    { channels: { cache: new Map() } },
    `Committing ${fileName}...`
  );

  try {
    const { data: file } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
    });
    const sha = file.sha;

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: commitMsg,
      content: Buffer.from(content).toString("base64"),
      sha,
    });

    return true;
  } catch (err) {
    if (err.status === 404) {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: commitMsg,
        content: Buffer.from(content).toString("base64"),
      });
      return true;
    } else throw err;
  }
}

// --- deploy using GitHub Pages / Actions trigger
export async function triggerDeploy() {
  try {
    await octokit.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: "pages.yml",
      ref: "main",
    });
    return "🚀 Deployment triggered successfully.";
  } catch (err) {
    return `⚠️ Deployment trigger failed: ${err.message}`;
  }
}

// --- register slash commands
export async function registerAutoDevCommands(token) {
  const commands = [
    new SlashCommandBuilder()
      .setName("push")
      .setDescription("Commit and push a file change to GitHub")
      .addStringOption((o) =>
        o
          .setName("path")
          .setDescription("Path to file (e.g., index.js)")
          .setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("content").setDescription("New file content").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("deploy")
      .setDescription("Trigger GitHub Pages deployment"),
    new SlashCommandBuilder()
      .setName("status")
      .setDescription("Show bot auto-deploy status"),
  ];

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands.map((c) => c.toJSON()),
  });
  console.log("✅ AutoDev slash commands registered");
}

// --- main interaction handler
export async function handleAutoDevInteraction(client, interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "status") {
    await interaction.reply({
      content: `🧠 AutoDeploy: ${
        AUTO_DEPLOY ? "Enabled ✅" : "Disabled ❌"
      }\nRepo: ${GITHUB_REPO}`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === "push") {
    const filePath = interaction.options.getString("path");
    const content = interaction.options.getString("content");

    await interaction.reply(`📦 Committing \`${filePath}\`...`);
    try {
      await commitAndPushFile(filePath, content, "AutoDev commit via Discord");
      await interaction.followUp("✅ File committed successfully!");
    } catch (e) {
      await interaction.followUp(`⚠️ Commit failed: ${e.message}`);
    }
  }

  if (interaction.commandName === "deploy") {
    await interaction.reply("🚀 Triggering deploy...");
    const res = await triggerDeploy();
    await interaction.followUp(res);
  }
}
