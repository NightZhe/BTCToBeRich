'use strict';

const { fetchKlines } = require('./binance');
const { detect } = require('./detector');
const { notifySignal, formatTaipeiTime } = require('./notify');
const history = require('./history');
const { startServer } = require('./server');

const SYMBOL = 'BTCUSDT';
const INTERVAL = '5m';
const FETCH_LIMIT = 150; // 抓最近 150 根，濾掉未收盤後仍有足夠暖機資料
const DETECT_WINDOW = 120; // 丟給 detector 的視窗大小
const POLL_INTERVAL_MS = 60 * 1000; // 每 60 秒檢查一次
const COOLDOWN_MS = 60 * 60 * 1000; // 觸發後 60 分鐘內不重複通知

let lastTriggerCloseTime = null;
let running = true;

function onlyClosedCandles(candles) {
  const now = Date.now();
  return candles.filter((c) => c.closeTime < now);
}

async function checkOnce() {
  const raw = await fetchKlines({ symbol: SYMBOL, interval: INTERVAL, limit: FETCH_LIMIT });
  const closed = onlyClosedCandles(raw);
  const window = closed.slice(-DETECT_WINDOW);

  const result = detect(window);
  history.setHeartbeat();

  if (result.insufficientData) {
    console.log(`[monitor] 資料不足（僅 ${window.length} 根），等待下一輪。`);
    return result;
  }

  const timeStr = formatTaipeiTime(result.closeTime);
  const { cond1, cond2, cond3 } = result.reasons;
  console.log(
    `[monitor] ${timeStr} 收盤價=${result.price} ` +
      `急跌=${cond1.pass ? '✓' : '✗'}(${(cond1.dropPct * 100).toFixed(2)}%) ` +
      `站上均線=${cond2.pass ? '✓' : '✗'}(MA7=${cond2.ma7.toFixed(1)},MA25=${cond2.ma25.toFixed(1)}) ` +
      `MACD翻正=${cond3.pass ? '✓' : '✗'}(hist=${cond3.hist.toFixed(4)})`
  );

  history.addCheck(result);

  if (result.triggered) {
    const cooledDown =
      lastTriggerCloseTime === null ||
      result.closeTime - lastTriggerCloseTime >= COOLDOWN_MS;

    if (cooledDown) {
      console.log(`[monitor] >>> 觸發 V 型底部反轉訊號！送出通知。`);
      await notifySignal(result);
      lastTriggerCloseTime = result.closeTime;
      history.addSignal(result);
    } else {
      console.log(`[monitor] 訊號成立但仍在冷卻期內，不重複通知。`);
    }
  }

  return result;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 啟動回補：抓過去 30 天 K 線重算歷史，填進儀表板的訊號清單（30 天）與
 * 檢查紀錄（7 天）。兩者都由 K 線數據決定、可重算，所以不需要持久化儲存，
 * 重啟後照樣有完整歷史。只填清單、不發通知；冷卻基準對齊最後一筆歷史訊號。
 */
async function backfillHistory() {
  const signalDays = history.SIGNAL_MAX_AGE_MS / (24 * 60 * 60 * 1000);
  const checkDays = history.CHECK_MAX_AGE_MS / (24 * 60 * 60 * 1000);
  const now = Date.now();
  const from = now - history.SIGNAL_MAX_AGE_MS;
  const checksFrom = now - history.CHECK_MAX_AGE_MS;
  const warmupMs = 24 * 60 * 60 * 1000; // 多抓 1 天暖機算指標
  const candles = onlyClosedCandles(
    await fetchKlines({ symbol: SYMBOL, interval: INTERVAL, startTime: from - warmupMs })
  );

  const seededSignals = [];
  const seededChecks = [];
  let lastTrigger = null;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].closeTime < from) continue;
    const window = candles.slice(Math.max(0, i - DETECT_WINDOW + 1), i + 1);
    const result = detect(window);
    if (result.insufficientData) continue;
    if (result.closeTime >= checksFrom) seededChecks.push(result);
    if (!result.triggered) continue;
    if (lastTrigger !== null && result.closeTime - lastTrigger < COOLDOWN_MS) continue;
    lastTrigger = result.closeTime;
    seededSignals.push(result);
  }

  history.seedSignals(seededSignals);
  history.seedChecks(seededChecks);
  if (lastTrigger !== null) lastTriggerCloseTime = lastTrigger;
  console.log(
    `[monitor] 已回補歷史：訊號 ${seededSignals.length} 筆（${signalDays} 天）、` +
      `檢查紀錄 ${seededChecks.length} 筆（${checkDays} 天）。`
  );
}

async function main() {
  console.log(`[monitor] 啟動 BTC V 型底部反轉監控（symbol=${SYMBOL}, interval=${INTERVAL}）`);
  console.log(`[monitor] 每 ${POLL_INTERVAL_MS / 1000} 秒檢查一次，冷卻 ${COOLDOWN_MS / 60000} 分鐘。`);

  startServer();

  try {
    await backfillHistory();
  } catch (err) {
    console.error('[monitor] 歷史回補失敗（不影響即時監控）：', err.message);
  }

  try {
    await checkOnce();
  } catch (err) {
    console.error('[monitor] 初次檢查失敗：', err.message);
  }

  while (running) {
    await sleep(POLL_INTERVAL_MS);
    if (!running) break;
    try {
      await checkOnce();
    } catch (err) {
      console.error('[monitor] 檢查失敗（已忽略，等下一輪）：', err.message);
    }
  }
}

function shutdown() {
  console.log('\n[monitor] 收到停止訊號，結束監控。');
  running = false;
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  main();
}

module.exports = { checkOnce, main };
