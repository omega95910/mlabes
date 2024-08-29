const {
  VoiceConnectionStatus,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
} = require("@discordjs/voice");
const { ChannelType } = require("discord.js"); // Import ChannelType from discord.js

let connection = null; // Global variable to hold the connection

async function joinChannel(client, guildId, voiceChannelId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error("Guild not found");
    return;
  }

  const voiceChannel = guild.channels.cache.get(voiceChannelId);
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    console.error("Voice channel not found or not a voice channel");
    return;
  }

  connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guildId,
    adapterCreator: guild.voiceAdapterCreator,
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    console.log("Disconnected from the voice channel. Attempting to reconnect...");
    setTimeout(() => joinChannel(client, guildId, voiceChannelId), 5000); // Attempt to reconnect after 5 seconds
  });

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log("Successfully connected to the voice channel");
  });

  return connection;
}

module.exports = {
  playSong: async (client, guildId, songUrl) => {
    const voiceChannelId = "1276596504194318376"; // Replace with your actual channel ID

    // Join the voice channel if not already connected
    if (!connection) {
      await joinChannel(client, guildId, voiceChannelId);
    }

    // Create an audio player and resource
    const player = createAudioPlayer();
    const resource = createAudioResource(songUrl);

    // Play the song
    player.play(resource);

    // Listen for player events
    player.on(AudioPlayerStatus.Playing, () => {
      console.log("Quran is now active!");
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log("Playback finished");
      // Optionally, you could handle actions here if needed
    });

    // Subscribe the player to the connection
    if (connection) {
      connection.subscribe(player);
    } else {
      console.error("No connection to subscribe the player to");
    }
  },
};
