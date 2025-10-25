import { SlashCommandBuilder } from 'discord.js';
import { cloneFromGitHub } from '../doomzy-controlbridge/github.js';
import { launchRuntime, stopRuntime, listRuntimes } from '../doomzy-controlbridge/runtime.js';

export const data = new SlashCommandBuilder()
  .setName('deploy')
  .setDescription('Deploy or manage runtimes')
  .addSubcommand(s => s.setName('repo')
    .setDescription('Deploy a GitHub repo')
    .addStringOption(o => o.setName('name').setDescription('Service name').setRequired(true))
    .addStringOption(o => o.setName('url').setDescription('GitHub repo URL').setRequired(true)))
  .addSubcommand(s => s.setName('stop')
    .setDescription('Stop a running service')
    .addStringOption(o => o.setName('name').setDescription('Service name').setRequired(true)))
  .addSubcommand(s => s.setName('list')
    .setDescription('List running services'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'repo') {
    const name = interaction.options.getString('name');
    const url = interaction.options.getString('url');
    await interaction.reply(`🚀 Deploying **${name}** from ${url}...`);
    try {
      const dir = await cloneFromGitHub(url, name);
      await launchRuntime(name, dir);
      await interaction.followUp(`✅ **${name}** launched successfully!`);
    } catch (err) {
      await interaction.followUp(`❌ Deployment failed: ${err.message}`);
    }
  }

  if (sub === 'stop') {
    const name = interaction.options.getString('name');
    const ok = stopRuntime(name);
    await interaction.reply(ok ? `🛑 Stopped **${name}**.` : `⚠️ ${name} not found.`);
  }

  if (sub === 'list') {
    const list = listRuntimes();
    if (!list.length) return interaction.reply('No runtimes active.');
    const out = list.map(r => `• **${r.name}** — PID ${r.pid} (port ${r.port})`).join('\n');
    await interaction.reply(out);
  }
}
