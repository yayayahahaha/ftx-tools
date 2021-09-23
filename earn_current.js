// TODO pass params to filter markets
// TODO language stuff

const path = require('path')
const { arrayToMap, formatMoney, printResult } = require(path.resolve(__dirname, './utils/index.js'))
const { fetchSubAccount, fetchMarkets, fetchDeposits, fetchWithdrawals } = require(path.resolve(
  __dirname,
  './utils/fetch.js'
))
const { getHistoricalPrices, getFills } = require(path.resolve(__dirname, './api/index.js'))

init()

async function init() {
  const [subAccounts, subAccountError] = await fetchSubAccount()
  if (subAccountError) return
  subAccounts.push({ nickname: '' /* 主錢包 */ })

  const subAccountInfoPromise = subAccounts.map(account => fetchFills(account.nickname))
  const subAccountInfoResult = await Promise.all(subAccountInfoPromise)
  const hasError = subAccountInfoResult.map(result => result[1]).filter(error => error).length
  if (hasError) {
    console.log('[ERROR] fetchWalletInfo 取得subAccountInfo 失敗!', subAccountInfoResult)
    return
  }

  // 將subAccount 的項目加總
  const fills = subAccountInfoResult
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

  printResult(result)
}

async function fetchFills(subAccount) {
  const fillsReq = getFills(subAccount)
  const depositsReq = fetchDeposits(subAccount)
  const withdrawalsReq = fetchWithdrawals(subAccount)

  const [[fills, fillsError], [deposits, depositsError], [withdrawals, withdrawalsError]] = await Promise.all([
    fillsReq,
    depositsReq,
    withdrawalsReq
  ])
  if (fillsError || depositsError || withdrawalsError) {
    console.log('[ERROR] fetchFills: 取得資料失敗!')
    return [null, { fillsError, depositsError, withdrawalsError }]
  }

  const concatList = [...fills, ...deposits, ...withdrawals]
  const [list, formatError] = await _normalizedFills(concatList)
  if (formatError) {
    console.log('[ERROR] fetchFills: _normalizedFills 失敗!', formatError)
    return [null, formatError]
  }

  const map = arrayToMap(list, 'market', { isMulti: true })
  const result = _addThemAll(map)
  return [result, null]

  function _addThemAll(map) {
    let result = Object.keys(map).reduce((info, market) => {
      info[market] = info[market] || { spendUsd: 0, size: 0, averagePrice: 0 }
      const marketInfo = info[market]

      const tradeList = map[market]
      marketInfo.tradeCount = tradeList.length
      tradeList.forEach(trade => {
        const { side, price, size, feeCurrency, fee } = trade
        let unit = 0
        switch (side) {
          case 'buy':
            unit = 1
            break
          case 'sell':
            unit = -1
            break
          default:
            console.log(`[ERROR] _addThemAll: side 既不是buy 也不是 sell, 是 ${side} !`)
            return
        }

        marketInfo.spendUsd += price * size * unit
        marketInfo.size += size * unit
        marketInfo.averagePrice = marketInfo.size ? marketInfo.spendUsd / marketInfo.size : 0

        info[`${feeCurrency}/USD`] = info[`${feeCurrency}/USD`] || { spendUsd: 0, size: 0, averagePrice: 0 }
        const feeInfo = info[`${feeCurrency}/USD`]
        feeInfo.size += fee * unit
      })

      return info
    }, {})
    result = Object.keys(result).reduce((info, market) => {
      if (result[market].size <= 0.000001) return info
      info[market] = result[market]
      return info
    }, {})
    return result
  }
  async function _normalizedFills(list) {
    const promises = list.map(fill => __mapCurrency(fill))
    return await Promise.all(promises)
      .then(result => [result.reduce((list, item) => list.concat(item), []), null])
      .catch(error => [null, error])

    async function __mapCurrency(fill) {
      fill.market = `${fill.baseCurrency}/${fill.quoteCurrency}`
      if (fill.quoteCurrency === 'USD') return [fill]
      else if (fill.baseCurrency === 'USD') return ___baseIsUsd(fill)
      else return await ___bothNotUsd(fill)

      function ___baseIsUsd(fill) {
        // 用其他幣種的要做反轉: 用 A 買 USD -> 賣 A 得 USD, 賣 USD 得 A -> 用 USD 買 A
        fill.market = `${fill.quoteCurrency}/${fill.baseCurrency}`
        fill.side = fill.side === 'buy' ? 'sell' : 'buy'
        fill.size = fill.size * fill.price
        fill.price = 1 / fill.price
        ;[fill.baseCurrency, fill.quoteCurrency] = [fill.quoteCurrency, fill.baseCurrency]
        return [fill]
      }
      async function ___bothNotUsd(fill) {
        // quoteCurrency 和 baseCurrency 都不是 USD 的情況:
        // 展開成兩筆交易: 把被使用的幣種轉換成 USD, 再用那個USD 去做原有的交易
        const timestamp = Math.floor(new Date(fill.time).valueOf() / 1000)
        const baseMarketName = `${fill.baseCurrency}/USD`
        const quoteMarketName = `${fill.quoteCurrency}/USD`
        const basePromise = getHistoricalPrices(subAccount, { marketName: baseMarketName, timestamp })
        const quotePromise = getHistoricalPrices(subAccount, { marketName: quoteMarketName, timestamp })

        const [[rowBasePrice, baseError], [rowQuotePrice, quoteError]] = await Promise.all([basePromise, quotePromise])
        if (baseError || quoteError) {
          console.log('[ERROR] get historyPrice error!', baseError, quoteError)
          throw new Error(JSON.stringify({ baseError, quoteError }))
        }
        const [{ close: basePrice }] = rowBasePrice
        const [{ close: quotePrice }] = rowQuotePrice

        const antiSide = fill.side === 'sell' ? 'buy' : 'sell'
        const base = {
          market: `${fill.baseCurrency}/USD`,
          side: fill.side,
          size: fill.size,
          price: basePrice,
          feeCurrency: fill.feeCurrency,
          fee: fill.fee
        }
        const quote = {
          market: `${fill.quoteCurrency}/USD`,
          side: antiSide,
          size: fill.size * fill.price,
          price: quotePrice,
          feeCurrency: fill.feeCurrency,
          fee: fill.fee
        }
        return [base, quote]
      }
    }
  }
}
