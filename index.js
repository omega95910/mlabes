const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const keep_alive = require("./keep_alive.js");
const path = require("path");
const { playSong } = require("./quran"); // Import playSong function

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Command Collection
client.commands = new Collection();
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

const clientId = process.env.CLIENT_ID; // Fetch from environment variables
const guildId = process.env.GUILD_ID; // Fetch from environment variables
const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

// Function to register commands
const registerCommands = async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    // Create an array of command data
    const commands = commandFiles.map((file) => {
      const command = require(`./commands/${file}`);
      return command.data.toJSON();
    });

    // Register commands with Discord
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Error reloading commands:", error);
  }
};

client.once("ready", async () => {
  console.log("Online Successfully!");

  // Register commands on bot startup
  await registerCommands();

  // Play song when bot is ready
  await playSong(
    client,
    guildId,
    "https://n0e.radiojar.com/8s5u5tpdtwzuv?rj-ttl=5&rj-tok=AAABjW7yROAA0TUU8cXhXIAi6g",
  );
});

// Interaction handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand() && !interaction.isButton()) return;

  if (interaction.isCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }

  if (interaction.isButton()) {
    // Handle VAK button interaction
    if (interaction.customId.startsWith("vak-")) {
      const vakCommand = client.commands.get("vak");
      await vakCommand.buttonHandler(interaction);
    }
    // Handle 5SIM button interaction
    else if (interaction.customId.startsWith("5sim-")) {
      const fiveSimCommand = client.commands.get("5sim");
      await fiveSimCommand.buttonHandler(interaction);
    }
  }
});

client.login(process.env.BOT_TOKEN);
