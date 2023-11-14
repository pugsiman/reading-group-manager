'use strict'

const updateBanner = async (client) => {
  const redis = client.redisClient
  const LOG_CHANNEL = client.channels.cache.find(channel => channel.id === client.consts.LOG_CHANNEL_ID)

  await popQueue(redis, LOG_CHANNEL)

  redis.lrange('banners-queue', 0, 0, async (err, reply) => {
    if (err) {
      console.log(err)
      return
    }
    const bannerJson = reply[0]
    if (!bannerJson) return

    const url = JSON.parse(bannerJson).url
    await tryUpdateBanner(url, redis, LOG_CHANNEL)
    await LOG_CHANNEL.send(`I've updated the banner a few moments ago. My next run is going to be in <t:${client.bannerUpdateJob.nextDate().unix()}:R>`)
  })
}

const popQueue = async (redis, logChannel) => {
  redis.lpop('banners-queue', async (error, reply) => {
    if (error) {
      logChannel.send(`I've failed to pop the banner queue`)
      console.log(error)
      return
    }

    await redis.rpush('banners-history', reply, (err, reply) => {
      if (err) console.log(err)
      if (reply !== 0) {
        logChannel.send(`I've added the previous banner to the history list`)
      } else {
        logChannel.send(`I've failed to add the previous banner to the history list`)
      }
    })
  })
}

// TODO: iterate over failed urls by popping them for a few tries
const tryUpdateBanner = async (url, redis, logChannel) => {
  const attempt = logChannel.guild.setBanner(url)
  const maxRetries = 1
  let retryCount = 0
  do {
    try {
      console.log('Attempting to update banner...', Date.now())
      return await attempt
    } catch (error) {
      const isLastAttempt = retryCount === maxRetries
      if (isLastAttempt) {
        console.error(error)
        return Promise.reject(error)
      }

      // redis.lpop('banners-queue', async (reply, error) => {
      //   if (error) {
      //     logChannel.send(`Failed to pop the banner queue while recovering from a previous failure`)
      //     console.log(error)
      //   }
      //   logChannel.send(`Failed to update the banner. retrying after popping left... (retry number: ${retryCount})`)
      // })
    }
  } while (retryCount++ < maxRetries)
}

module.exports = updateBanner
