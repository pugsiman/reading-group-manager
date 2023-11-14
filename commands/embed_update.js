const { MessageEmbed } = require('discord.js')

module.exports = {
  name: 'update-embed',
  description: 'Updates a property of an embed',
  async execute (message, args) {
    const SCHEDULE_CHANNEL = message.client.channels.cache.find(channel => channel.id === message.client.consts.SCHEDULE_CHANNEL_ID)

    const channelMention = args.shift()
    const embedMessages = await SCHEDULE_CHANNEL.messages.fetch()
    const msgForUpdate = embedMessages.find(m => m.embeds[0]?.fields[1].value.includes(channelMention))

    switch (args.shift()) {
      case 'description':
        await msgForUpdate.embeds[0].setDescription(args.join(' '))
        break
      case 'thumbnail':
        await msgForUpdate.embeds[0].setThumbnail(args.shift())
        break
      case 'color':
        await msgForUpdate.embeds[0].setColor(args.shift())
        break
      case 'meeting-time':
        msgForUpdate.embeds[0].fields[2] = {
          name: 'Meeting Time',
          value: args.join(' '),
          inline: true
        }
        break
      case 'current-leaders':
        msgForUpdate.embeds[0].fields[3] = {
          name: 'Current Leaders',
          value: args.join(', '),
          inline: true
        }
        break
      case 'title':
        await msgForUpdate.embeds[0].setTitle(args.join(' '))
        break
      default: return
    }

    await msgForUpdate.edit({ embeds: [new MessageEmbed(msgForUpdate.embeds[0])] })
  }
}
