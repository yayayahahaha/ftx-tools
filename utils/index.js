const path = require('path')
const crypto = require('crypto')
const fs = require('fs')
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
function printResult(result) {
  if (!Object.keys(result).length) {
    console.log('-無損益資訊可以顯示-')
    return
  }
  Object.keys(result).forEach(name => {
    const {
      spendUsd: rowSpendUsd,
      size: rowSize,
      averagePrice: rowAveragePrice,
      tradeCount,
      revenuePersent,
      revenueUsd,
      currentPrice,
      nowUsd
    } = result[name]
    const spendUsd = formatMoney(rowSpendUsd, 4)
    const size = formatMoney(rowSize, 6)
    const averagePrice = formatMoney(rowAveragePrice, 4)
    const nowUsdLabel = spendUsd > nowUsd ? '剩餘價值' : '當前價值'

    console.log(`========== ${name} ==========`)
    console.log(`損益: ${revenueUsd} USD`)
    console.log(`損益率: ${revenuePersent}`)
    console.log('')
    console.log(`交易次數: ${tradeCount} 次`)
    console.log(`持有數量: ${size}`)
    console.log(`均價: ${averagePrice} USD`)
    console.log(`成本: ${spendUsd} USD`)
    console.log(`現價: ${currentPrice} USD`)
    console.log(`${nowUsdLabel}: ${nowUsd} USD`)
    console.log('')
  })
}

module.exports = {
  createHeader,
  arrayToMap,
  formatMoney,
  fullPath,
  getEnv,
  printResult
}
