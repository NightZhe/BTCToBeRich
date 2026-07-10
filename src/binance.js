'use strict';

/**
 * 幣安公開行情 API 的最小封裝，只用 Node 18+ 內建 fetch，不裝任何套件。
 */

// 端點依序容錯：主站在部分地區（如美國機房 IP）會回 451 拒絕，
// data-api.binance.vision 是幣安官方的公開行情資料端點，作為備援。
// 可用 BINANCE_BASE_URL 環境變數指定優先端點。
const BASE_URLS = [
  ...(process.env.BINANCE_BASE_URL ? [process.env.BINANCE_BASE_URL] : []),
  'https://api.binance.com',
  'https://data-api.binance.vision',
];
const KLINE_LIMIT = 1000; // 幣安單次請求上限

let activeBaseUrl = null; // 記住上次成功的端點，之後優先用它

/** 對每個端點依序嘗試同一個 API 路徑，全部失敗才丟錯。 */
async function fetchJson(pathAndQuery) {
  const hosts = activeBaseUrl
    ? [activeBaseUrl, ...BASE_URLS.filter((h) => h !== activeBaseUrl)]
    : BASE_URLS;
  let lastErr;
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}${pathAndQuery}`);
      if (!res.ok) {
        lastErr = new Error(`Binance API 錯誤 ${res.status}（${host}）: ${await res.text()}`);
        continue;
      }
      activeBaseUrl = host;
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

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
    const data = await fetchJson(
      `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${n}`
    );
    return data.map(toCandle);
  }

  // 指定時間範圍：分頁抓到底（回測用）
  const all = [];
  let cursor = startTime;
  const finalEndTime = endTime !== undefined ? endTime : Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await fetchJson(
      `/api/v3/klines?symbol=${symbol}&interval=${interval}` +
        `&startTime=${cursor}&endTime=${finalEndTime}&limit=${KLINE_LIMIT}`
    );
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
