// TODO pass params to filter markets
// TODO language stuff

// TODO 總資產佔比 -> 添加 verbose 參數才顯示之類的?

const path = require('path')
// const { arrayToMap, formatMoney, printResult } = require(path.resolve(__dirname, './utils/index.js'))
const { getSpotMarginHistory } = require(path.resolve(__dirname, './api/index.js'))
const fs = require('fs')

init()

async function init() {
  const [result, error] = await getSpotMarginHistory()
  fs.writeFileSync(path.resolve(__dirname, './lending_history.json'), JSON.stringify(result, null, 2))
  if (error) return void console.log('[ERROR] getSpotMarginHistory: 取得歷史借貸紀錄失敗!', error)

  // 這個如果不是USD 的話會有匯率問題
  const sum = result.reduce((info, item) => {
    info[item.coin] = info[item.coin] || 0
    info[item.coin] += item.proceeds
    return info
  }, {})
  console.log(`從 ${result[0].time} 開始`)
  console.log(`到 ${result.slice(-1)[0].time} 結束`)
  console.log(sum)
}
