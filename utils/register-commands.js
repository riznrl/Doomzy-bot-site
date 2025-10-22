import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('health check'),
  new SlashCommandBuilder().setName('update_page').setDescription('upload page skeleton').addStringOption(o=>o.setName('page').setDescription('name').setRequired(true))
].map(c => c.toJSON());

async function main(){
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Commands registered');
  } catch (e) {
    console.error(e);
  }
}
main();
