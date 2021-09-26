const reset = '\x1b[0m'

const bright = '\x1b[1m'
const dim = '\x1b[2m'
const underscore = '\x1b[4m'
const blink = '\x1b[5m'
const reverse = '\x1b[7m'
const hidden = '\x1b[8m'
const bold = '\033[1m' // why the linter WARNING ?

const fgBlack = '\x1b[30m'
const fgRed = '\x1b[31m'
const fgGreen = '\x1b[32m'
const fgYellow = '\x1b[33m'
const fgBlue = '\x1b[34m'
const fgMagenta = '\x1b[35m'
const fgCyan = '\x1b[36m'
const fgWhite = '\x1b[37m'

const bgBlack = '\x1b[40m'
const bgRed = '\x1b[41m'
const bgGreen = '\x1b[42m'
const bgYellow = '\x1b[43m'
const bgBlue = '\x1b[44m'
const bgMagenta = '\x1b[45m'
const bgCyan = '\x1b[46m'
const bgWhite = '\x1b[47m'

const list = [
  { key: 'bright', value: bright },
  { key: 'dim', value: dim },
  { key: 'underscore', value: underscore },
  { key: 'blink', value: blink },
  { key: 'reverse', value: reverse },
  { key: 'hidden', value: hidden },
  { key: 'fgBlack', value: fgBlack },
  { key: 'fgRed', value: fgRed },
  { key: 'fgGreen', value: fgGreen },
  { key: 'fgYellow', value: fgYellow },
  { key: 'fgBlue', value: fgBlue },
  { key: 'fgMagenta', value: fgMagenta },
  { key: 'fgCyan', value: fgCyan },
  { key: 'fgWhite', value: fgWhite },
  { key: 'bgBlack', value: bgBlack },
  { key: 'bgRed', value: bgRed },
  { key: 'bgGreen', value: bgGreen },
  { key: 'bgYellow', value: bgYellow },
  { key: 'bgBlue', value: bgBlue },
  { key: 'bgMagenta', value: bgMagenta },
  { key: 'bgCyan', value: bgCyan },
  { key: 'bgWhite', value: bgWhite }
]

const colorConsole = function () {
  list.forEach(color => {
    console.log[color.key] = function (...args) {
      return console.log.apply(null, [`${color.value}%s`, ...args, `${reset}`])
    }
  })
}

module.exports = {
  colorConsole,
  reset,
  bright,
  dim,
  underscore,
  blink,
  reverse,
  hidden,
  bold,
  fgBlack,
  fgRed,
  fgGreen,
  fgYellow,
  fgBlue,
  fgMagenta,
  fgCyan,
  fgWhite,
  bgBlack,
  bgRed,
  bgGreen,
  bgYellow,
  bgBlue,
  bgMagenta,
  bgCyan,
  bgWhite
}
