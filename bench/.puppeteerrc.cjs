// Puppeteer downloads Chrome for Testing into bench/.cache/puppeteer instead of the home folder.
const { join } = require('node:path')

module.exports = { cacheDirectory: join(__dirname, '.cache', 'puppeteer') }
