const path = require('path')
const crypto = require('crypto')
const fs = require('fs')
const { bold, fgRed, fgGreen, bright, fgCyan, reset } = require(path.resolve(__dirname, './console.js'))
const { apiKey, secretKey } = (function () {
  try {
    const { apiKey, secretKey } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../input.json')))
    let error = null
    const typeCheck = typeof apiKey === 'string' || typeof secretKey === 'string'
    const valueCheck = apiKey && secretKey
    if (!typeCheck || !valueCheck) {
      error = new Error(`apiKey 或 secretKey 格式錯誤或為空值!`)
      error.custom = true
      throw error
    }
    return { apiKey, secretKey }
  } catch (e) {
    if (e.custom) {
      console.log(`[ERROR] ${e}`)
      return void process.exit()
    }
    console.log('[ERROR] 讀取 key 相關資源失敗! 請從 input.json.default 複製出 input.json 後修改對應參數')
    return void process.exit()
  }
})()

function createHeader(config = {}) {
  const { path, method, body, subAccount } = Object.assign(
    {
      path: '',
      method: 'GET',
      body: null,
      subAccount: null
    },
    config
  )

  if (!path) {
    console.log('[ERROR] createHeader: path 為必填項目!')
    return null
  }
  if (!/^\/api\//.test(path)) {
    console.log('[ERROR] createHeader: path 必須為 /api/ 開頭', path)
    return null
  }

  const timestamp = Date.now()
  const sign = createFtxSign({ timestamp, path, method, body })

  const header = {
    'content-type': 'application/json',
    'FTX-KEY': apiKey,
    'FTX-TS': `${timestamp}`,
    'FTX-SIGN': sign
  }
  if (subAccount) {
    Object.assign(header, { 'FTX-SUBACCOUNT': encodeURI(subAccount) })
  }

  return header
}
function createFtxSign(config = {}) {
  const { timestamp, path, method, body } = config

  const message = `${timestamp}${method}${path}${body ? JSON.stringify(body) : ''}`
  return hmac(message, secretKey)
}
function hmac(message = '', secretKey = '') {
  return crypto.createHmac('sha256', secretKey).update(message).digest('hex')
}

function fullPath(path) {
  return `https://ftx.com${path}`
}

function arrayToMap(list, key = 'id', config = {}) {
  const { isMulti } = Object.assign({ isMulti: false }, config)

  if (isMulti) {
    return list.reduce((map, item) => {
      map[item[key]] = map[item[key]] || []
      map[item[key]].push(item)
      return map
    }, {})
  }

  return list.reduce((map, item) => Object.assign(map, { [item[key]]: item }), {})
}
function formatMoney(value, padding = 8) {
  const offset = Math.pow(10, padding)
  return Math.floor(value * offset) / offset
}
function getEnv(key) {
  const userParams = process.argv.filter(command => /^--\w*/.test(command))
  const subAccount = (function () {
    const commandExist = userParams.find(command => /^--subAccount=\w/)
    return !commandExist ? '' : commandExist.split('--subAccount=')[1]
  })()

  switch (key) {
    case 'subAccount':
      return subAccount
    default:
      console.log(`[ERROR] getEnv: 取得 ${key} 尚未實作!`)
      return null
  }
}
function printResult(result, mode = 'unrealized') {
  if (!Object.keys(result).length) {
    console.log('-無損益資訊可以顯示-')
    return
  }
  console.log(`${fgGreen}綠色↑${reset} ${fgRed}紅色↓${reset}`)
  let totalSpendUsd = 0
  let totalRevenueUsd = 0
  let totalNowUsd = 0
  Object.keys(result)
    .sort((a, b) => result[b].spendUsd - result[a].spendUsd)
    .forEach(name => {
      const {
        spendUsd: rowSpendUsd,
        size: rowSize,
        averagePrice: rowAveragePrice,
        revenuePersent,
        revenueUsd,
        nowUsd,
        // 已實現損益
        realizedAveragePrice,
        realizedSize,
        realizedAverageCost,
        realizedRevenuePercent,
        realizeRevenueUsd
      } = result[name]
      const spendUsd = formatMoney(rowSpendUsd, 4)
      const size = formatMoney(rowSize, 6)
      const averagePrice = formatMoney(rowAveragePrice, 4)

      const tableSort = ['持有數量', '均價', '現價', '成本', '當前餘額']

      const translate = (info => {
        const result = Object.keys(info).reduce((map, key) => {
          switch (key) {
            case 'tradeCount':
              map['交易次數'] = info[key]
              break
            case 'size':
              map['持有數量'] = size
              break
            case 'averagePrice':
              map['均價'] = averagePrice
              break
            case 'spendUsd':
              map['成本'] = spendUsd
              break
            case 'currentPrice':
              map['現價'] = info[key]
              break
            case 'nowUsd':
              map['當前餘額'] = info[key]
              break
            // 已實現損益
            case 'realizedSize':
              map['已實現數量'] = formatMoney(realizedSize, 4)
              break
            case 'realizedAveragePrice':
              map['已實現均價'] = formatMoney(realizedAveragePrice, 4)
              break
            case 'realizedAverageCost':
              map['已實現平均成本'] = formatMoney(realizedAverageCost, 4)
              break
          }
          return map
        }, {})

        let returnObject = {
          unRealizedTable: tableSort.reduce((map, key) => Object.assign(map, { [key]: result[key] }), {})
        }
        // 已實現損益
        if (mode === 'realized') {
          const realizedTableSort = ['已實現數量', '已實現均價', '已實現平均成本']
          returnObject = Object.assign({}, returnObject, {
            realizedTable: realizedTableSort.reduce((map, key) => Object.assign(map, { [key]: result[key] }), {})
          })
        }

        return returnObject
      })(result[name])

      totalSpendUsd += spendUsd
      totalRevenueUsd += revenueUsd
      totalNowUsd += nowUsd

      const consoleColor = revenueUsd > 0 ? fgGreen : fgRed
      console.log(`${bright}${fgCyan}---------- ${bold}${name}${reset}${bright}${fgCyan} ----------${reset}`)
      console.log(`損益: ${consoleColor}${revenueUsd}${reset} USD`)
      console.log(`損益率: ${consoleColor}${revenuePersent}${reset} %`)
      console.table({ [name]: { ...translate.unRealizedTable } })

      // 已實現損益
      if (mode === 'realized') {
        const realizedConsoleColor = realizeRevenueUsd > 0 ? fgGreen : fgRed
        console.log(`已實現損益: ${realizedConsoleColor}${realizeRevenueUsd}${reset} USD`)
        console.log(`已實現損益率: ${realizedConsoleColor}${realizedRevenuePercent}${reset} %`)
        console.table({ [name]: { ...translate.realizedTable } })
      }

      console.log('')
    })

  console.log('----------')
  console.log('')

  const consoleColor = totalRevenueUsd > 0 ? fgGreen : fgRed
  console.log(`總投資金額: ${formatMoney(totalSpendUsd, 4)} USD`)
  console.log(`當前總餘額: ${formatMoney(totalNowUsd, 4)} USD`)
  console.log(`總損益: ${consoleColor}${formatMoney(totalRevenueUsd, 4)}${reset} USD`)
  console.log(`總損益率: ${consoleColor}${formatMoney((totalRevenueUsd * 100) / totalSpendUsd, 4)}${reset} %`)
}

module.exports = {
  createHeader,
  arrayToMap,
  formatMoney,
  fullPath,
  getEnv,
  printResult
}
