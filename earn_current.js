// TODO pass params to filter markets
// TODO language stuff

const path = require('path')
const { getFills, getMarkets } = require(path.resolve(__dirname, './api/index.js'))
const { arrayToMap, formatMoney, getEnv } = require(path.resolve(__dirname, './utils/index.js'))

const subAccount = getEnv('subAccount') || ''

init()

async function init() {
  const [fills, fillsError] = await fetchFills(subAccount)
  if (fillsError) return
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
  console.log(`${subAccount || '主'}帳戶: ${subAccount}`)
  if (!Object.keys(result).length) {
    console.log('-無損益資訊可以顯示-')
    return
  }
  Object.keys(result).forEach(name => {
    const { spendUsd, size, averagePrice, revenuePersent, revenueUsd, currentPrice, nowUsd } = result[name]
    console.log(`幣種: ${name}`)
    console.log(`損益: ${revenueUsd} USD`)
    console.log(`損益率: ${revenuePersent}`)
    console.log('')
    console.log(`持有數量: ${size}`)
    console.log(`均價: ${averagePrice} USD`)
    console.log(`成本: ${spendUsd} USD`)
    console.log(`現價: ${currentPrice} USD`)
    console.log(`收入: ${nowUsd} USD`)
    console.log('----------')
  })
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
