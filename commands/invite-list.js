const fs = require('fs')
const path = require('path')
const csv = require('fast-csv')
const { MessageEmbed } = require('discord.js')

module.exports = {
  name: 'invite-list',
  description: 'An embed list of previous members that are not on this server',
  cooldown: 60,
  async execute (message, args) {
    const LOG_CHANNEL = message.client.channels.cache.find(channel => channel.id === message.client.consts.LOG_CHANNEL_ID)

    const populateUserNames = await new Promise(resolve => {
      const csvUserNames = []

      fs.createReadStream(path.resolve(message.client.consts.MEMBERS_CSV_FILE_NAME))
        .pipe(csv.parse({ headers: true }))
        .on('error', error => console.error(error))
        .on('data', row => csvUserNames.push(row.User))
        .on('end', () => resolve(csvUserNames))
    })

    const membersList = await message.member.guild.members.fetch()
    const membersUserNames = membersList.map(member => member.user.tag)

    const invitableUsers = populateUserNames.filter(u => !membersUserNames.includes(u))

    const chunkSize = 100
    for (let part = 0, i = 0; i <
    invitableUsers.length; i += chunkSize, part++) {
      const invitableUsersChunk = invitableUsers.slice(i, i + chunkSize)

      const embed = new MessageEmbed().setColor('0xFFFF')
        .setTitle(`Invite list (former members not here) - PART ${part + 1}`)
        .setDescription(invitableUsersChunk.join('\n'))

      await LOG_CHANNEL.send({ embeds: [embed] })
    }
  }
}
