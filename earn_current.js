// TODO pass params to filter markets
// TODO language stuff

// TODO 兌換 的欄位也要算進損益 --> 已經包含在 fills 裡面了，type 是 otc
// 還有其他基本上所有和錢的++--有關的欄位都要算
// 如果沒有USD換算的，要打api去取得幣種取得當時的匯率去做換算
// ^^^這個感覺"要"寫成function
// --> 把所有交易形式的東西都整理成統一格式後以 USD 作基底去運算感覺比較容易
// --> 時間順序感覺沒差，只要能取得當時匯率的話先加還是先減結果應該要是一樣的

// TODO 所有幣的加總結果也算一算. e.g. 總成本 / 總餘額

// TODO 同步修改 README.md

const path = require('path')
const { arrayToMap, formatMoney } = require(path.resolve(__dirname, './utils/index.js'))
const {
  getSubAccounts,
  getHistoricalPrices,
  getDepositsHistory,
  getWithdrawalsHistory,
  getFills,
  getMarkets
} = require(path.resolve(__dirname, './api/index.js'))

init()

async function init() {
  const [subAccounts, subAccountError] = await fetchSubAccount()
  if (subAccountError) return
  subAccounts.push({ nickname: '' /* 主錢包 */ })

  // const [historicalPrices, historicalPricesError] = await getHistoricalPrices()
  // if (historicalPricesError) return
  const [fill, fillsError] = await getFills()
  if (fillsError) {
    console.log('[ERROR]] getFills: 取得 fills 失敗!', fillsError)
    return
  }
  console.log('fill:', fill.length)
  const [depositsHistory, depositsHistoryError] = await getDepositsHistory()
  if (depositsHistoryError) {
    console.log('[ERROR]] getDepositsHistory: 取得 depositsHistory 失敗!', depositsHistoryError)
    return
  }
  console.log('depositsHistory:', depositsHistory.length)
  const [withdrawalsHistory, withdrawalsHistoryError] = await getWithdrawalsHistory()
  if (withdrawalsHistoryError) {
    console.log('[ERROR]] getWithdrawalsHistory: 取得 withdrawalsHistory 失敗!', withdrawalsHistoryError)
    return
  }
  console.log('withdrawalsHistory:', withdrawalsHistory.length)

  if (true) return

  const subAccountFillsPromise = subAccounts.map(account => fetchFills(account.nickname))
  const subAccountFillsResult = (await Promise.all(subAccountFillsPromise))
    .map(result => result[0])
    .reduce((map, account) => {
      Object.keys(account).forEach(market => {
        if (!map[market]) {
          map[market] = account[market]
          return
        }

        Object.keys(account[market]).forEach(moneyKey => {
          map[market][moneyKey] += account[market][moneyKey]
        })
      })

      return map
    }, {})

  const fills = subAccountFillsResult
  const [markets, marketsError] = await fetchMarkets(Object.keys(fills))
  if (marketsError) return

  const result = markets.reduce((map, market) => {
    const { name, price: currentPrice } = market
    const { averagePrice, spendUsd, size } = fills[name]
    const revenuePersent = `${formatMoney(((currentPrice - averagePrice) * 100) / averagePrice, 4)}%`
    const nowUsd = formatMoney(size * currentPrice, 4)
    const revenueUsd = formatMoney(nowUsd - spendUsd, 4)

    map[name] = Object.assign({}, fills[name], { name, revenuePersent, revenueUsd, currentPrice, nowUsd })
    return map
  }, {})

  // only for print to console
  if (!Object.keys(result).length) {
    console.log('-無損益資訊可以顯示-')
    return
  }
  Object.keys(result).forEach(name => {
    const { spendUsd: rowSpendUsd, size, averagePrice, revenuePersent, revenueUsd, currentPrice, nowUsd } = result[name]
    const spendUsd = formatMoney(rowSpendUsd, 4)
    const nowUsdLabel = spendUsd > nowUsd ? '剩餘價值' : '當前價值'

    console.log(`========== ${name} ==========`)
    console.log(`損益: ${revenueUsd} USD`)
    console.log(`損益率: ${revenuePersent}`)
    console.log('')
    console.log(`持有數量: ${size}`)
    console.log(`均價: ${averagePrice} USD`)
    console.log(`成本: ${spendUsd} USD`)
    console.log(`現價: ${currentPrice} USD`)
    console.log(`${nowUsdLabel}: ${nowUsd} USD`)
    console.log('')
  })
}

async function fetchSubAccount() {
  const [result, error] = await getSubAccounts()
  if (error) {
    console.log('[ERROR] getSubAccounts: 取得子帳戶列表失敗!')
    return [null, error]
  }

  return [result, null]
}
async function fetchFills(subAccount) {
  const [response, error] = await getFills(subAccount)
  if (error) {
    console.log('[ERROR] getFills: 取得 fills 失敗!', await error.json())
    return [null, error]
  }

  const list = response
    .filter(fill => fill.market)
    .sort((a, b) => new Date(a.time).valueOf() - new Date(b.time).valueOf())
  const map = arrayToMap(list, 'market', { isMulti: true })

  const result = Object.keys(map).reduce((info, trade) => {
    const tradeList = map[trade]
    const result = tradeList.reduce(
      (sum, tradeInfo) => {
        // console.log(tradeInfo)
        const { side, price, size, fee: rowFee, feeCurrency } = tradeInfo
        const fee = feeCurrency === 'USD' ? rowFee : rowFee * price

        let spendUsd = 0
        if (side === 'buy') {
          spendUsd = price * size + fee
          sum.spendUsd += spendUsd
          sum.size += size
        } else if (side === 'sell' /* haven't check params when it's not all in */) {
          spendUsd = price * size + fee
          sum.spendUsd += spendUsd
          sum.size -= size
        }

        sum.averagePrice = formatMoney(sum.spendUsd / sum.size, 4)
        return sum
      },
      { spendUsd: 0, size: 0, averagePrice: 0 }
    )
    if (!result.size) return info
    info[trade] = result

    return info
  }, {})

  return [result, error]
}
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
