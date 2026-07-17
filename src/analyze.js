'use strict';

/**
 * 訊號品質檢討工具：重跑歷史區間的訊號偵測（與實盤邏輯一致），
 * 對每一筆訊號量化「買點品質」：
 *   - 進場位置：距離 V 型低點幾分鐘、高於低點幾 %、V 型回撤比例
 *   - 後續走勢：30分/1小時/2小時/4小時/24小時 的報酬
 *   - 24 小時內最大不利/有利波動（MAE/MFE）、是否跌破 V 型低點
 * 用法：node src/analyze.js <起始日 YYYY-MM-DD> [結束日 YYYY-MM-DD，省略 = 到現在]
 */

const { fetchKlines } = require('./binance');
const { findSignals, taipeiMidnightMs } = require('./backtest');
const { formatTaipeiTime } = require('./notify');

const SYMBOL = 'BTCUSDT';
const INTERVAL = '5m';
const BAR_MINUTES = 5;
const WARMUP_DAYS = 3; // 起始日前多抓幾天，讓 EMA/MA 有足夠暖機資料

const HORIZONS = [
  { label: '30分', bars: 6 },
  { label: '1小時', bars: 12 },
  { label: '2小時', bars: 24 },
  { label: '4小時', bars: 48 },
  { label: '24小時', bars: 288 },
];
const EXCURSION_BARS = 288; // MAE/MFE 與破低檢查的觀察窗：24 小時

function pctStr(x, digits = 2) {
  if (x === null || x === undefined) return '—';
  const s = (x * 100).toFixed(digits);
  return (x > 0 ? '+' : '') + s + '%';
}

