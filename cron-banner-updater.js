'use strict'

const cron = require('cron')
const updateBanner = require('./update-banner.js')

const bannerUpdateJob = (client) => new cron.CronJob('0 0 */3 * *', () => updateBanner(client))

module.exports = bannerUpdateJob
