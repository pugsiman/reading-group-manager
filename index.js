'use strict'

require('dotenv').config()

const express = require('express')
const fs = require('fs')
const path = require('path')
const csv = require('fast-csv')

const cheerio = require('cheerio')
const axios = require('axios')

const redis = require('redis')
const redisClient = redis.createClient(process.env.REDIS_URL || 'redis://127.0.0.1:6379')

const PORT = process.env.PORT || 5000

const { prefix } = require('./config.json')

const Discord = require('discord.js')
const client = new Discord.Client({ messageCacheLifetime: 43200, allowedMentions: { parse: ['users', 'roles'], repliedUser: true }, partials: ['CHANNEL'], intents: ['GUILDS', 'GUILD_MESSAGES', 'GUILD_MEMBERS', 'GUILD_MESSAGE_REACTIONS', 'GUILD_PRESENCES', 'GUILD_VOICE_STATES', 'DIRECT_MESSAGES'] })
client.commands = new Discord.Collection()
client.cooldowns = new Discord.Collection()
client.consts = require('./constants.js')
client.redisClient = redisClient

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'))

for (const file of commandFiles) {
  const command = require(`./commands/${file}`)
  client.commands.set(command.name, command)
}
const bannerUpdateJob = require('./cron-banner-updater')(client)
client.bannerUpdateJob = bannerUpdateJob

express().listen(PORT, () => console.log(`Listening on ${PORT}`))

const LOGIN_TOKEN = process.env.DISCORD_TOKEN

client.on('ready', async () => {
  console.log('Role assigner initialized')
  client.user.setActivity('for spies', { type: 'WATCHING' })
  bannerUpdateJob.start()
  const LOG_CHANNEL = client.channels.cache.find(channel => channel.id === client.consts.LOG_CHANNEL_ID)
  console.log('started running bannerUpdateJob cronjob...')
  LOG_CHANNEL.send('Initialized')
})

// Dynamically move voice channels to the top when they're active 
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (newState.channel && oldState.channel) return // mute/unmute/deafen etc'

  const voiceMembersCounts = (oldState.channel || newState.channel)
    .parent
    .children
    .filter(c => c.isVoice())
    .map(c => c.members.size)
  const voiceMembersSum = voiceMembersCounts.reduce((a, b) => a + b, 0)

  if (!newState.channel && voiceMembersSum < 2) {
    return moveVoiceCategory('down', oldState)
  }

  if (!oldState.channel && voiceMembersSum > 1) {
    return moveVoiceCategory('up', oldState)
  }
})

const moveVoiceCategory = async (direction, state) => {
  const voiceCategory = state.guild.channels.cache.find(channel => channel.name === 'Voice')

  if (direction === 'down') {
    await voiceCategory.setPosition(8)
  } else {
    await voiceCategory.setPosition(4)
  }
}

const addRoles = async (rolesToAssign, member) => {
  try {
    const promises = rolesToAssign.map(async (roleName) => {
      const role = await member.guild.roles.cache.find(role => role.name === roleName)
      if (role) await member.roles.add(role)
    })

    await Promise.all(promises)
  } catch (error) {
    console.log(error)
  }
}

client.on('guildMemberUpdate', async (beforeUpdateMember, member) => {
  console.log(`member ${member.user.tag} was updated (before ${beforeUpdateMember.pending}, after ${member.pending})...`)
  if (!beforeUpdateMember.pending || member.pending) return

  console.log(`assigning ${member.user.tag} default role...`)

  const LOG_CHANNEL = client.channels.cache.find(channel => channel.id === client.consts.LOG_CHANNEL_ID)
  const DEFAULT_ROLE = member.guild.roles.cache.find(role => role.name === client.consts.DEFAULT_ROLE)

  await member.roles.add(DEFAULT_ROLE)
  await LOG_CHANNEL.send(`User: ${member.user} was automatically assigned role`)

  // Automatically assign roles to users based on a CSV or database. Import and persist user roles across different servers.
  fs.createReadStream(path.resolve(__dirname, client.consts.MEMBERS_CSV_FILE_NAME))
    .pipe(csv.parse({ headers: true }))
    .on('error', error => console.error(error))
    .on('data', async row => {
      if (member.user.tag !== row.User) return
      console.log(`assigning ${member.user.tag} roles...`)

      // for some reason the role names themselves are 5 following headers to the identifying headers before them
      const roleNames = Object.keys(row).slice(4)
      const rolesToAssign = roleNames.filter(roleName => row[roleName] !== '')

      try {
        const memberRole = await member.guild.roles.cache.find(role => role.name === 'Member')

        await member.roles.add(memberRole)

        if (rolesToAssign.length) await addRoles(rolesToAssign, member)

        await LOG_CHANNEL.send(`User: ${member.user} was automatically assigned roles: Member, ${rolesToAssign}`)

        if (member.roles.cache.has(philEnthuRole.id)) await member.roles.remove(philEnthuRole)
        await member.user.send('Welcome back. I took the liberty of assigning some roles for you')
      } catch (error) {
        console.log(error)
        await LOG_CHANNEL.send(`Failed to send DM or assign User: ${member.user} with at least one of the roles: ${rolesToAssign}`)
      }
    })
})

