const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");

const coinsPath = "./data/coins.json";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your coin balance"),

  async execute(interaction) {
    if (!fs.existsSync(coinsPath)) {
      fs.writeFileSync(coinsPath, JSON.stringify({}));
    }
    const coinsData = JSON.parse(fs.readFileSync(coinsPath));
    const userId = interaction.user.id;
    const userCoins = coinsData[userId] || 0;

    const embed = new EmbedBuilder()
      .setColor("#ffffff")
      .setTitle("Your Coin Balance")
      .setDescription(`You have **${userCoins}** coins.`)
      .setFooter({ text: "Our services are 24/7 Online!" })
      .setThumbnail(interaction.user.displayAvatarURL());

    await interaction.reply({ embeds: [embed] });
  },
};
