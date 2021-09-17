const path = require('path')
const fetch = require('node-fetch')
const { createHeader, formatMoney, fullPath } = require(path.resolve(__dirname, '../utils/index.js'))

function request(fullPath, config = {}) {
  return fetch(fullPath, config).then(r => (r.ok ? [r, null] : [null, r]))
}

async function getWalletBalance(subAccount) {
  const path = '/api/wallet/balances'
  const headers = createHeader({ path, subAccount })

  const [result, error] = await request(fullPath(path), { headers })
  if (error) return [null, error]

  return await result
    .json()
    .then(r => [r.result, null])
    .catch(e => [null, e])
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

  const [result, error] = await request(fullPath(path), requestConfig)
  if (error) return [null, error]

  return await result
    .json()
    .then(r => [r, null])
    .catch(e => [null, e])
}
async function getFills(subAccount = '') {
  // 成交
  const path = `/api/fills`
  const headers = createHeader({ path, subAccount })
  const [result, error] = await request(fullPath(path), { headers })
  if (error) return [null, error]

  return await result
    .json()
    .then(r => [r.result, null])
    .catch(r => [null, r])
}
async function getMarkets(subAccount = '') {
  const path = '/api/markets'
  const headers = createHeader({ path, subAccount })
  const [result, error] = await request(fullPath(path), { headers })
  if (error) return [null, error]

  return await result
    .json()
    .then(r => [r.result, null])
    .catch(e => [null, e])
}
async function getSubAccounts() {
  const path = '/api/subaccounts'
  const headers = createHeader({ path })
  const [result, error] = await request(fullPath(path), { headers })
  if (error) return [null, error]

  return await result
    .json()
    .then(r => [r.result, null])
    .catch(e => [null, e])
}

module.exports = {
  getWalletBalance,
  sendLendingOffer,
  getFills,
  getMarkets,
  getSubAccounts
}
