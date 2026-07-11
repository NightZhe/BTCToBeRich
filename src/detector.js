'use strict';

const { sma, macd } = require('./indicators');

/**
 * V 型底部反轉訊號的預設參數。
 * 全部以「已收盤」的 5 分 K 計算，呼叫端要先把還沒收盤的最後一根濾掉。
 */
const DEFAULT_CONFIG = {
  dropLookbackHigh: 24, // 找前置高點的視窗（24 根 = 2 小時）
  dropLookbackLow: 12, // 找急跌後低點的視窗（12 根 = 1 小時）
  dropThreshold: 0.006, // 高到低跌幅門檻 0.6%（2026-07-11 依使用者選擇由 1% 調降，為抓淺 V）
  maFast: 7, // MA7
  maSlow: 25, // MA25
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  macdFreshBars: 3, // MACD 柱狀圖翻正必須發生在最近 3 根 K 內
  minCandles: 60, // 至少要有這麼多根 K 才計算（給 EMA 足夠暖機）
};

/**
 * 在陣列的最後 window 根裡找最大值/最小值，回傳數值與「絕對 index」。
 */
function findExtreme(values, window, mode) {
  const start = Math.max(0, values.length - window);
  let bestIdx = start;
  let bestVal = values[start];
  for (let i = start; i < values.length; i++) {
    if (mode === 'max' ? values[i] > bestVal : values[i] < bestVal) {
      bestVal = values[i];
      bestIdx = i;
    }
  }
  return { value: bestVal, index: bestIdx };
}

/**
 * 對一段已收盤的 K 線陣列（由舊到新）跑 V 型反轉偵測。
 * @param {Array} candles 至少要有 config.minCandles 根，皆為已收盤 K 棒
 * @param {object} [userConfig] 覆蓋 DEFAULT_CONFIG 的參數
 * @returns {{triggered: boolean, reasons: object, price: number, closeTime: number, insufficientData?: boolean}}
 */
function detect(candles, userConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...userConfig };

  if (!candles || candles.length < config.minCandles) {
    return {
      triggered: false,
      insufficientData: true,
      reasons: {},
      price: candles && candles.length ? candles[candles.length - 1].close : null,
      closeTime: candles && candles.length ? candles[candles.length - 1].closeTime : null,
    };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const latestIdx = candles.length - 1;

  // 條件 1：前置急跌
  const highExtreme = findExtreme(highs, config.dropLookbackHigh, 'max');
  const lowExtreme = findExtreme(lows, config.dropLookbackLow, 'min');
  const dropPct = (highExtreme.value - lowExtreme.value) / highExtreme.value;
  const cond1 =
    lowExtreme.index > highExtreme.index && dropPct >= config.dropThreshold;

  // 條件 2：重新站上均線
  const ma7 = sma(closes, config.maFast);
  const ma25 = sma(closes, config.maSlow);
  const latestClose = closes[latestIdx];
  const latestMa7 = ma7[latestIdx];
  const latestMa25 = ma25[latestIdx];
  const cond2 =
    latestMa7 !== null &&
    latestMa25 !== null &&
    latestClose > latestMa7 &&
    latestClose > latestMa25;

  // 條件 3：MACD 柱狀圖新鮮翻正
  const { hist } = macd(closes, config.macdFast, config.macdSlow, config.macdSignal);
  let freshCross = false;
  let crossIdx = null;
  for (
    let i = Math.max(1, latestIdx - config.macdFreshBars + 1);
    i <= latestIdx;
    i++
  ) {
    if (hist[i - 1] !== null && hist[i] !== null && hist[i - 1] <= 0 && hist[i] > 0) {
      freshCross = true;
      crossIdx = i;
    }
  }
  const latestHist = hist[latestIdx];
  const cond3 = freshCross && latestHist !== null && latestHist > 0;

  const triggered = cond1 && cond2 && cond3;

  return {
    triggered,
    price: latestClose,
    closeTime: candles[latestIdx].closeTime,
    reasons: {
      cond1: {
        pass: cond1,
        highValue: highExtreme.value,
        highIndex: highExtreme.index,
        lowValue: lowExtreme.value,
        lowIndex: lowExtreme.index,
        dropPct: dropPct,
      },
      cond2: {
        pass: cond2,
        close: latestClose,
        ma7: latestMa7,
        ma25: latestMa25,
      },
      cond3: {
        pass: cond3,
        hist: latestHist,
        crossIndex: crossIdx,
      },
    },
  };
}

module.exports = { detect, DEFAULT_CONFIG };
