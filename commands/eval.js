const { NodeVM } = require('vm2')
const path = require('path')

module.exports = {
  name: 'eval',
  description: 'evaluate an expression in node vm env',
  cooldown: 5,
  async execute (message, args) {
    if (message.author.id !== '314399692211617792') return // pugs

    const jsVM = new NodeVM({
      require: {
        external: ['discord.js'],
        root: [
          path.resolve(__dirname, '..', 'node_modules')
        ]
      },
      sandbox: {
        client: message.client,
        message
      },
      timeout: 100
    })
    const rmvBacktickRgx = /```([^`]*)```/
    const expression = args.join(' ')
    const match = expression.match(rmvBacktickRgx)[1]
    console.log(`evaluating expression: ${match}`)

    try {
      jsVM.run(match, __filename)
    } catch (error) {
      message.channel.send(`error: ${error}`)
    }

    process
      .on('unhandledRejection', (reason, p) => {
        message.channel.send(`error: ${reason}`)
        console.error(reason, 'Unhandled Rejection at Promise', p)
      })
      .on('uncaughtException', err => {
        message.channel.send(`error: ${err}`)
        console.error(err, 'Uncaught Exception thrown')
        process.exit(1)
      })
  }
}
