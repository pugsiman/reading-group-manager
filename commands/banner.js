const { MessageEmbed } = require('discord.js')

module.exports = {
  name: 'banner',
  description: 'Manager banner queue',
  async execute (message, args) {
    const action = args.shift()
    const redis = message.client.redisClient

    switch (action) {
      case 'add': {
        const member = message.member.roles.cache.some(role => role.name === 'Member')
        const admin = message.member.roles.cache.some(role => role.name === 'Admin')

        if (!(member || admin)) return

        const imgRegex = (/\.(gif|jpe?g|png)$/i)
        const imgAttachment = message.attachments.find(attachment => imgRegex.test(attachment.url))
        const url = imgAttachment?.url || args.shift()

        if (!imgRegex.test(url)) {
          message.channel.send(`Your picture is not an attachment or not a URL in the correct format (e.g. \`https://somepicture.jpg\`)`)
          return
        }

        const bannerData = {
          url: url,
          info: args.join(' ').replace(/\n\s*/g, ''),
          date: new Date().toLocaleDateString('en-gb'),
          userId: message.member.user.id
        }

        await redis.rpush('banners-queue', JSON.stringify(bannerData), (err, reply) => {
          if (err) console.log(err)
          if (reply !== 0) {
            this.execute(message, ['list'])
          } else {
            message.channel.send(`Was not able to add banner to queue`)
          }
        })
        break
      }
      case 'info':
        await redis.lrange('banners-queue', 0, 0, (err, reply) => {
          if (err) console.log(err)

          const bannerData = JSON.parse(reply[0])

          if (bannerData.info) {
            message.channel.send(`${bannerData.info}`)
          } else {
            message.channel.send(`Banner was not saved with an additional info`)
          }
        })
        break
      case 'list':
        await redis.lrange('banners-queue', 0, -1, (err, reply) => {
          if (err) console.log(err)

          const bannerDataInfos = reply.map(jsonString => {
            const json = JSON.parse(jsonString)
            const date = json.date || 'unknown date'
            return `[${json.info !== '' ? json.info : 'N/A'}](${json.url}) (enqueued in ${date})\n`
          })

          bannerDataInfos[0] = `👉 ${bannerDataInfos[0]}`

          const listEmbed = new MessageEmbed()
            .setTitle('Banners queue (oldest to newest)')
            .setColor('#4d7eff')
            .setDescription(bannerDataInfos.join(''))

          message.channel.send({ embeds: [listEmbed] })
        })
        break
      case 'clear-queue':
        if (!(message.member.user.tag === 'pugs#4915' || message.member.roles.cache.some(role => role.name === 'Admin'))) return
        await redis.del('banners-queue', (err, reply) => {
          if (err) console.log(err)

          if (reply === 1) message.channel.send(`Cleared`)
        })

        break
      case 'trim-last':
        if (!(message.member.user.tag === 'pugs#4915' || message.member.roles.cache.some(role => role.name === 'Admin'))) return
        await redis.rpop('banners-queue', (err, reply) => {
          if (err) console.log(err)

          if (reply) message.channel.send(`Trimmed`)
          this.execute(message, ['list'])
        })

        break
      case 'clear-history':
        if (message.member.user.tag !== 'pugs#4915') return
        message.channel.send(`Not Implemented`)
        break
      case 'skip-current': {
        const admin = message.member.roles.cache.some(role => role.name === 'Admin')
        if (!(message.member.user.tag === 'pugs#4915' || admin)) return

        const updateBanner = require('../update-banner.js')
        await updateBanner(message.client)
        message.channel.send(`Updating...`)
        break
      }
      case 'next-date':
        message.channel.send(`Next job time: <t:${message.client.bannerUpdateJob.nextDate().unix()}:R>`)
        break
      default: await message.channel.send(`\`${action}\` is not a supported action for this command`)
    }
  }
}
