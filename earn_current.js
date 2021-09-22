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
const { fetchSubAccount, fetchMarkets, fetchDeposits, fetchWithdrawals } = require(path.resolve(
  __dirname,
  './utils/fetch.js'
))
const { getHistoricalPrices, getFills } = require(path.resolve(__dirname, './api/index.js'))
const fs = require('fs')

init()

async function init() {
  const [subAccounts, subAccountError] = await fetchSubAccount()
  if (subAccountError) return
  subAccounts.push({ nickname: '' /* 主錢包 */ })

  const subAccountInfoPromise = [{ nickname: '' }].map(account => fetchFills(account.nickname))
  // const subAccountInfoPromise = subAccounts.map(account => fetchFills(account.nickname))
  const subAccountInfoResult = await Promise.all(subAccountInfoPromise)
  const hasError = subAccountInfoResult.map(result => result[1]).filter(error => error).length
  if (hasError) {
    console.log('[ERROR] fetchWalletInfo 取得subAccountInfo 失敗!', subAccountInfoResult)
    return
  }

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
  fs.writeFileSync(path.resolve(__dirname, './concatList.json'), JSON.stringify(concatList, null, 2))
  fs.writeFileSync(path.resolve(__dirname, './list.json'), JSON.stringify(concatList, null, 2))
  console.log('concatList: ', concatList.length)
  console.log('list: ', list.length)

  // TODO 這下面可能也要檢查一下..
  const map = arrayToMap(list, 'market', { isMulti: true })
  const result = Object.keys(map).reduce((info, trade) => {
    const tradeList = map[trade]
    const result = tradeList.reduce(
      (sum, tradeInfo) => {
        const { side, price, size, fee: rowFee, feeCurrency } = tradeInfo
        const fee = feeCurrency === 'USD' ? rowFee : rowFee * price

        let spendUsd = 0
        if (side === 'buy') {
          spendUsd = price * size + fee
          sum.spendUsd += spendUsd
          sum.size += size
        } else if (side === 'sell') {
          spendUsd = price * size + fee
          sum.spendUsd += spendUsd
          sum.size -= size
        }

        sum.averagePrice = formatMoney(sum.spendUsd / sum.size, 4)
        return sum
      },
      { spendUsd: 0, size: 0, averagePrice: 0 }
    )
    if (result.size <= 0.0000001) return info
    info[trade] = result

    return info
  }, {})
  return [result, null]

  async function _normalizedFills(list) {
    const promises = list.map(fill => __mapCurrency(fill))
    return await Promise.all(promises)
      .then(result => [result.reduce((list, item) => list.concat(item), []), null])
      .catch(error => [null, error])

    async function __mapCurrency(fill) {
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
