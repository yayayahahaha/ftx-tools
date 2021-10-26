// TODO deposit 和 withdrawal 要不要合併算了..

const path = require('path')
const { v4 } = require('uuid')
const {
  getSubAccounts,
  getHistoricalPrices,
  getDepositsHistory,
  getWithdrawalsHistory,
  getMarkets
} = require(path.resolve(__dirname, '../api/index.js'))

async function fetchMarkets(coins) {
  const coinsMap = coins.reduce((map, coin) => Object.assign(map, { [coin]: true }), {})
  const [response, error] = await getMarkets()
  if (error) {
    console.log('[ERROR] getMarkets: 取得 markets 失敗!', await error.json())
    return [null, error]
  }
  const list = response.filter(i => coinsMap[i.name])

  return [list, null]
}
// 充幣: 用充幣當下的USD匯率去計算價格
async function fetchDeposits(subAccount) {
  const [deposits, error] = await getDepositsHistory(subAccount)
  if (error) {
    console.log('[ERROR] fetchDepositsHistory: getDepositsHistory 失敗!', error)
    return [null, error]
  }

  const depositsPromise = deposits
    .filter(deposit => {
      switch (deposit.coin) {
        case 'USD':
        case 'USDC':
        case 'TUSD':
        case 'USDP':
        case 'BUSD':
        case 'HUSD':
          return false
      }
      return deposit.status === 'confirmed'
    })
    .map(deposit => {
      return new Promise((resolve, reject) => {
        const marketName = `${deposit.coin}/USD`
        const timestamp = Math.floor(new Date(deposit.time).valueOf() / 1000)

        ;(async () => {
          const [history, historyFailed] = await getHistoricalPrices(subAccount, { marketName, timestamp })
          if (historyFailed) reject(historyFailed)

          const price = history[0].close
          const result = {
            id: `__deposit-${v4()}`,
            baseCurrency: deposit.coin,
            quoteCurrency: 'USD',
            type: 'deposit',
            market: `${deposit.coin}/USD`,
            side: 'buy',
            size: deposit.size,
            time: deposit.time,
            price,
            feeCurrency: deposit.coin || 'USD',
            fee: deposit.fee || 0
          }

          return resolve(result)
        })()
      })
    })
  const [depositsResult, depositsFailed] = await Promise.all(depositsPromise)
    .then(response => [response, null])
    .catch(error => [null, error])
  if (depositsFailed) {
    console.log('[ERROR] fetchDeposits: depositsPromise 失敗!', depositsFailed)
    return [null, depositsFailed]
  }
  return [depositsResult, null]
}
// 提幣: 用提幣當下的USD匯率去計算價格
async function fetchWithdrawals(subAccount) {
  const [withdrawals, error] = await getWithdrawalsHistory(subAccount)
  if (error) {
    console.log('[ERROR] fetchWithdrawals: getWithdrawalsHistory 失敗!', error)
    return [null, error]
  }
  const withdrawalsPromise = withdrawals
    .filter(withdrawal => {
      switch (withdrawal.coin) {
        case 'USD':
        case 'USDC':
        case 'TUSD':
        case 'USDP':
        case 'BUSD':
        case 'HUSD':
          return false
      }
      return withdrawal.status === 'complete'
    })
    .map(withdrawal => {
      return new Promise((resolve, reject) => {
        const marketName = `${withdrawal.coin}/USD`
        const timestamp = Math.floor(new Date(withdrawal.time).valueOf() / 1000)

        ;(async () => {
          const [history, historyFailed] = await getHistoricalPrices(subAccount, { marketName, timestamp })
          if (historyFailed) reject(historyFailed)

          const price = history[0].close
          const result = {
            id: `__withdrawal-${v4()}`,
            baseCurrency: withdrawal.coin,
            quoteCurrency: 'USD',
            type: 'withdrawal',
            market: `${withdrawal.coin}/USD`,
            side: 'sell',
            size: withdrawal.size,
            time: withdrawal.time,
            price,
            feeCurrency: withdrawal.coin || 'USD',
            fee: withdrawal.fee || 0
          }
          return resolve(result)
        })()
      })
    })
  const [withdrawalsResult, withdrawalsFailed] = await Promise.all(withdrawalsPromise)
    .then(response => [response, null])
    .catch(error => [null, error])
  if (withdrawalsFailed) {
    console.log('[ERROR] fetchWithdrawals: withdrawalsPromise 失敗!', withdrawalsFailed)
    return [null, withdrawalsFailed]
  }
  return [withdrawalsResult, null]
}

async function fetchSubAccount() {
  const [result, error] = await getSubAccounts()
  if (error) {
    console.log('[ERROR] getSubAccounts: 取得子帳戶列表失敗!', error)
    return [null, error]
  }

  return [result, null]
}

module.exports = {
  fetchMarkets,
  fetchDeposits,
  fetchWithdrawals,
  fetchSubAccount
}
