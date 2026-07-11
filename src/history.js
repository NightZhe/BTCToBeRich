'use strict';

/**
 * 純記憶體歷程儲存，給網頁儀表板用。
 * 只保留最近 24 小時的檢查紀錄與訊號紀錄；程式重啟即歸零（不做檔案持久化）。
 * 不影響 detector/notify 的判斷與通知邏輯，純粹是「記錄」用途。
 */

const CHECK_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 檢查紀錄保留 24 小時
const SIGNAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 訊號保留 30 天（重啟由回補重建）

let checks = [];
let signals = [];
let lastHeartbeatAt = null; // 監控迴圈最後一次成功檢查的牆上時鐘時間

/** 每次檢查成功時呼叫，讓儀表板能顯示「監控活著」。 */
function setHeartbeat(t = Date.now()) {
  lastHeartbeatAt = t;
}

/**
 * 把 detector.js 回傳的 result 轉成給儀表板用的精簡格式。
 * result 必須是「非 insufficientData」的完整結果（含 reasons）。
 */
function toEntry(result) {
  const { cond1, cond2, cond3 } = result.reasons;
  return {
    time: result.closeTime,
    price: result.price,
    cond1: { pass: cond1.pass, dropPct: cond1.dropPct },
    cond2: { pass: cond2.pass, ma7: cond2.ma7, ma25: cond2.ma25 },
    cond3: { pass: cond3.pass, hist: cond3.hist },
  };
}

/** 剪掉 now - maxAge 之前的紀錄。獨立成函式方便單獨測試。 */
function pruneOld(list, now = Date.now(), maxAge = CHECK_MAX_AGE_MS) {
  const cutoff = now - maxAge;
  let start = 0;
  while (start < list.length && list[start].time < cutoff) start++;
  if (start > 0) list.splice(0, start);
  return list;
}

function addCheck(result) {
  const entry = toEntry(result);
  const last = checks[checks.length - 1];
  // 每 60 秒檢查一次但 5 分 K 才換一根：同一根 K 覆蓋最後一筆，不重複累積
  if (last && last.time === entry.time) {
    checks[checks.length - 1] = entry;
  } else {
    checks.push(entry);
  }
  pruneOld(checks, Date.now(), CHECK_MAX_AGE_MS);
}

function addSignal(result) {
  signals.push(toEntry(result));
  pruneOld(signals, Date.now(), SIGNAL_MAX_AGE_MS);
}

/** 啟動回補用：用重算出來的歷史訊號整批取代目前清單（由舊到新）。 */
function seedSignals(results) {
  signals = results.map(toEntry);
  pruneOld(signals, Date.now(), SIGNAL_MAX_AGE_MS);
}

function getHistory() {
  pruneOld(checks, Date.now(), CHECK_MAX_AGE_MS);
  pruneOld(signals, Date.now(), SIGNAL_MAX_AGE_MS);
  return { checks, signals, lastHeartbeatAt };
}

module.exports = {
  addCheck,
  addSignal,
  seedSignals,
  getHistory,
  setHeartbeat,
  pruneOld,
  toEntry,
  CHECK_MAX_AGE_MS,
  SIGNAL_MAX_AGE_MS,
};
