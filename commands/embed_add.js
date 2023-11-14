const { MessageEmbed } = require('discord.js')

module.exports = {
  name: 'add-embed',
  description: 'Adds an embed',
  async execute (message, args) {
    const SCHEDULE_CHANNEL = message.client.channels.cache.find(channel => channel.id === message.client.consts.SCHEDULE_CHANNEL_ID)

    const title = args.shift()
    const channel = args.shift()
    const desc = args.join(' ')
    const groupEmbed = new MessageEmbed()
      .setColor('#4d7eff')
      .setTitle(title)
      .setDescription(desc)
      .addFields(
        { name: 'Latest Update', value: '___' },
        { name: 'Channel', value: channel, inline: true },
        { name: 'Meeting Time', value: '___', inline: true },
        { name: 'Current Leaders', value: '___', inline: true }
      )

    SCHEDULE_CHANNEL.send({ embeds: [groupEmbed] })
  }
}
