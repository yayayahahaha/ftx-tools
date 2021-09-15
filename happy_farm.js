// TODO language stuff

const path = require('path')
const { getWalletBalance, sendLendingOffer } = require(path.resolve(__dirname, './api/index.js'))
const { arrayToMap, formatMoney, getEnv } = require(path.resolve(__dirname, './utils/index.js'))

// TODO 檢查帳戶和餘額的關係? 像是主錢包已經全額貸出了，查詢出來的還是有金額之類的問題
const subAccount = getEnv('subAccount')

init()
async function init() {
  const [balances, error] = await getWalletBalance(subAccount)
  if (error) return void console.log('[ERROR] getWalletBalance: 取得錢包金額失敗!', await error.json())
  const balanceMap = arrayToMap(balances, 'coin')

  const { free: freeUSD, usdValue: totalUsd } = balanceMap.USD
  if (freeUSD < 0.01) return void console.log(`子帳戶 ${subAccount} USD 可用金額 ${freeUSD} 過低，不發送 lending offer`)

  console.log(`帳戶 ${subAccount} USD 可用金額 ${freeUSD}, 將發送 ledning offer`)

  const [, lendError] = await sendLendingOffer(
    {
      coin: 'USD',
      size: totalUsd,
      rate: 0.0114 / 10000 /* rate * 10000 會是小時收入%數(0/000) */
      // 年化率 1% -> 0.0114 小時利率(0/000), 數字要再除以10000
    },
    subAccount
  )
  if (lendError) {
    console.log('[ERROR] sendLendingOffer: 發送 lending offer 失敗!', await lendError.json())
    return
  }
  console.log(`貸出成功!`)
  console.log(`貸出金額: ${formatMoney(totalUsd)}`)
}
