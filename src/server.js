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

/** 用 checks 陣列（由舊到新）畫一個簡單的 inline SVG 折線圖。 */
function buildSvgChart(checks) {
  const W = 640;
  const H = 180;
  const PAD = 10;

  if (!checks || checks.length < 2) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart">
      <text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="chart-empty">資料收集中，稍後再看</text>
    </svg>`;
  }

  const times = checks.map((c) => c.time);
  const prices = checks.map((c) => c.price);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const spanT = maxT - minT || 1;
  const spanP = maxP - minP || 1;

  const points = checks
    .map((c) => {
      const x = PAD + ((c.time - minT) / spanT) * (W - 2 * PAD);
      const y = H - PAD - ((c.price - minP) / spanP) * (H - 2 * PAD);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart">
    <polyline points="${points}" fill="none" stroke="#4fd1c5" stroke-width="2" />
    <text x="${PAD}" y="${H - 2}" class="chart-label">${esc(formatTaipeiTime(minT))}</text>
    <text x="${W - PAD}" y="${H - 2}" text-anchor="end" class="chart-label">${esc(formatTaipeiTime(maxT))}</text>
    <text x="${PAD}" y="14" class="chart-label">${maxP.toFixed(0)}</text>
    <text x="${PAD}" y="${H - 14}" class="chart-label">${minP.toFixed(0)}</text>
  </svg>`;
}

function buildSignalsHtml(signals) {
  if (!signals || signals.length === 0) {
    return '<p class="muted">過去 24 小時無訊號</p>';
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
        <td class="${condClass(c.cond1.pass)}">${condMark(c.cond1.pass)}</td>
        <td class="${condClass(c.cond2.pass)}">${condMark(c.cond2.pass)}</td>
        <td class="${condClass(c.cond3.pass)}">${condMark(c.cond3.pass)}</td>
      </tr>`
    )
    .join('\n');
  return `<table>
    <thead><tr><th>時間</th><th>價格</th><th>急跌</th><th>站上均線</th><th>MACD翻正</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildHtml() {
  const { checks, signals } = getHistory();
  const latest = checks.length ? checks[checks.length - 1] : null;

  const statusCard = latest
    ? `<div class="card">
        <div class="price">${latest.price.toFixed(2)} <span class="unit">USDT</span></div>
        <div class="muted">最後檢查：${esc(formatTaipeiTime(latest.time))}（台北時間）</div>
        <div class="conditions">
          <div class="cond ${condClass(latest.cond1.pass)}">
            <span class="mark">${condMark(latest.cond1.pass)}</span> 前置急跌
            <span class="val">跌幅 ${(latest.cond1.dropPct * 100).toFixed(2)}%</span>
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
      </div>`
    : `<div class="card"><p class="muted">尚無檢查紀錄，稍後重新整理再看</p></div>`;

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="60" />
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
  .chart { width: 100%; height: auto; background: #1e293b; border-radius: 12px; }
  .chart-label { fill: #94a3b8; font-size: 10px; }
  .chart-empty { fill: #94a3b8; font-size: 12px; }
  .table-wrap { overflow-x: auto; background: #1e293b; border-radius: 12px; padding: 8px 4px; }
  footer { margin-top: 24px; color: #64748b; font-size: 0.75rem; text-align: center; }
</style>
</head>
<body>
  <h1>BTC V 型底部反轉監控</h1>
  ${statusCard}

  <h2>過去 24 小時訊號</h2>
  <div class="table-wrap">${buildSignalsHtml(signals)}</div>

  <h2>24 小時價格走勢</h2>
  ${buildSvgChart(checks)}

  <h2>最近檢查紀錄</h2>
  <div class="table-wrap">${buildChecksTableHtml(checks)}</div>

  <footer>每 60 秒自動重新整理</footer>
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
