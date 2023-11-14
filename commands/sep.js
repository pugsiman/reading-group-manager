const cheerio = require('cheerio')
const axios = require('axios')
const { MessageEmbed } = require('discord.js')

module.exports = {
  name: 'sep',
  description: 'Searching an entry in SEP',
  cooldown: 10,
  async execute (message, args) {
    console.log(`user ${message.member.user.tag} requested SEP scraping...`)

    const searchQuery = args.join('+')
    const { data } = await axios.get(`https://plato.stanford.edu/search/searcher.py?query=${searchQuery}`)
    const page = cheerio.load(data)
    const firstResult = page('.result_listing .result_url a').first()
    const title = page('.result_title').first().text()
    const url = firstResult.text()

    const entryPageRes = await axios.get(firstResult.attr('href'))
    const entryPage = cheerio.load(entryPageRes.data)
    const summary = entryPage('#preamble')
      .text()
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .substring(0, 565) + '...'
    const embed = new MessageEmbed()
      .setColor('#c1181d')
      .setTitle(title)
      .setURL(url)
      .setThumbnail('https://plato.stanford.edu/symbols/sep-man-red.png')
      .setDescription(summary)

    await message.channel.send({ embeds: [embed] })
  }
}
