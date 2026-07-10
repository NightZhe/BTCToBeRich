'use strict';

/**
 * 純數學指標計算，不依賴任何第三方套件。
 * 所有函式吃「收盤價陣列」（由舊到新排序），回傳等長陣列，
 * 資料不足以計算的位置填 null，方便呼叫端用同一個 index 對齊。
 */

/** 簡單移動平均 SMA(period) */
function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * 指數移動平均 EMA(period)。
 * 種子值使用前 period 筆的 SMA，之後照標準遞迴公式計算，
 * 這是最常見的 EMA 實作方式（TradingView / 多數交易所皆同）。
 */
function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prevEma = null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sum += values[i];
      continue;
    }
    if (i === period - 1) {
      sum += values[i];
      prevEma = sum / period;
      out[i] = prevEma;
      continue;
    }
    prevEma = values[i] * k + prevEma * (1 - k);
    out[i] = prevEma;
  }
  return out;
}

/**
 * MACD：DIF = EMA12 - EMA26；DEA = EMA9(DIF)；柱狀圖 hist = DIF - DEA。
 * 回傳 { dif, dea, hist }，皆為等長陣列，資料不足處為 null。
 */
function macd(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const dif = values.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null
  );

  // DEA 是「DIF 數列」的 EMA9，但 DIF 前面有 null，要從第一個非 null 值開始算
  const firstValidIdx = dif.findIndex((v) => v !== null);
  const dea = new Array(values.length).fill(null);
  if (firstValidIdx !== -1) {
    const difTail = dif.slice(firstValidIdx);
    const deaTail = ema(difTail, signal);
    for (let i = 0; i < deaTail.length; i++) {
      dea[firstValidIdx + i] = deaTail[i];
    }
  }

  const hist = values.map((_, i) =>
    dif[i] !== null && dea[i] !== null ? dif[i] - dea[i] : null
  );

  return { dif, dea, hist };
}

module.exports = { sma, ema, macd };
