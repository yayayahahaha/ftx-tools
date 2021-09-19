const path = require('path')
const fetch = require('node-fetch')
const { createHeader, formatMoney, fullPath } = require(path.resolve(__dirname, '../utils/index.js'))

function request(fullPath, config = {}) {
  return fetch(fullPath, config).then(response => {
    if (!response.ok) return [null, response]
    return response
      .json()
      .then(response => [response.result, null])
      .catch(e => [null, e])
  })
}

async function getWalletBalance(subAccount) {
  const path = '/api/wallet/balances'
  const headers = createHeader({ path, subAccount })

  return request(fullPath(path), { headers })
}
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
async function getFills(subAccount = '') {
  // 成交
  const path = `/api/fills`
  const headers = createHeader({ path, subAccount })
  return request(fullPath(path), { headers })
}
async function getMarkets(subAccount = '') {
  const path = '/api/markets'
  const headers = createHeader({ path, subAccount })
  return request(fullPath(path), { headers })
}
async function getSubAccounts() {
  const path = '/api/subaccounts'
  const headers = createHeader({ path })
  return request(fullPath(path), { headers })
}
/*async function getSomething() {
  GET /markets/{market_name}/candles?resolution={resolution}&start_time={start_time}&end_time={end_time}

}*/

module.exports = {
  getWalletBalance,
  sendLendingOffer,
  getFills,
  getMarkets,
  getSubAccounts
}
