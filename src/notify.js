'use strict';

/**
 * Telegram 推播。讀環境變數 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID。
 * 缺少環境變數或 API 呼叫失敗都不能讓程式 crash——最多印警告，改用 console 輸出。
 */

let warnedOnce = false;

function formatTaipeiTime(epochMs) {
  return new Date(epochMs).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour12: false,
  });
}

/**
 * 組出訊號通知文字。
 */
function buildMessage({ closeTime, price, reasons }) {
  const timeStr = formatTaipeiTime(closeTime);
  const { cond1, cond2, cond3 } = reasons;
  return (
    `🔔 BTCUSDT V 型底部反轉訊號\n` +
    `時間（台北）：${timeStr}\n` +
    `目前價格：${price}\n` +
    `— 條件1 前置急跌 —\n` +
    `  高點 ${cond1.highValue.toFixed(2)} → 低點 ${cond1.lowValue.toFixed(2)}` +
    `（跌幅 ${(cond1.dropPct * 100).toFixed(2)}%）\n` +
    `— 條件2 站上均線 —\n` +
    `  收盤 ${cond2.close.toFixed(2)} > MA7 ${cond2.ma7.toFixed(2)}, MA25 ${cond2.ma25.toFixed(2)}\n` +
    `— 條件3 MACD 翻正 —\n` +
    `  柱狀圖 ${cond3.hist.toFixed(4)}（近3根內新鮮翻正）`
  );
}

/**
 * 送出 Telegram 訊息。任何錯誤都被吞掉並印出來，不會往外拋。
 * @param {string} text
 */
async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    if (!warnedOnce) {
      console.warn(
        '[notify] 未設定 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID，改用 console 輸出通知（不會真的推播）。'
      );
      warnedOnce = true;
    }
    console.log('[notify:fallback]\n' + text);
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[notify] Telegram API 回應失敗 (${res.status}): ${body}`);
      return;
    }
    console.log('[notify] Telegram 通知已送出。');
  } catch (err) {
    console.error('[notify] Telegram 送出失敗（已忽略，程式繼續執行）：', err.message);
  }
}

/**
 * 對外的主要入口：給觸發結果，組訊息並送出。
 */
async function notifySignal(detectResult) {
  const text = buildMessage(detectResult);
  await sendTelegramMessage(text);
}

module.exports = { sendTelegramMessage, notifySignal, buildMessage, formatTaipeiTime };