client.on('messageCreate', async message => {
  if (message.author.bot) return
  if (message.content.startsWith(prefix)) {
    const commandBody = message.content.slice(prefix.length)
    const args = commandBody.trim().split(/ +/)
    const commandName = args.shift().toLowerCase()
    if (!client.commands.has(commandName)) return

    const command = client.commands.get(commandName)

    // Command spam timer
    const passedCooldownCheck = await handleCooldowns(command, message)
    if (!passedCooldownCheck) return

    try {
      await command.execute(message, args)
    } catch (error) {
      console.log(error)
      await message.channel.send('I failed... :(')
    }
  } else {
    // customized SEP preview embed for identified links
    const mentionedSepEntry = /plato\.stanford\.edu\/entries\//.test(message.content)
    if (mentionedSepEntry) await embedSepPreview(message)

    // mentions in message related functionalities
    const mentionedRoles = message.mentions.roles
    if (mentionedRoles.size === 0) return

    const readingGrpLeader = message.member.roles.cache.some(r => r.name === 'Reading Group Leader')
    if (!readingGrpLeader) return

    const scheduleRoleMention = mentionedRoles.some(role => role.name === 'Update-Schedule')
    if (scheduleRoleMention) await updateSchedule(message)

    const onlyGroupMention = mentionedRoles.some(role => role.name.includes('Reading Group')) &&
                             !mentionedRoles.some(role => role.name.includes('Reading Group Pass'))
    if (onlyGroupMention) {
      const rgpRole = await message.guild.roles.cache.find(r => r.name === 'Reading Group Pass')
      await message.channel.send(`${rgpRole}`)
    }
  }
})

const embedSepPreview = async (message) => {
  const entryUrl = message.content.match(/https?:\/\/[^\s]+/)[0]
  const { data } = await axios.get(entryUrl)
  const $ = cheerio.load(data)

  const sectionId = entryUrl.match(/(?<=#).+/)?.[0]
  const summary = sectionId ? $(`:is(#${sectionId}, :has(> [name="${sectionId}"])) + p`) : $('#preamble')
  if (!summary) return

  const embedSummary = summary.text().trim()
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .substring(0, 448) + '...'

  const embed = new Discord.MessageEmbed()
    .setColor('#c1181d')
    .setThumbnail('https://plato.stanford.edu/symbols/sep-man-red.png')
    .setDescription(embedSummary)

  const embedMessage = await message.channel.send({ embeds: [embed] })
  await allowToRemove(embedMessage, message.author)
}

const allowToRemove = async (embedMessage, originalPoster) => {
  await embedMessage.react('🗑')

  const binFilter = (reaction, user) => {
    return reaction.emoji.name === '🗑' && user.id === originalPoster.id
  }

  await embedMessage.awaitReactions({ filter: binFilter, max: 1 })

  console.log(`removing embed ${embedMessage.id}`)
  embedMessage.delete()
}

const updateSchedule = async (message) => {
  const SCHEDULE_CHANNEL = await client.channels.cache.find(channel => channel.id === client.consts.SCHEDULE_CHANNEL_ID)

  try {
    const textForUpdate = message.content.trim().replace(/<@(.*?)>/g, '')
    const channelMessages = await SCHEDULE_CHANNEL.messages.fetch()
    const msgForUpdate = channelMessages.find(m => m.embeds[0] && m.embeds[0].fields[1].value.includes(message.channel.id))
    if (!msgForUpdate) return
    msgForUpdate.embeds[0].fields[0] = {
      name: `Latest Update (${new Date().toLocaleDateString('en-gb')})`,
      value: `${textForUpdate}\n[Jump to original message](${message.url})`
    }
    const editedEmbed = new Discord.MessageEmbed(msgForUpdate.embeds[0])
    await msgForUpdate.edit({ embeds: [editedEmbed] })
    await message.pin()
    const updateMessage = await message.channel.send('Updated and pinned')
    setTimeout(() => updateMessage.delete(), 4000)
  } catch (error) {
    console.log(error)
    await message.channel.send('Failed')
  }
}

const handleCooldowns = async (command, message) => {
  const cooldowns = client.cooldowns
  const cooldownAmount = (command.cooldown || 1) * 1000
  const now = Date.now()

  if (!cooldowns.has(command.name)) {
    cooldowns.set(command.name, now)

    setTimeout(() => cooldowns.delete(command.name), cooldownAmount)
    return true
  }

  const expirationTime = cooldowns.get(command.name) + cooldownAmount

  const timeLeft = (expirationTime - now) / 1000
  message.channel.send(`I'm still resting...      (${Number(timeLeft.toFixed(2))} seconds left)`)
  return false
}

client.login(LOGIN_TOKEN)
