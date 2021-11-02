// TODO pass params to filter markets
// TODO language stuff

// TODO 總資產佔比 -> 添加 verbose 參數才顯示之類的?
// TODO 處理cache 的問題: 記錄每一次呼叫後的時戳，往前的做cache、往後的當start_time 後以當前時戳做 end_time

const path = require('path')
const { arrayToMap, formatMoney, printResult } = require(path.resolve(__dirname, './utils/index.js'))
const { fetchSubAccount, fetchMarkets, fetchDeposits, fetchWithdrawals } = require(path.resolve(
  __dirname,
  './utils/fetch.js'
))
const { getHistoricalPrices, getFills } = require(path.resolve(__dirname, './api/index.js'))
const { bold, fgYellow, reset } = require(path.resolve(__dirname, './utils/console.js'))

const fs = require('fs')

const argument = process.argv.length > 2 ? process.argv[2] : null
let mode
switch (argument) {
  // TODO: 合併損益 or 歷史總投資？
  // case 'a':
  // case 'all':
  //   mode = 'all'
  //   break
  case 'r':
  case 'realized':
    mode = 'realized'
    break
  case 'u':
  case 'ur':
  case 'unrealized':
  case null:
    mode = 'unrealized'
    break
  default:
    mode = 'unrealized'
    console.warn(`傳入的 mode 參數 ${argument} 對應不到模式，將使用預設模式(未實現損益)`)
}

init(mode)

async function init(presentMode) {
  const [subAccounts, subAccountError] = await fetchSubAccount()
  if (subAccountError) return
  subAccounts.push({ nickname: '' /* 主錢包 */ })

  const sumCount = { nonSpotGoods: 0 }
  const subAccountInfoPromise = subAccounts.map(account => fetchFills(account.nickname, sumCount))
  const subAccountInfoResult = await Promise.all(subAccountInfoPromise)
  const hasError = subAccountInfoResult.map(result => result[1]).filter(error => error).length
  if (hasError) {
    console.log('[ERROR] fetchWalletInfo 取得subAccountInfo 失敗!', subAccountInfoResult)
    return
  }

  // 將subAccount 的項目加總
  const rowFills = subAccountInfoResult
    .map(result => result[0])
    .reduce((list, subAccountResult) => list.concat(subAccountResult), [])
    .sort((a, b) => new Date(a.time).valueOf() - new Date(b.time).valueOf())

  const map = arrayToMap(rowFills, 'market', { isMulti: true })
  const fills = _addThemAll(map)
  // fs.writeFileSync('./result.json', JSON.stringify(fills, null, 2))

  // 取得當前行情
  const [markets, marketsError] = await fetchMarkets(Object.keys(fills))
  if (marketsError) return

  const result = markets.reduce((map, market) => {
    const { name, price: currentPrice } = market
    const { averagePrice, spendUsd, size } = fills[name]
    const revenuePersent = `${formatMoney(((currentPrice - averagePrice) * 100) / averagePrice, 4)}`
    const nowUsd = formatMoney(size * currentPrice, 4)
    const revenueUsd = formatMoney(nowUsd - spendUsd, 4)
    const fillsInfo = {
      name,
      currentPrice,
      revenuePersent,
      revenueUsd,
      nowUsd
    }
    // 已實現損益
    if (presentMode === 'realized') {
      const { realizedAveragePrice, realizedAverageCost, realizedUsd, realizedCost } = fills[name]
      const realizedRevenuePercent = realizedAverageCost
        ? `${formatMoney(((realizedAveragePrice - realizedAverageCost) * 100) / realizedAverageCost, 4)}`
        : 0
      const realizeRevenueUsd = formatMoney(realizedUsd - realizedCost, 4)
      Object.assign(fillsInfo, { realizedRevenuePercent, realizeRevenueUsd })
    }

    map[name] = Object.assign({}, fills[name], fillsInfo)
    return map
  }, {})

  printResult(result, presentMode)
  if (sumCount.nonSpotGoods) {
    console.log('')
    console.log(
      `${bold}${fgYellow}--交易紀錄裡有 ${sumCount.nonSpotGoods} 筆非現貨交易的紀錄, 這些紀錄損益將會被忽略--${reset}`
    )
    console.log('')
  }

  function _addThemAll(map) {
    const defaultConstructor = {
      spendUsd: 0,
      size: 0,
      averagePrice: 0
    }
    // 已實現損益
    if (presentMode === 'realized') {
      Object.assign(defaultConstructor, {
        realizedUsd: 0,
        realizedCost: 0,
        realizedSize: 0,
        realizedAveragePrice: 0,
        realizedAverageCost: 0
      })
    }

    let result = Object.keys(map).reduce((info, market) => {
      info[market] = info[market] || Object.assign({}, defaultConstructor)
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

        // 已實現損益
        if (presentMode === 'realized' && side === 'sell') {
          marketInfo.realizedUsd += price * size
          marketInfo.realizedCost += marketInfo.averagePrice * size
          marketInfo.realizedSize += size
          marketInfo.realizedAveragePrice = marketInfo.realizedSize
            ? marketInfo.realizedUsd / marketInfo.realizedSize
            : 0
          marketInfo.realizedAverageCost = marketInfo.realizedSize
            ? marketInfo.realizedCost / marketInfo.realizedSize
            : 0
        }

        // 未實現損益
        marketInfo.spendUsd += (side === 'buy' ? price : marketInfo.averagePrice) * size * unit
        marketInfo.size += size * unit
        marketInfo.averagePrice = marketInfo.size ? marketInfo.spendUsd / marketInfo.size : 0

        info[`${feeCurrency}/USD`] = info[`${feeCurrency}/USD`] || Object.assign({}, defaultConstructor)
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
}

async function fetchFills(subAccount, sumCount) {
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
  const [list, formatError] = await _normalizedFills(concatList, sumCount)
  if (formatError) {
    console.log('[ERROR] fetchFills: _normalizedFills 失敗!', formatError)
    return [null, formatError]
  }
  return [list, null]

  async function _normalizedFills(list, sumCount) {
    const promises = list
      // 僅接受現貨 or 兌換項目, 不提供合約
      .filter(fill => /^\w+\/\w+$/.test(fill.market) || fill.market === null)
      .map(fill => __mapCurrency(fill))

    sumCount.nonSpotGoods += list.length - promises.length

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
          fee: fill.fee,
          time: fill.time
        }
        const quote = {
          market: `${fill.quoteCurrency}/USD`,
          side: antiSide,
          size: fill.size * fill.price,
          price: quotePrice,
          feeCurrency: fill.feeCurrency,
          fee: fill.fee,
          time: fill.time
        }
        return [base, quote]
      }
    }
  }
}
