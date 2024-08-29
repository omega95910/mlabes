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
const dataFile = "./data/vak.json"; // Updated file name to reflect VAK SMS
const COINS_REQUIRED = 10; // Number of coins required to purchase a phone number
const API_KEY = process.env.VAK_API_KEY; // Your VAK SMS API key

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vak")
    .setDescription("Purchase a phone number from VAK SMS")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  async execute(interaction) {
    const member = interaction.member;

    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({
        content:
          "You do not have the required permissions to use this command.",
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.channel;
    const messages = await channel.messages.fetch({ limit: 100 });
    const staticMessage = messages.find(
      (msg) =>
        msg.embeds.length && msg.embeds[0].title === "Phone Number Purchase",
    );

    if (!staticMessage) {
      const embed = new EmbedBuilder()
        .setTitle("Purchase a number to unlock your Blizzard account")
        .setDescription("Click the button below to purchase a phone number.")
        .setColor("#ffffff")
        .setThumbnail("https://i.ibb.co/r626dsT/9790429.png")
        .setFooter({ text: "Ensure you have 10 coins before purchasing." });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("vak-purchase-number")
          .setLabel("Purchase Number")
          .setStyle(ButtonStyle.Success),
      );

      await channel.send({ embeds: [embed], components: [row] });
    }

    await interaction.reply({
      content: "VAK static message has been sent in the channel.",
      ephemeral: true,
    });
  },

  async buttonHandler(interaction) {
    if (interaction.customId === "vak-purchase-number") {
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

      coinsData[userId] = userCoins - COINS_REQUIRED;
      fs.writeFileSync(coinsPath, JSON.stringify(coinsData, null, 2));

      const guild = interaction.guild;
      const user = interaction.user;
      const ticketChannel = await guild.channels.create({
        name: `account-unlock-${user.username}`,
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

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select-country")
        .setPlaceholder("Select a country")
        .addOptions([
          { label: "Romania", value: "ro" },
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

      const selectFilter = (selectInteraction) =>
        selectInteraction.customId === "select-country" &&
        selectInteraction.user.id === user.id;
      const selectCollector = ticketChannel.createMessageComponentCollector({
        filter: selectFilter,
        max: 1,
        time: 900000,
      });

      selectCollector.on("collect", async (selectInteraction) => {
        await selectInteraction.deferUpdate(); // Use deferUpdate for select menus
        const countryCode = selectInteraction.values[0];

        try {
          const service = "bz"; // Service is always any to find the cheapest

          // API call to VAK SMS to purchase a number
          const purchaseResponse = await axios.get(
            `https://vak-sms.com/api/getNumber/?apiKey=${API_KEY}&service=${service}&country=${countryCode}`,
          );

          const phoneNumber = purchaseResponse.data.tel; // Update this line to use 'tel'
          const idNum = purchaseResponse.data.idNum;

          if (phoneNumber) {
            const embed = new EmbedBuilder()
              .setTitle("Purchased Successfully")
              .setDescription(
                `**Phone Number:** ${phoneNumber}\n**ID Number:** ${idNum}`,
              )
              .setColor("#ffffff")
              .setThumbnail("https://i.ibb.co/r626dsT/9790429.png");

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`cancel-${idNum}`)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`ban-${idNum}`)
                .setLabel("Ban")
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId(`another-sms-${idNum}`)
                .setLabel("Another SMS")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true), // Initially disable the button
            );

            await selectInteraction.editReply({
              embeds: [embed],
              components: [row],
            });

            interaction.client.purchasedNumbers =
              interaction.client.purchasedNumbers || {};
            interaction.client.purchasedNumbers[idNum] = {
              phoneNumber,
              idNum,
              userId: interaction.user.id,
              status: "active",
              createdAt: Date.now(), // Store creation time for cooldown
              smsSent: false, // Track if SMS has been sent
            };

            const dataToSave = interaction.client.purchasedNumbers;
            fs.writeFileSync(dataFile, JSON.stringify(dataToSave, null, 2));

            // Function to check for SMS code
            const checkSmsCode = async (id) => {
              const smsResponse = await axios.get(
                `https://vak-sms.com/api/getSmsCode/?apiKey=${API_KEY}&idNum=${id}&all=false`,
              );

              if (smsResponse.data && smsResponse.data.code) {
                await ticketChannel.send(
                  `**SMS Code Received:** ${smsResponse.data.code}`,
                );

                // Mark SMS as sent
                interaction.client.purchasedNumbers[id].smsSent = true;

                // Lock the Ban and Cancel buttons
                const row = await ticketChannel.messages
                  .fetch({ limit: 1 })
                  .then((msg) => msg.first().components[0]);
                row.components[0].setDisabled(true); // Disable Cancel button
                row.components[1].setDisabled(true); // Disable Ban button

                await selectInteraction.editReply({
                  embeds: [embed],
                  components: [row],
                });

                return true; // Stop checking after receiving SMS
              }
              return false; // No SMS received yet
            };

            // Check for SMS immediately after purchase
            const immediateCheck = await checkSmsCode(idNum);
            if (!immediateCheck) {
              // Check for SMS every 10 seconds if not received
              const smsCheckInterval = setInterval(async () => {
                const smsReceived = await checkSmsCode(idNum);
                if (smsReceived) {
                  clearInterval(smsCheckInterval); // Stop checking after receiving SMS
                }
              }, 10000);

              // Stop checking after 5 minutes
              setTimeout(() => {
                clearInterval(smsCheckInterval);
              }, 300000);
            }

            const buttonFilter = (i) =>
              i.customId.startsWith("cancel-") ||
              i.customId.startsWith("ban-") ||
              i.customId.startsWith("another-sms-");
            const buttonCollector =
              ticketChannel.createMessageComponentCollector({
                filter: buttonFilter,
                time: 900000,
              });

            buttonCollector.on("collect", async (i) => {
              await i.deferUpdate(); // Use deferUpdate for button interactions
              const action = i.customId.split("-")[0];
              const id = i.customId.split("-")[1];

              if (!interaction.client.purchasedNumbers[id]) {
                return;
              }

              const numberData = interaction.client.purchasedNumbers[id];

              try {
                switch (action) {
                  case "cancel":
                    // Refund coins
                    coinsData[userId] =
                      (coinsData[userId] || 0) + COINS_REQUIRED;
                    fs.writeFileSync(
                      coinsPath,
                      JSON.stringify(coinsData, null, 2),
                    );

                    const cancelEmbed = new EmbedBuilder()
                      .setTitle("Cancellation")
                      .setDescription(
                        "The purchase has been successfully canceled.",
                      )
                      .setThumbnail("https://i.imgur.com/W3rFaoT.png")
                      .setColor("#ffcc00");
                    await ticketChannel.send({ embeds: [cancelEmbed] });

                    await axios.get(
                      `https://vak-sms.com/api/setStatus/?apiKey=${API_KEY}&status=end&idNum=${id}`,
                    ); // Set status to 'end' for cancellation

                    const warningEmbed = new EmbedBuilder()
                      .setTitle("Warning")
                      .setDescription(
                        "The channel will be deleted in 10 seconds.",
                      )
                      .setColor("#ff0000");
                    await ticketChannel.send({ embeds: [warningEmbed] });

                    setTimeout(async () => {
                      await ticketChannel.delete();
                    }, 10000);
                    break;

                  case "ban":
                    // Refund coins
                    coinsData[userId] =
                      (coinsData[userId] || 0) + COINS_REQUIRED;
                    fs.writeFileSync(
                      coinsPath,
                      JSON.stringify(coinsData, null, 2),
                    );

                    const banEmbed = new EmbedBuilder()
                      .setTitle("Ban")
                      .setDescription(
                        "The number has been successfully banned.",
                      )
                      .setThumbnail("https://i.imgur.com/W3rFaoT.png")
                      .setColor("#ff0000");
                    await ticketChannel.send({ embeds: [banEmbed] });

                    await axios.get(
                      `https://vak-sms.com/api/setStatus/?apiKey=${API_KEY}&status=bad&idNum=${id}`,
                    ); // Set status to 'bad' for banning

                    const banWarningEmbed = new EmbedBuilder()
                      .setTitle("Warning")
                      .setDescription(
                        "The channel will be deleted in 10 seconds.",
                      )
                      .setThumbnail("https://i.imgur.com/sY5EHMG.png")
                      .setColor("#ff0000");
                    await ticketChannel.send({ embeds: [banWarningEmbed] });

                    setTimeout(async () => {
                      await ticketChannel.delete();
                    }, 10000);
                    break;

                  case "another-sms":
                    // Request another SMS
                    await axios.get(
                      `https://vak-sms.com/api/setStatus/?apiKey=${API_KEY}&status=send&idNum=${id}`,
                    ); // Set status to 'send' for another SMS

                    // Check for SMS after requesting another SMS
                    const anotherImmediateCheck = await checkSmsCode(id);
                    if (!anotherImmediateCheck) {
                      // Check for SMS every 10 seconds if not received
                      const smsCheckInterval = setInterval(async () => {
                        const smsReceived = await checkSmsCode(id);
                        if (smsReceived) {
                          clearInterval(smsCheckInterval); // Stop checking after receiving SMS
                        }
                      }, 10000);

                      // Stop checking after 5 minutes
                      setTimeout(() => {
                        clearInterval(smsCheckInterval);
                      }, 300000);
                    }
                    break;
                }
              } catch (error) {
                await i.editReply({
                  content: "An error occurred while processing your request.",
                  ephemeral: true,
                });
              }
            });
          } else {
            await selectInteraction.reply({
              content: "No phone number available at the moment.",
              ephemeral: true,
            });
          }
        } catch (error) {
          console.error("Error fetching phone number:", error);
          await selectInteraction.reply({
            content: "An error occurred while trying to purchase a number.",
            ephemeral: true,
          });
        }
      });
    }
  },
};
