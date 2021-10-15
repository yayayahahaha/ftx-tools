const path = require('path')
const fetch = require('node-fetch')
const { createHeader, formatMoney, fullPath } = require(path.resolve(__dirname, '../utils/index.js'))
const qs = require('qs')

function request(fullPath, config = {}) {
  return fetch(fullPath, config).then(response => {
    if (!response.ok) return [null, response]
    return response
      .json()
      .then(response => [response.result, null])
      .catch(e => [null, e])
  })
}

// TODO 透過 input.json 處理 start_time, end_time 的可動項目
function timeParams(config = {}) {
  return (({ start_time, end_time }) => ({ start_time, end_time }))(
    Object.assign(
      {
        start_time: 1564146934,
        end_time: Math.floor(Date.now() / 1000)
      },
      config
    )
  )
}

// GET 取得錢包餘額
async function getWalletBalance(subAccount) {
  const path = '/api/wallet/balances'
  const headers = createHeader({ path, subAccount })

  return request(fullPath(path), { headers })
}
// POST 發送借貸請求
async function sendLendingOffer(body = {}, subAccount = '') {
  body.size = body.size ? formatMoney(body.size) : 0

  const path = '/api/spot_margin/offers'
  const method = 'POST'
  const requestConfig = {
    method,
    headers: createHeader({ path, method, body, subAccount }),
    body: JSON.stringify(body)
  }

  return request(fullPath(path), requestConfig)
}
// GET 取得當前匯率資訊
async function getMarkets(subAccount = '') {
  const path = '/api/markets'
  const headers = createHeader({ path, subAccount })
  return request(fullPath(path), { headers })
}
// GET 充幣
async function getDepositsHistory(subAccount = '') {
  const formStr = qs.stringify(timeParams())

  const path = `/api/wallet/deposits?formStr?${formStr}`
  const headers = createHeader({ path, subAccount })
  return request(fullPath(path), { headers })
}
// GET 提幣
async function getWithdrawalsHistory(subAccount = '') {
  const formStr = qs.stringify(timeParams())

  const path = `/api/wallet/withdrawals?${formStr}`
  const headers = createHeader({ path, subAccount })
  return request(fullPath(path), { headers })
}
// GET 成交, 兌換 也算 (type=otc)
async function getFills(subAccount = '', form = {}) {
  const { market } = form
  const formStr = qs.stringify({ ...timeParams(), market })

  const path = `/api/fills?${formStr}`
  const headers = createHeader({ path, subAccount })
  return request(fullPath(path), { headers })
}
// GET 歷史匯率
async function getHistoricalPrices(subAccount = '', config = {}) {
  const { marketName, timestamp } = config

  if (!marketName) return [null, new Error('marketName 為必填項目')]
  if (!timestamp) return [null, new Error('timestamp 為必填項目')]
  if (!/^\d+$/.test(timestamp)) return [null, new Error('timestamp 格式錯誤')]

  const formStr = qs.stringify({
    resolution: 15,
    start_time: timestamp - 15,
    end_time: timestamp
  })

  const path = `/api/markets/${marketName}/candles?${formStr}`
  const headers = createHeader({ path, subAccount })
  return request(fullPath(path), { headers })
}
// GET 取得子帳戶列表
async function getSubAccounts() {
  const path = '/api/subaccounts'
  const headers = createHeader({ path })
  return request(fullPath(path), { headers })
}

async function getSpotMarginHistory(subAccount = '') {
  const formStr = qs.stringify(timeParams())

  const path = `/api/spot_margin/lending_history?${formStr || ''}`
  const headers = createHeader({ path, subAccount })
  return request(fullPath(path), { headers })
}

module.exports = {
  getWalletBalance,
  sendLendingOffer,
  getFills,
  getMarkets,
  getSubAccounts,
  getDepositsHistory,
  getWithdrawalsHistory,
  getHistoricalPrices,
  getSpotMarginHistory
}
