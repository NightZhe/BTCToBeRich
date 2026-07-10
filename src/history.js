'use strict';

/**
 * 純記憶體歷程儲存，給網頁儀表板用。
 * 只保留最近 24 小時的檢查紀錄與訊號紀錄；程式重啟即歸零（不做檔案持久化）。
 * 不影響 detector/notify 的判斷與通知邏輯，純粹是「記錄」用途。
 */

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 小時

let checks = [];
let signals = [];

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

/** 剪掉 now - MAX_AGE_MS 之前的紀錄。獨立成函式方便單獨測試。 */
function pruneOld(list, now = Date.now()) {
  const cutoff = now - MAX_AGE_MS;
  let start = 0;
  while (start < list.length && list[start].time < cutoff) start++;
  if (start > 0) list.splice(0, start);
  return list;
}

function addCheck(result) {
  checks.push(toEntry(result));
  pruneOld(checks);
}

function addSignal(result) {
  signals.push(toEntry(result));
  pruneOld(signals);
}

function getHistory() {
  pruneOld(checks);
  pruneOld(signals);
  return { checks, signals };
}

module.exports = { addCheck, addSignal, getHistory, pruneOld, toEntry, MAX_AGE_MS };