function median(values) {
  const arr = values.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

/**
 * 對每筆訊號算買點品質指標。純函式，方便離線用合成資料測試。
 * @param {Array} closedCandles 已收盤 K 棒（由舊到新）
 * @returns {{rows: Array, checkedCount: number}}
 */
function analyzeSignals(closedCandles, startMs, endMsExclusive) {
  const { entries, checkedCount } = findSignals(closedCandles, startMs, endMsExclusive);

  const rows = entries.map(({ result, index, windowStart }) => {
    const { cond1 } = result.reasons;
    const entryPrice = result.price;
    const vLow = cond1.lowValue;
    const vHigh = cond1.highValue;
    const lowIdxGlobal = windowStart + cond1.lowIndex;

    // 進場位置
    const lagMinutes = (index - lowIdxGlobal) * BAR_MINUTES;
    const aboveLow = (entryPrice - vLow) / vLow;
    const retrace = vHigh > vLow ? (entryPrice - vLow) / (vHigh - vLow) : null;

    // 各時間點的收盤報酬
    const forward = HORIZONS.map(({ label, bars }) => {
      const j = index + bars;
      const ret =
        j < closedCandles.length
          ? (closedCandles[j].close - entryPrice) / entryPrice
          : null;
      return { label, ret };
    });

    // 24 小時觀察窗內的極值
    const endIdx = Math.min(closedCandles.length - 1, index + EXCURSION_BARS);
    let minLow = null;
    let maxHigh = null;
    for (let j = index + 1; j <= endIdx; j++) {
      const c = closedCandles[j];
      if (minLow === null || c.low < minLow) minLow = c.low;
      if (maxHigh === null || c.high > maxHigh) maxHigh = c.high;
    }
    const mae = minLow !== null ? (minLow - entryPrice) / entryPrice : null;
    const mfe = maxHigh !== null ? (maxHigh - entryPrice) / entryPrice : null;
    const brokeVLow = minLow !== null ? minLow < vLow : null;
    const fullWindow = endIdx === index + EXCURSION_BARS;

    return {
      closeTime: result.closeTime,
      entryPrice,
      vHigh,
      vLow,
      dropPct: cond1.dropPct,
      lagMinutes,
      aboveLow,
      retrace,
      forward,
      mae,
      mfe,
      brokeVLow,
      fullWindow,
    };
  });

  return { rows, checkedCount };
}

function printReport(rows, checkedCount) {
  console.log(`\n[analyze] 共檢查 ${checkedCount} 根已收盤 K 棒，觸發 ${rows.length} 筆訊號。\n`);

  rows.forEach((r, idx) => {
    console.log(
      `[${idx + 1}] ${formatTaipeiTime(r.closeTime)} 進場 ${r.entryPrice}` +
        `（前置跌幅 ${pctStr(r.dropPct).replace('+', '')}，V 高 ${r.vHigh.toFixed(2)} → 低 ${r.vLow.toFixed(2)}）`
    );
    console.log(
      `    進場位置：低點後 ${r.lagMinutes} 分鐘、高於低點 ${pctStr(r.aboveLow)}、` +
        `V 型回撤 ${r.retrace === null ? '—' : (r.retrace * 100).toFixed(0) + '%'}`
    );
    console.log(
      `    後續收盤：` + r.forward.map((f) => `${f.label} ${pctStr(f.ret)}`).join(' | ')
    );
    const windowNote = r.fullWindow ? '' : '（後續資料不足 24 小時）';
    console.log(
      `    24小時內：最深 ${pctStr(r.mae)}` +
        `${r.brokeVLow === true ? '，跌破 V 型低點 ✗' : r.brokeVLow === false ? '，守住 V 型低點 ✓' : ''}` +
        ` ／ 最高 ${pctStr(r.mfe)} ${windowNote}`
    );
    console.log('');
  });

  if (rows.length === 0) return;

  const complete = rows.filter((r) => r.fullWindow);
  console.log(`=== 統計（共 ${rows.length} 筆，其中 ${complete.length} 筆有完整 24 小時後續資料）===`);
  console.log(
    `進場位置中位數：低點後 ${median(rows.map((r) => r.lagMinutes))} 分鐘、` +
      `高於低點 ${pctStr(median(rows.map((r) => r.aboveLow)))}、` +
      `V 型回撤 ${(median(rows.map((r) => r.retrace)) * 100).toFixed(0)}%`
  );

  const winRates = HORIZONS.map(({ label }, hi) => {
    const rets = rows.map((r) => r.forward[hi].ret).filter((v) => v !== null);
    if (rets.length === 0) return `${label} —`;
    const wins = rets.filter((v) => v > 0).length;
    return `${label} ${((wins / rets.length) * 100).toFixed(0)}%（${wins}/${rets.length}）`;
  });
  console.log(`勝率（該時點收盤價 > 進場價）：${winRates.join(' | ')}`);

  const withBreak = complete.filter((r) => r.brokeVLow !== null);
  const broke = withBreak.filter((r) => r.brokeVLow).length;
  console.log(
    `24小時內跌破 V 型低點：${broke}/${withBreak.length} 筆` +
      `（跌破 = 反轉失敗，訊號其實是下跌中繼的反彈）`
  );
  console.log(
    `24小時內最大不利波動 MAE 中位 ${pctStr(median(complete.map((r) => r.mae)))} ／ ` +
      `最大有利波動 MFE 中位 ${pctStr(median(complete.map((r) => r.mfe)))}`
  );
}

async function main() {
  const [, , startArg, endArg] = process.argv;
  if (!startArg) {
    console.error('用法：node src/analyze.js <起始日 YYYY-MM-DD> [結束日 YYYY-MM-DD，省略 = 到現在]');
    console.error('範例：node src/analyze.js 2026-07-10');
    process.exit(1);
  }

  const startMs = taipeiMidnightMs(startArg);
  const endMsExclusive = endArg ? taipeiMidnightMs(endArg) : Date.now();
  if (endMsExclusive <= startMs) {
    console.error('[analyze] 結束時間必須晚於起始日期。');
    process.exit(1);
  }

  const warmupStartMs = startMs - WARMUP_DAYS * 24 * 60 * 60 * 1000;
  console.log(
    `[analyze] 抓取 ${SYMBOL} ${INTERVAL} K 線：` +
      `${formatTaipeiTime(warmupStartMs)}（含暖機） ~ ${formatTaipeiTime(Date.now())}`
  );

  // 結束時間之後多抓 24 小時，讓區間尾端的訊號也有後續資料可以評估
  const fetchEnd = Math.min(Date.now(), endMsExclusive + EXCURSION_BARS * BAR_MINUTES * 60 * 1000);
  const candles = await fetchKlines({
    symbol: SYMBOL,
    interval: INTERVAL,
    startTime: warmupStartMs,
    endTime: fetchEnd,
  });
  const now = Date.now();
  const closedCandles = candles.filter((c) => c.closeTime < now);
  console.log(`[analyze] 共取得 ${closedCandles.length} 根已收盤 K 棒（含暖機與後續觀察）。`);

  const { rows, checkedCount } = analyzeSignals(closedCandles, startMs, endMsExclusive);
  printReport(rows, checkedCount);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[analyze] 執行失敗：', err.message);
    process.exit(1);
  });
}

module.exports = { analyzeSignals, printReport, median };
