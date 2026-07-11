'use strict';

/**
 * 內建網頁儀表板，只用 Node 內建 http 模組，不裝任何套件。
 * 提供：
 *   GET /            深色系 HTML 儀表板（手機可讀，每 60 秒自動 reload）
 *   GET /api/history 目前歷程的 JSON（checks + signals）
 *   GET /healthz     200 ok，給 Railway 健康檢查用
 *
 * 這個檔案只負責「顯示」歷程資料，不碰 detector 的訊號邏輯、不碰 notify 的通知行為。
 */

const http = require('http');
const { getHistory } = require('./history');
const { formatTaipeiTime } = require('./notify');
const { DEFAULT_CONFIG } = require('./detector');

const DROP_THRESHOLD_LABEL = `${(DEFAULT_CONFIG.dropThreshold * 100).toFixed(1)}%`;

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function condMark(pass) {
  return pass ? '✓' : '✗';
}

function condClass(pass) {
  return pass ? 'ok' : 'no';
}

/** 狀態卡 HTML（最新價格與三條件），/partial 也會用。 */
function buildStatusCardHtml(latest, lastHeartbeatAt) {
  if (!latest) {
    return `<div class="card"><p class="muted">尚無檢查紀錄，稍後重新整理再看</p></div>`;
  }
  const heartbeatLine = lastHeartbeatAt
    ? `<div class="muted">監控心跳：${esc(formatTaipeiTime(lastHeartbeatAt))}（每 60 秒檢查一次）</div>`
    : '';
  return `<div class="card">
        <div class="price">${latest.price.toFixed(2)} <span class="unit">USDT</span></div>
        <div class="muted">最新 5 分 K 收盤：${esc(formatTaipeiTime(latest.time))}（每 5 分鐘更新一根，台北時間）</div>
        ${heartbeatLine}
        <div class="conditions">
          <div class="cond ${condClass(latest.cond1.pass)}">
            <span class="mark">${condMark(latest.cond1.pass)}</span> 前置急跌
            <span class="val">跌幅 ${(latest.cond1.dropPct * 100).toFixed(2)}%（門檻 ${DROP_THRESHOLD_LABEL}）</span>
          </div>
          <div class="cond ${condClass(latest.cond2.pass)}">
            <span class="mark">${condMark(latest.cond2.pass)}</span> 站上均線
            <span class="val">MA7 ${latest.cond2.ma7.toFixed(1)} / MA25 ${latest.cond2.ma25.toFixed(1)}</span>
          </div>
          <div class="cond ${condClass(latest.cond3.pass)}">
            <span class="mark">${condMark(latest.cond3.pass)}</span> MACD翻正
            <span class="val">柱狀圖 ${latest.cond3.hist.toFixed(4)}</span>
          </div>
        </div>
      </div>`;
}

/** 訊號清單＋檢查紀錄區塊 HTML，/partial 也會用。 */
function buildListsHtml(signals, checks) {
  return `<h2>過去 30 天訊號</h2>
  <div class="table-wrap">${buildSignalsHtml(signals)}</div>

  <h2>最近檢查紀錄</h2>
  <div class="table-wrap">${buildChecksTableHtml(checks)}</div>`;
}

