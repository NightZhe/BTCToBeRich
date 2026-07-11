# BTC V 型底部反轉監控

監控幣安 BTCUSDT 5 分 K，偵測「V 型底部反轉」訊號，觸發時透過 Telegram Bot 推播。
不依賴任何第三方套件（`package.json` 的 `dependencies` 是空的），只用 Node 18+
內建的 `fetch`，指標（SMA/EMA/MACD）全部自己算。

## 訊號定義（三條件同時成立才觸發）

全部用「已收盤」的 5 分 K 計算，程式會自動濾掉還在走的那一根。

1. **前置急跌**：最近 24 根 K（2 小時）內的最高價，到最近 12 根 K（1 小時）內的
   最低價，跌幅 ≥ 1%，且最低價的時間點在最高價之後。
2. **重新站上均線**：最新收盤價同時 > MA7 且 > MA25（皆為收盤價簡單移動平均）。
3. **MACD 柱狀圖新鮮翻正**：MACD 柱狀圖（DIF − DEA，DIF = EMA12 − EMA26，
   DEA = DIF 的 EMA9）在最近 3 根 K 內由 ≤0 翻為 >0，且目前仍是正值
   （避免翻正很久之後還一直觸發）。

觸發後 **60 分鐘冷卻**，冷卻期內即使條件持續成立也不會重複通知。

### 最終參數（`src/detector.js` 的 `DEFAULT_CONFIG`）

| 參數 | 值 | 說明 |
|------|-----|------|
| dropLookbackHigh | 24 根（2 小時） | 找前置高點的視窗 |
| dropLookbackLow | 12 根（1 小時） | 找急跌後低點的視窗 |
| dropThreshold | 0.6% | 高到低跌幅門檻（2026-07-11 由 1% 調降，為抓淺 V 反轉） |
| maFast / maSlow | 7 / 25 | 均線週期 |
| macdFast / macdSlow / macdSignal | 12 / 26 / 9 | MACD 標準參數，未調整 |
| macdFreshBars | 3 根 | MACD 翻正必須發生在最近幾根內才算「新鮮」 |
| minCandles | 60 根 | 資料不足這個數量時不判斷（給 EMA 足夠暖機） |
| 冷卻時間 | 60 分鐘 | 見 `src/monitor.js` / `src/backtest.js` 的 `COOLDOWN_MS` |

以上參數是照使用者標注的案例（2026-07-06 21:30 台北時間附近的 V 型底）用
`node src/backtest.js 2026-07-04 2026-07-08` 反覆調整並驗證過的，沒有再微調的必要
就不要動；如果之後要調，記得重新跑一次回測確認「抓得到標注案例」且「4 天訊號數
不會暴增」。

**回測驗證結果**（2026-07-04 ~ 2026-07-11，門檻 0.6%）：
- 2026/7/6 21:54:59 觸發（價格 61907.65，跌幅 2.60%）——使用者標注的深 V 案例。
- 2026/7/11 04:49:59 觸發（價格 63877.59，跌幅 0.66%）——使用者要求要抓的淺 V 案例
  （1% 門檻時代抓不到，因此 2026-07-11 調降門檻）。
- 7 天多共 **22 次**訊號（平均約 2.9 次/天）。這是使用者知情選擇的頻率：
  寧可多收通知自己人工篩，也不要漏掉淺 V。若之後覺得太吵，門檻調回
  0.8%（約 1.1 次/天）或 1%（約 0.7 次/天），改 `src/detector.js` 的
  `dropThreshold` 後重跑回測驗證。

## 檔案結構

```
src/indicators.js   SMA / EMA / MACD 純數學計算
src/binance.js      幣安公開 API 封裝（抓即時 K 線 + 分頁抓歷史區間）
src/detector.js      V 型反轉三條件判斷
src/notify.js        Telegram 推播（沒設環境變數就 fallback 成 console）
src/history.js       網頁儀表板用的記憶體歷程儲存（24 小時自動剪裁）
src/server.js        內建 http server，提供 /、/api/history、/healthz
src/monitor.js       主迴圈：每 60 秒抓一次資料、判斷、管理冷卻、通知、記歷程
src/backtest.js      回測工具：模擬歷史區間逐根檢查
```

## 本機安裝與執行

不需要 `npm install`（沒有任何依賴）。需要 Node.js 18 以上（建議 20+，本機用
25.9.0 測試過）。

### 1. 設定 Telegram（要收到手機通知才需要，沒設也能跑，只是改印在終端機）

**a. 用 @BotFather 建立 Bot 拿 token**

1. Telegram 搜尋 `@BotFather`，開始對話。
2. 傳送 `/newbot`，依提示輸入 bot 名稱與 username（username 必須以 `bot` 結尾）。
3. 建立成功後 BotFather 會回傳一串 token，長得像
   `123456789:AAExampleTokenxxxxxxxxxxxxxxxxxxxxx`，這就是 `TELEGRAM_BOT_TOKEN`。

**b. 拿 chat_id**

1. 先傳一則訊息給你剛建立的 bot（隨便打字，例如「hi」），這一步一定要做，
   不然下面的 API 查不到任何紀錄。
