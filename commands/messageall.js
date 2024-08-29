const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionsBitField,
} = require("discord.js"); // Import necessary classes

module.exports = {
    data: new SlashCommandBuilder()
        .setName("messageall")
        .setDescription("Sends a message to every user in the server.")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator) // Restrict to Admins only
        .addStringOption(option => 
            option.setName('message')
                .setDescription('The message to send to all users.')
                .setRequired(true)), // Add a required string option for the message

    async execute(interaction) {
        console.log("Command activated.");

        // Defer the reply to handle long-running tasks
        await interaction.deferReply({
            ephemeral: true,
        });

        // Check if the user has the ADMINISTRATOR permission
        if (
            !interaction.member.permissions.has(
                PermissionsBitField.Flags.Administrator
            )
        ) {
            console.log("User lacks permission to use the command.");
            return interaction.editReply({
                content: "You do not have permission to use this command.",
            });
        }

        // Get the message content from the command options
        const messageContent = interaction.options.getString('message');
        console.log(`Message content: ${messageContent}`);

        try {
            console.log("Fetching members...");
            // Fetch all members of the guild
            const members = await interaction.guild.members.fetch({
                force: true,
            });
            console.log(`Fetched ${members.size} members.`);

            // Filter out bots
            const nonBotMembers = members.filter((member) => !member.user.bot);
            console.log(`Filtered ${nonBotMembers.size} non-bot members.`);

            if (nonBotMembers.size === 0) {
                console.log("No non-bot members found.");
                return interaction.editReply({
                    content: "No non-bot members to message.",
                });
            }

            // Create the embed with the dynamic message content
            const embed = new EmbedBuilder()
                .setColor("#FFFFFF") // White color
                .setTitle("ElMlabes 🍬 Notification")
                .setDescription(messageContent) // Use the dynamic message content
                .setThumbnail("https://i.ibb.co/dMZhLB5/57e563a6d2454a739996f4f2e41734e3.png");

            // Send the message to all non-bot members
            for (const member of nonBotMembers.values()) {
                try {
                    console.log(`Sending message to ${member.user.tag}`);
                    await member.send({ embeds: [embed] });
                    console.log(`Sent message to ${member.user.tag}`);
                    // Add a delay to avoid hitting rate limits
                    await delay(1000); // 1 second delay
                } catch (error) {
                    console.error(
                        `Could not send message to ${member.user.tag}: ${error}`
                    );
                }
            }

            await interaction.editReply({
                content: "Embed message has been sent to all users.",
            });
            console.log("Interaction replied successfully.");
        } catch (error) {
            console.error(`Failed to fetch members: ${error}`);
            await interaction.editReply({
                content: "Failed to send messages to all users.",
            });
        }
    },
};

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