function buildSignalsHtml(signals) {
  if (!signals || signals.length === 0) {
    return '<p class="muted">過去 30 天無訊號</p>';
  }
  const rows = signals
    .slice()
    .reverse()
    .map(
      (s) => `<tr>
        <td>${esc(formatTaipeiTime(s.time))}</td>
        <td>${s.price.toFixed(2)}</td>
        <td>${(s.cond1.dropPct * 100).toFixed(2)}%</td>
        <td>${s.cond2.ma7.toFixed(1)} / ${s.cond2.ma25.toFixed(1)}</td>
        <td>${s.cond3.hist.toFixed(4)}</td>
      </tr>`
    )
    .join('\n');
  return `<table>
    <thead><tr><th>時間</th><th>價格</th><th>跌幅</th><th>MA7/MA25</th><th>MACD柱</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildChecksTableHtml(checks) {
  if (!checks || checks.length === 0) {
    return '<p class="muted">尚無檢查紀錄</p>';
  }
  const rows = checks
    .slice(-30)
    .reverse()
    .map(
      (c) => `<tr>
        <td>${esc(formatTaipeiTime(c.time))}</td>
        <td>${c.price.toFixed(2)}</td>
        <td class="${condClass(c.cond1.pass)}">${condMark(c.cond1.pass)} ${(c.cond1.dropPct * 100).toFixed(2)}%</td>
        <td class="${condClass(c.cond2.pass)}">${condMark(c.cond2.pass)}</td>
        <td class="${condClass(c.cond3.pass)}">${condMark(c.cond3.pass)}</td>
      </tr>`
    )
    .join('\n');
  return `<table>
    <thead><tr><th>時間</th><th>價格</th><th>急跌（門檻 ${DROP_THRESHOLD_LABEL}）</th><th>站上均線</th><th>MACD翻正</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildHtml() {
  const { checks, signals, lastHeartbeatAt } = getHistory();
  const latest = checks.length ? checks[checks.length - 1] : null;
  const statusCard = buildStatusCardHtml(latest, lastHeartbeatAt);

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BTC V 型底部反轉監控</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px; background: #0f172a; color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  h1 { font-size: 1.1rem; margin: 0 0 12px; color: #94a3b8; }
  h2 { font-size: 1rem; margin: 24px 0 8px; color: #94a3b8; }
  .card {
    background: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 16px;
  }
  .price { font-size: 2rem; font-weight: 700; }
  .price .unit { font-size: 1rem; color: #94a3b8; font-weight: 400; }
  .muted { color: #94a3b8; font-size: 0.9rem; }
  .conditions { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
  .cond { font-size: 0.95rem; }
  .cond .mark { display: inline-block; width: 1.2em; font-weight: 700; }
  .cond .val { color: #94a3b8; margin-left: 6px; font-size: 0.85rem; }
  .ok .mark { color: #4ade80; }
  .no .mark { color: #f87171; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #334155; white-space: nowrap; }
  th { color: #94a3b8; font-weight: 500; }
  td.ok { color: #4ade80; }
  td.no { color: #f87171; }
  .tv-wrap { height: 460px; background: #1e293b; border-radius: 12px; overflow: hidden; }
  .table-wrap { overflow-x: auto; background: #1e293b; border-radius: 12px; padding: 8px 4px; }
  footer { margin-top: 24px; color: #64748b; font-size: 0.75rem; text-align: center; }
</style>
</head>
<body>
  <h1>BTC V 型底部反轉監控</h1>
  <div id="status">${statusCard}</div>

  <h2>即時 K 線（幣安 BTCUSDT・TradingView）</h2>
  <div class="tv-wrap">
    <div id="tvchart" style="height:100%"></div>
  </div>

  <div id="lists">${buildListsHtml(signals, checks)}</div>

  <footer>監控資料每 60 秒自動更新（圖表為 TradingView 即時串流）</footer>

  <script src="https://s3.tradingview.com/tv.js"></script>
  <script>
    new TradingView.widget({
      container_id: 'tvchart',
      autosize: true,
      symbol: 'BINANCE:BTCUSDT',
      interval: '5',
      timezone: 'Asia/Taipei',
      theme: 'dark',
      style: '1',
      locale: 'zh_TW',
      hide_top_toolbar: false,
      allow_symbol_change: false,
    });

    setInterval(async () => {
      try {
        const res = await fetch('/partial');
        if (!res.ok) return;
        const d = await res.json();
        document.getElementById('status').innerHTML = d.status;
        document.getElementById('lists').innerHTML = d.lists;
      } catch (e) { /* 網路暫時失敗就等下一輪 */ }
    }, 60000);
  </script>
</body>
</html>`;
}

function requestListener(req, res) {
  const url = req.url.split('?')[0];

  if (url === '/' && req.method === 'GET') {
    const html = buildHtml();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (url === '/partial' && req.method === 'GET') {
    const { checks, signals, lastHeartbeatAt } = getHistory();
    const latest = checks.length ? checks[checks.length - 1] : null;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: buildStatusCardHtml(latest, lastHeartbeatAt),
        lists: buildListsHtml(signals, checks),
      })
    );
    return;
  }

  if (url === '/api/history' && req.method === 'GET') {
    const body = JSON.stringify(getHistory());
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
    return;
  }

  if (url === '/healthz' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

/** 啟動 http server，回傳 server 實例（給呼叫端決定何時關閉，測試會用到）。 */
function startServer(port = process.env.PORT || 3000) {
  const server = http.createServer(requestListener);
  server.listen(port, () => {
    console.log(`[server] 網頁儀表板已啟動：http://localhost:${port}/`);
  });
  return server;
}

module.exports = { startServer, buildHtml, requestListener };

if (require.main === module) {
  startServer();
}