2. 在終端機執行（把 `<TOKEN>` 換成上面拿到的 token）：

   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"
   ```

3. 回傳的 JSON 裡找 `"chat":{"id":123456789,...}`，那個數字就是 `TELEGRAM_CHAT_ID`。

**c. 設定環境變數**

複製範例檔並填入剛才拿到的值：

```bash
cp .env.example .env
```

編輯 `.env`，把 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_CHAT_ID` 換成實際的值。

### 2. 啟動即時監控

Node 20+ 可以直接用 `--env-file` 載入 `.env`，不用額外裝 dotenv：

```bash
node --env-file=.env src/monitor.js
```

或者用 `npm start`（一樣要先讓環境變數生效，例如用 `export` 或上面的 `--env-file`）：

```bash
npm start
```

如果不想設定 Telegram，直接跑也可以，程式會印出警告並改用 console 輸出通知內容：

```bash
node src/monitor.js
```

程式會：
- 啟動時印一行狀態（目前價格、各指標值）。
- 之後每 60 秒印一行心跳（收盤價、三條件的通過與否與數值）。
- 訊號觸發且不在冷卻期內時，送出 Telegram 通知（或 console fallback）。
- `Ctrl+C` 可安全停止。

### 3. 回測

```bash
node src/backtest.js 2026-07-04 2026-07-08
```

參數為起始日與結束日（皆為 `YYYY-MM-DD`，視為台北時間），**結束日當天不包含在
內**（例如上例代表 07-04、07-05、07-06、07-07 共 4 天）。程式會自動多抓
結束日之前 3 天的暖機資料算指標，不會把暖機期間當成檢查點。

輸出範例：

```
[signal 2] 2026/7/6 21:54:59 價格=61907.65 跌幅=2.60% MA7=61658.1 MA25=61879.0 MACD柱=55.3024

[backtest] 總訊號數：3
```

## 網頁儀表板

`src/monitor.js` 啟動時會同時起一個 Node 內建 http server（不裝任何套件），
提供手機/電腦瀏覽器看的儀表板，方便確認「監控有沒有在動、最近檢查了什麼、
觸發過什麼訊號」。歷程存在記憶體：檢查紀錄保留 24 小時（重啟歸零重新累積）；
訊號保留 30 天——訊號由 K 線數據決定、可重算，所以啟動時會自動抓過去 30 天
K 線回補歷史訊號清單（只填清單不發通知），重啟也不會丟。

- `GET /`：深色系 HTML 頁面，內容包含最新收盤價、最後檢查時間、三條件目前的
  ✓/✗ 與數值、TradingView 嵌入式即時 K 線圖（BINANCE:BTCUSDT，5 分線，台北時區，
  圖表本身即時串流）、過去 30 天觸發過的訊號清單、最近 30 筆檢查紀錄表格。
  監控資料區塊每 60 秒用 `/partial` 局部更新，不整頁重載（避免重置圖表）。
- `GET /partial`：狀態卡與清單區塊的 HTML 片段 JSON，供前端局部更新用。
- `GET /api/history`：目前歷程的 JSON（`{ checks: [...], signals: [...] }`），
  給以後要擴充用。
- `GET /healthz`：回 200，給部署平台的健康檢查用。

Port 讀環境變數 `PORT`，沒設定時本機預設 `3000`：

```bash
PORT=3000 node src/monitor.js
```

啟動後開瀏覽器看 `http://localhost:3000/`。

## 部署到 Railway

不需要 Dockerfile，Railway 會自動偵測這是 Node 專案並執行 `npm start`
（= `node src/monitor.js`）。部署前注意：

1. **環境變數**：在 Railway 專案的 Variables 設定：
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   兩個都設定才會真的推播；沒設定程式不會 crash，只會 fallback 印到 log（見上方
   「設定 Telegram」章節如何取得這兩個值）。
2. **PORT**：Railway 會自動注入 `PORT` 環境變數，`src/server.js` 已經讀
   `process.env.PORT`，不用手動設定。
3. **不要設定 `.env` 檔**：Railway 上用它的環境變數介面設定，不要把 `.env`
   commit 上去（`.gitignore` 已排除）。
4. 部署後打開 Railway 配的網址即可看到儀表板；`/healthz` 可以拿去設健康檢查。

## 已知限制

- 監控迴圈是單一 Node process 常駐執行，沒有做成系統服務/背景常駐（沒有用
  pm2、systemd 等），電腦睡眠或程式被關掉就會停止監控。要長期運行建議之後
  部署到伺服器並用 pm2 或類似工具保活（本次任務範圍不含此項）。
- 冷卻邏輯以「K 棒收盤時間」而非「程式執行的牆上時鐘時間」為準，這樣回測與
  實盤的行為才會一致。
- EMA 採用「前 N 筆用 SMA 當種子值，之後遞迴計算」的標準做法，抓取的資料愈多
  （`monitor.js`/`backtest.js` 皆抓 100+ 根）愈準；只給極少筆資料時
  `detector.js` 會回傳 `insufficientData: true` 而不做判斷。
