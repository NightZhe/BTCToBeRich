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
| dropThreshold | 1% | 高到低跌幅門檻 |
| maFast / maSlow | 7 / 25 | 均線週期 |
| macdFast / macdSlow / macdSignal | 12 / 26 / 9 | MACD 標準參數，未調整 |
| macdFreshBars | 3 根 | MACD 翻正必須發生在最近幾根內才算「新鮮」 |
| minCandles | 60 根 | 資料不足這個數量時不判斷（給 EMA 足夠暖機） |
| 冷卻時間 | 60 分鐘 | 見 `src/monitor.js` / `src/backtest.js` 的 `COOLDOWN_MS` |

以上參數是照使用者標注的案例（2026-07-06 21:30 台北時間附近的 V 型底）用
`node src/backtest.js 2026-07-04 2026-07-08` 反覆調整並驗證過的，沒有再微調的必要
就不要動；如果之後要調，記得重新跑一次回測確認「抓得到標注案例」且「4 天訊號數
不會暴增」。

**回測驗證結果**（2026-07-04 ~ 2026-07-08，共檢查 1152 根已收盤 K）：
- 2026/7/6 21:54:59 觸發訊號，價格 61907.65，跌幅 2.60%（62950 → 61307 附近），
  這就是使用者標注的那個 V 型底（實際低點約在 21:34–21:39，訊號在確認站穩後的
  21:54:59 觸發，屬合理延遲）。
- 4 天內總共只觸發 **3 次**訊號（平均每天 0.75 次），不會太吵。另外兩筆是
  2026/7/6 09:04:59（跌幅 1.01%，剛過門檻）與 2026/7/7 22:49:59。

## 檔案結構

```
src/indicators.js   SMA / EMA / MACD 純數學計算
src/binance.js      幣安公開 API 封裝（抓即時 K 線 + 分頁抓歷史區間）
src/detector.js      V 型反轉三條件判斷
src/notify.js        Telegram 推播（沒設環境變數就 fallback 成 console）
src/monitor.js       主迴圈：每 60 秒抓一次資料、判斷、管理冷卻、通知
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

## 已知限制

- 監控迴圈是單一 Node process 常駐執行，沒有做成系統服務/背景常駐（沒有用
  pm2、systemd 等），電腦睡眠或程式被關掉就會停止監控。要長期運行建議之後
  部署到伺服器並用 pm2 或類似工具保活（本次任務範圍不含此項）。
- 冷卻邏輯以「K 棒收盤時間」而非「程式執行的牆上時鐘時間」為準，這樣回測與
  實盤的行為才會一致。
- EMA 採用「前 N 筆用 SMA 當種子值，之後遞迴計算」的標準做法，抓取的資料愈多
  （`monitor.js`/`backtest.js` 皆抓 100+ 根）愈準；只給極少筆資料時
  `detector.js` 會回傳 `insufficientData: true` 而不做判斷。
