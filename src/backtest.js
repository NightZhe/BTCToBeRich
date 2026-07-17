'use strict';

const { fetchKlines } = require('./binance');
const { detect } = require('./detector');
const { formatTaipeiTime } = require('./notify');

const SYMBOL = 'BTCUSDT';
const INTERVAL = '5m';
const DETECT_WINDOW = 120; // 必須與 monitor.js 的 DETECT_WINDOW 一致，回測才能代表實盤行為
const COOLDOWN_MS = 60 * 60 * 1000; // 必須與 monitor.js 的 COOLDOWN_MS 一致
const WARMUP_DAYS = 3; // 起始日之前多抓幾天，讓 EMA/MA 有足夠暖機資料

/** 把 "YYYY-MM-DD"（視為台北時間該日 00:00）轉成 UTC epoch ms */
function taipeiMidnightMs(dateStr) {
  const ms = new Date(`${dateStr}T00:00:00+08:00`).getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`日期格式錯誤：${dateStr}，請用 YYYY-MM-DD`);
  }
  return ms;
}

/**
 * 對一段已收盤 K 線（由舊到新）逐根跑偵測，含冷卻邏輯，
 * 與 monitor.js 的實盤行為一致（DETECT_WINDOW / COOLDOWN_MS 相同）。
 * 回傳的 entry 帶有觸發點在陣列中的位置，供 analyze.js 做後續走勢分析。
 * @returns {{entries: Array<{result: object, index: number, windowStart: number}>, checkedCount: number}}
 */
function findSignals(closedCandles, startMs, endMsExclusive) {
  const entries = [];
  let lastTriggerCloseTime = null;
  let checkedCount = 0;

  for (let i = 0; i < closedCandles.length; i++) {
    const candle = closedCandles[i];
    // 只在目標區間內模擬檢查，暖機期間的 K 棒只拿來算指標，不當作檢查點
    if (candle.closeTime < startMs || candle.closeTime >= endMsExclusive) continue;

    checkedCount++;
    const windowStart = Math.max(0, i - DETECT_WINDOW + 1);
    const result = detect(closedCandles.slice(windowStart, i + 1));

    if (result.insufficientData || !result.triggered) continue;

    const cooledDown =
      lastTriggerCloseTime === null ||
      result.closeTime - lastTriggerCloseTime >= COOLDOWN_MS;
    if (!cooledDown) continue;

    entries.push({ result, index: i, windowStart });
    lastTriggerCloseTime = result.closeTime;
  }

  return { entries, checkedCount };
}

async function runBacktest(startDateStr, endDateStr) {
  const startMs = taipeiMidnightMs(startDateStr);
  const endMsExclusive = taipeiMidnightMs(endDateStr); // 結束日（台北時間 00:00）為區間上界，不含當天
  if (endMsExclusive <= startMs) {
    throw new Error('結束日期必須晚於起始日期');
  }

  const warmupStartMs = startMs - WARMUP_DAYS * 24 * 60 * 60 * 1000;

  console.log(
    `[backtest] 抓取 ${SYMBOL} ${INTERVAL} K 線：` +
      `${formatTaipeiTime(warmupStartMs)}（含暖機） ~ ${formatTaipeiTime(endMsExclusive - 1)}`
  );

  const candles = await fetchKlines({
    symbol: SYMBOL,
    interval: INTERVAL,
    startTime: warmupStartMs,
    endTime: endMsExclusive - 1,
  });

  const now = Date.now();
  const closedCandles = candles.filter((c) => c.closeTime < now);

  console.log(`[backtest] 共取得 ${closedCandles.length} 根已收盤 K 棒（含暖機期間）。`);

  const { entries, checkedCount } = findSignals(closedCandles, startMs, endMsExclusive);

  return { signals: entries.map((e) => e.result), checkedCount };
}

function printReport(signals, checkedCount, startDateStr, endDateStr) {
  console.log(`\n[backtest] 區間 ${startDateStr} ~ ${endDateStr}（不含 ${endDateStr} 當天）`);
  console.log(`[backtest] 共檢查 ${checkedCount} 根已收盤 K 棒。\n`);

  if (signals.length === 0) {
    console.log('[backtest] 沒有任何訊號觸發。');
  } else {
    signals.forEach((s, idx) => {
      const { cond1, cond2, cond3 } = s.reasons;
      console.log(
        `[signal ${idx + 1}] ${formatTaipeiTime(s.closeTime)} 價格=${s.price} ` +
          `跌幅=${(cond1.dropPct * 100).toFixed(2)}% ` +
          `MA7=${cond2.ma7.toFixed(1)} MA25=${cond2.ma25.toFixed(1)} ` +
          `MACD柱=${cond3.hist.toFixed(4)}`
      );
    });
  }

  console.log(`\n[backtest] 總訊號數：${signals.length}`);
}

async function main() {
  const [, , startArg, endArg] = process.argv;
  if (!startArg || !endArg) {
    console.error('用法：node src/backtest.js <起始日 YYYY-MM-DD> <結束日 YYYY-MM-DD>');
    console.error('範例：node src/backtest.js 2026-07-04 2026-07-08');
    process.exit(1);
  }

  try {
    const { signals, checkedCount } = await runBacktest(startArg, endArg);
    printReport(signals, checkedCount, startArg, endArg);
  } catch (err) {
    console.error('[backtest] 執行失敗：', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runBacktest, findSignals, taipeiMidnightMs };
