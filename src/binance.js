'use strict';

/**
 * 幣安公開行情 API 的最小封裝，只用 Node 18+ 內建 fetch，不裝任何套件。
 */

const BASE_URL = 'https://api.binance.com';
const KLINE_LIMIT = 1000; // 幣安單次請求上限

/**
 * 把幣安原始 kline 陣列轉成好用的物件。
 * 幣安欄位順序：
 * [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...]
 */
function toCandle(raw) {
  return {
    openTime: raw[0],
    open: parseFloat(raw[1]),
    high: parseFloat(raw[2]),
    low: parseFloat(raw[3]),
    close: parseFloat(raw[4]),
    volume: parseFloat(raw[5]),
    closeTime: raw[6],
  };
}

/**
 * 抓一段時間範圍內的 K 線，自動分頁（幣安單次最多回 1000 根）。
 * @param {object} opts
 * @param {string} opts.symbol 預設 BTCUSDT
 * @param {string} opts.interval 預設 5m
 * @param {number} [opts.startTime] ms epoch
 * @param {number} [opts.endTime] ms epoch
 * @param {number} [opts.limit] 沒指定 startTime/endTime 時的單次筆數
 * @returns {Promise<Array>} candle 物件陣列，由舊到新排序
 */
async function fetchKlines({
  symbol = 'BTCUSDT',
  interval = '5m',
  startTime,
  endTime,
  limit,
} = {}) {
  // 沒有指定時間範圍：單次抓最近 N 根（監控用）
  if (startTime === undefined && endTime === undefined) {
    const n = limit || 150;
    const url = `${BASE_URL}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${n}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Binance API 錯誤 ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return data.map(toCandle);
  }

  // 指定時間範圍：分頁抓到底（回測用）
  const all = [];
  let cursor = startTime;
  const finalEndTime = endTime !== undefined ? endTime : Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url =
      `${BASE_URL}/api/v3/klines?symbol=${symbol}&interval=${interval}` +
      `&startTime=${cursor}&endTime=${finalEndTime}&limit=${KLINE_LIMIT}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Binance API 錯誤 ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    if (data.length === 0) break;

    for (const raw of data) {
      all.push(toCandle(raw));
    }

    const lastCloseTime = data[data.length - 1][6];
    if (data.length < KLINE_LIMIT || lastCloseTime >= finalEndTime) break;
    cursor = lastCloseTime + 1;
  }

  return all;
}

module.exports = { fetchKlines, toCandle };
