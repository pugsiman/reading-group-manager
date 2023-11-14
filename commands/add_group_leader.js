module.exports = {
  name: 'add-group-leader',
  description: 'Add group leader to redis',
  async execute(message, args) {
    const LOG_CHANNEL = message.client.channels.cache.find(channel => channel.id === message.client.consts.LOG_CHANNEL_ID)

    const memberToAdd = args.shift()
    message.client.redisClient.sadd('leaders', memberToAdd, (err, reply) => {
      if (err) console.log(err)
      if (reply === 1) {
        LOG_CHANNEL.send(`I've added ${memberToAdd} as a member to leaders set`)
      } else {
        LOG_CHANNEL.send(`${memberToAdd} is already a member in leaders set`)
      }
    })
  }
}
