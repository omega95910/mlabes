// Import necessary modules and define constants
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
} = require("discord.js");
const axios = require("axios");
const fs = require("fs");

const coinsPath = "./data/coins.json";
const dataFile = "./data/5sim.json";
const COINS_REQUIRED = 10; // Number of coins required to purchase a phone number
const ROLE_NAME = "ElMlabes"; // Role name for permissions
const API_TOKEN = process.env.FIVE_SIM_API_KEY; // API token for 5SIM

module.exports = {
  data: new SlashCommandBuilder()
    .setName("5sim")
    .setDescription("Purchase a phone number from 5SIM")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  async execute(interaction) {
    // Check if the member has the required role
    const member = interaction.member;
    if (!member.roles.cache.some((role) => role.name === ROLE_NAME)) {
      await interaction.reply({
        content: "You do not have the required role to use this command.",
        ephemeral: true,
      });
      return;
    }

    // Check if the static message already exists in the channel
    const channel = interaction.channel;
    const messages = await channel.messages.fetch({ limit: 100 });
    const staticMessage = messages.find(
      (msg) =>
        msg.embeds.length && msg.embeds[0].title === "Phone Number Purchase"
    );

    if (!staticMessage) {
      // Send a static message if not found
      const embed = new EmbedBuilder()
        .setTitle("Phone Number Purchase For Blizzard")
        .setDescription("Click the button below to purchase a phone number.")
        .setColor("#ffffff")
        .setThumbnail("https://i.ibb.co/YBkSsW3/6596115.png")
        .setFooter({ text: "Ensure you have 10 coins before purchasing." });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("5sim-purchase-number")
          .setLabel("Purchase Number")
          .setStyle(ButtonStyle.Success)
      );

      await channel.send({ embeds: [embed], components: [row] });
    }

    await interaction.reply({
      content: "5sim static message has been sent in the channel.",
      ephemeral: true,
    });
  },

  async buttonHandler(interaction) {
    if (interaction.customId === "5sim-purchase-number") {
      // Check and load user coins
      if (!fs.existsSync(coinsPath)) {
        fs.writeFileSync(coinsPath, JSON.stringify({}));
      }
      const coinsData = JSON.parse(fs.readFileSync(coinsPath));
      const userId = interaction.user.id;

      const userCoins = coinsData[userId] || 0;
      if (userCoins < COINS_REQUIRED) {
        await interaction.reply({
          content: `You need **${COINS_REQUIRED}** coins to purchase a phone number.`,
          ephemeral: true,
        });
        return;
      }

      // Deduct coins and create a ticket channel
      coinsData[userId] = userCoins - COINS_REQUIRED;
      fs.writeFileSync(coinsPath, JSON.stringify(coinsData, null, 2));

      const guild = interaction.guild;
      const user = interaction.user;
      const ticketChannel = await guild.channels.create({
        name: `number-bz-${user.username}`,
        type: 0, // GUILD_TEXT
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: ["ViewChannel"],
          },
          {
            id: user.id,
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
          },
        ],
      });

      // Send the country selection menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select-country")
        .setPlaceholder("Select a country")
        .addOptions([
          { label: "England", value: "england" },
          { label: "Netherlands", value: "netherlands" },
          { label: "India", value: "india" },
          { label: "Ukraine", value: "ukraine" },
          { label: "Spain", value: "spain" },
          { label: "Malawi", value: "malawi" },
          // Add more countries as needed
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await ticketChannel.send({
        components: [row],
      });

      await interaction.reply({
        content: `A private ticket has been created for you. <#${ticketChannel.id}>`,
        ephemeral: true,
      });

      // Handle the selection of a country
      const selectFilter = (selectInteraction) =>
        selectInteraction.customId === "select-country" &&
        selectInteraction.user.id === user.id;
      const selectCollector = ticketChannel.createMessageComponentCollector({
        filter: selectFilter,
        max: 1,
        time: 900000,
      });

      selectCollector.on("collect", async (selectInteraction) => {
        await selectInteraction.deferUpdate();

        try {
          const countryCode = selectInteraction.values[0];
          const mapCountriesNames = {
            england: "England",
            netherlands: "Netherlands",
            india: "India",
            ukraine: "Ukraine",
            spain: "Spain",
            malawi: "Malawi",
            // Add more mappings as needed
          };

          const countryName = mapCountriesNames[countryCode];
          if (!countryName) {
            await selectInteraction.editReply({
              content: "Invalid country selected.",
              components: [],
            });
            return;
          }

          const service = "any"; // Service is always any to find the cheapest
          const country = countryCode;

          const purchaseResponse = await axios.get(
            `https://5sim.net/v1/user/buy/activation/${country}/${service}/blizzard`,
            {
              headers: {
                Authorization: `Bearer ${API_TOKEN}`,
              },
            }
          );

          const phoneNumber = purchaseResponse.data.phone;
          const idNum = purchaseResponse.data.id;

          if (phoneNumber) {
            const embed = new EmbedBuilder()
              .setTitle("Purchased Successfully")
              .setDescription(
                `**Phone Number:** ${phoneNumber}\n**ID Number:** ${idNum}`
              )
              .setColor("#ffffff")
              .setThumbnail(
                "https://i.ibb.co/MNnkr3w/Eo-circle-green-white-checkmark-svg.png"
              );

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`cancel-${idNum}`)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`ban-${idNum}`)
                .setLabel("Ban")
                .setStyle(ButtonStyle.Danger)
            );

            const message = await selectInteraction.editReply({
              embeds: [embed],
              components: [row],
            });

            const messageId = message.id;
            const channelId = message.channel.id;

            interaction.client.purchasedNumbers =
              interaction.client.purchasedNumbers || {};
            interaction.client.purchasedNumbers[idNum] = {
              phoneNumber,
              idNum,
              userId: interaction.user.id,
              status: "active",
              createdAt: Date.now(), // Store creation time for cooldown
            };

            const dataToSave = interaction.client.purchasedNumbers;
            fs.writeFileSync(dataFile, JSON.stringify(dataToSave, null, 2));

            // Timer countdown
            let timeRemaining = 420; // 7 minutes in seconds
            const timerEmbed = await ticketChannel.send({
              content: `**Time to expire**: ${Math.floor(timeRemaining / 60)}:${(
                timeRemaining % 60
              ).toString().padStart(2, "0")}`,
            });

            const timerInterval = setInterval(async () => {
              timeRemaining--;
              if (timeRemaining <= 0) {
                clearInterval(timerInterval);

                // Refund the coins since the timer expired
                coinsData[interaction.user.id] += COINS_REQUIRED;
                fs.writeFileSync(coinsPath, JSON.stringify(coinsData, null, 2));

                // Send warning and delete the channel
                const warningEmbed = new EmbedBuilder()
                  .setTitle("Channel Deletion Warning")
                  .setDescription("This channel will be deleted in 10 seconds.")
                  .setThumbnail("https://i.imgur.com/sY5EHMG.png")
                  .setColor("#ff0000");

                await ticketChannel.send({ embeds: [warningEmbed] });

                setTimeout(async () => {
                  try {
                    const channel = await interaction.client.channels.fetch(
                      channelId
                    );
                    await channel.delete();
                  } catch (error) {
                    console.error("Failed to delete channel:", error);
                  }
                }, 10000);
              } else {
                await timerEmbed.edit({
                  content: `**Time to expire**: ${Math.floor(timeRemaining / 60)}:${(
                    timeRemaining % 60
                  ).toString().padStart(2, "0")}`,
                });
              }
            }, 1000);

            // Function to handle button interactions
            const buttonFilter = (i) =>
              i.customId.startsWith("cancel-") || i.customId.startsWith("ban-");
            const buttonCollector =
              ticketChannel.createMessageComponentCollector({
                filter: buttonFilter,
                time: 900000,
              });

            buttonCollector.on("collect", async (i) => {
              await i.deferUpdate(); // Use deferUpdate for button interactions
              if (!i.replied) {
                const [action, id] = i.customId.split("-");
                if (!id || !interaction.client.purchasedNumbers[id]) return;

                try {
                  let response;
                  switch (action) {
                    case "cancel":
                      response = await axios.get(
                        `https://5sim.net/v1/user/cancel/${id}`,
                        {
                          headers: {
                            Authorization: `Bearer ${API_TOKEN}`,
                          },
                        }
                      );
                      delete interaction.client.purchasedNumbers[id];
                      // Refund the coins
                      coinsData[interaction.user.id] += COINS_REQUIRED;
                      fs.writeFileSync(coinsPath, JSON.stringify(coinsData, null, 2));

                      await i.editReply({
                        embeds: [
                          new EmbedBuilder()
                            .setTitle("Phone Number Cancelled")
                            .setDescription(
                              "Phone number has been successfully cancelled and coins have been refunded."
                            )
                            .setColor("#ff0000")
                            .setThumbnail("https://i.imgur.com/W3rFaoT.png"),
                        ],
                        components: [],
                      });
                      break;
                    case "ban":
                      response = await axios.get(
                        `https://5sim.net/v1/user/ban/${id}`,
                        {
                          headers: {
                            Authorization: `Bearer ${API_TOKEN}`,
                          },
                        }
                      );
                      delete interaction.client.purchasedNumbers[id];
                      // Refund the coins
                      coinsData[interaction.user.id] += COINS_REQUIRED;
                      fs.writeFileSync(coinsPath, JSON.stringify(coinsData, null, 2));

                      await i.editReply({
                        embeds: [
                          new EmbedBuilder()
                            .setTitle("Phone Number Banned")
                            .setDescription(
                              "Phone number has been successfully banned and coins have been refunded."
                            )
                            .setColor("#ff0000")
                            .setThumbnail("https://i.imgur.com/W3rFaoT.png"),
                        ],
                        components: [],
                      });
                      break;
                  }

                  fs.writeFileSync(
                    dataFile,
                    JSON.stringify(
                      interaction.client.purchasedNumbers,
                      null,
                      2
                    )
                  );

                  // Send a warning message and then delete the channel
                  const warningEmbed = new EmbedBuilder()
                    .setTitle("Channel Deletion Warning")
                    .setDescription(
                      "This channel will be deleted in 10 seconds."
                    )
                    .setThumbnail("https://i.imgur.com/sY5EHMG.png")
                    .setColor("#ff0000");

                  await i.message.channel.send({ embeds: [warningEmbed] });

                  setTimeout(async () => {
                    try {
                      const channel = await interaction.client.channels.fetch(
                        channelId
                      );
                      await channel.delete();
                    } catch (error) {
                      console.error("Failed to delete channel:", error);
                    }
                  }, 10000);
                } catch (error) {
                  console.error("Error processing button interaction:", error);
                }
              }
            });

            // Function to check for SMS delivery
            const checkSMS = async () => {
              try {
                const response = await axios.get(
                  `https://5sim.net/v1/user/check/${idNum}`,
                  {
                    headers: {
                      Authorization: `Bearer ${API_TOKEN}`,
                    },
                  }
                );

                const smsData = response.data.sms;
                if (smsData && smsData.length > 0) {
                  const smsText = smsData[0].text;

                  await ticketChannel.send({
                    content: `**SMS Received:** ${smsText}`,
                  });

                  // Delete the channel after 5 minutes
                  setTimeout(async () => {
                    try {
                      await ticketChannel.delete();
                    } catch (error) {
                      console.error("Failed to delete channel:", error);
                    }
                  }, 300000); // 5 minutes in milliseconds

                  return true; // SMS delivered, stop checking
                } else {
                  return false; // SMS not yet delivered, continue checking
                }
              } catch (error) {
                console.error("Error checking SMS delivery:", error);
                return false;
              }
            };

            // Periodically check for SMS delivery every 30 seconds
            const smsCheckInterval = setInterval(async () => {
              const smsDelivered = await checkSMS();
              if (smsDelivered) {
                clearInterval(smsCheckInterval);
              }
            }, 30000); // 30 seconds in milliseconds
          } else {
            await selectInteraction.editReply({
              content: "Failed to purchase a phone number.",
              components: [],
            });
          }
        } catch (error) {
          await selectInteraction.editReply({
            content: "Failed to fetch phone number details.",
            components: [],
          });
        }
      });
    }
  },
};
