const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
} = require("discord.js");
const fs = require("fs");

const coinsPath = "./data/coins.json";
const ROLE_NAME = "ElMlabes"; // Role name for permissions

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coins")
    .setDescription("Check or modify coins")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Action to perform")
        .addChoices(
          { name: "Check", value: "check" },
          { name: "Set", value: "set" },
          { name: "Give", value: "give" },
          { name: "Take", value: "take" },
        )
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount of coins to set, give, or take")
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to check, give, or take coins for")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles), // Make command visible only to roles with ManageRoles permission

  async execute(interaction) {
    const member = interaction.member;
    if (!member.roles.cache.some((role) => role.name === ROLE_NAME)) {
      await interaction.reply({
        content: "You do not have the required role to use this command.",
        ephemeral: true,
      });
      return;
    }

    if (!fs.existsSync(coinsPath)) {
      fs.writeFileSync(coinsPath, JSON.stringify({}));
    }
    const coinsData = JSON.parse(fs.readFileSync(coinsPath));
    const action = interaction.options.getString("action");
    const amount = interaction.options.getInteger("amount");
    const user = interaction.options.getUser("user") || interaction.user;
    const userId = user.id;

    const embed = new EmbedBuilder()
      .setColor("#ffffff")
      .setFooter({ text: "We makin cash... I see!" })
      .setThumbnail(user.displayAvatarURL());

    if (action === "check") {
      const userCoins = coinsData[userId] || 0;
      embed
        .setTitle("Coin Balance")
        .setDescription(`${user.username} has **${userCoins}** coins.`);
    } else if (action === "set" || action === "give" || action === "take") {
      if (amount === null || isNaN(amount)) {
        embed
          .setTitle("Error")
          .setDescription(`Usage: /coins ${action} <amount> [user]`)
          .setColor("#ffffff");
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      let actionDescription;

      if (action === "set") {
        coinsData[userId] = amount;
        embed
          .setTitle("Coins Updated")
          .setDescription(`Coins set to **${amount}** for ${user.username}`);
      } else if (action === "give") {
        coinsData[userId] = (coinsData[userId] || 0) + amount;
        const commandUser = interaction.user.username;
        const newBalance = coinsData[userId];
        actionDescription = `**${amount}** coins were given to **${user.username}** by **${commandUser}**\nTheir current balance is: **${newBalance}**`;
        embed.setTitle("Coins Updated").setDescription(actionDescription);
      } else if (action === "take") {
        coinsData[userId] = (coinsData[userId] || 0) - amount;
        const commandUser = interaction.user.username;
        const newBalance = coinsData[userId];
        actionDescription = `**${amount}** coins were taken from **${user.username}** by **${commandUser}**\nTheir current balance is: **${newBalance}**`;
        embed.setTitle("Coins Updated").setDescription(actionDescription);
      }
    } else {
      embed
        .setTitle("Error")
        .setDescription("Invalid action specified.")
        .setColor("#ffffff");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    fs.writeFileSync(coinsPath, JSON.stringify(coinsData, null, 2));
    await interaction.reply({ embeds: [embed] });
  },

  async register(client) {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) return;

    const role = guild.roles.cache.find((role) => role.name === ROLE_NAME);
    const roleId = role ? role.id : null;

    if (roleId) {
      await guild.commands.fetch().then((commands) => {
        commands.forEach((command) => {
          if (command.name === "coins") {
            command.permissions.add({
              permissions: [
                {
                  id: roleId,
                  type: "ROLE",
                  permission: true,
                },
              ],
            });
          }
        });
      });
    }
  },
};
