# 00 - Harness 快速診斷（2026-07-07，由 Fable 5 立制 session 產出）

本檔是後續所有規則檔的依據。三個問題按嚴重度排列，每個附證據與修法。
修法已在對應規則檔落地；本檔之後只作歷史參考，不需每 session 讀。

---

## 問題 1：最漏 token —— 主對話自己下場，且每個 session 都載入無關資料

**證據（2026-07-07 查證）：**
- 舊 CLAUDE.md 約 7.3KB，其中約 70% 是個人背景（運彩、風水、財務快照），與絕大多數
  coding session 無關，卻每個 session 都佔用 context。
- 環境中沒有任何派工規則。主對話直接掃 repo、讀大檔、貼長輸出，都是 token 直接燒在
  最貴的地方（主對話 context 會一直被後續每一步重複攜帶）。

**修法（已落地）：**
- CLAUDE.md 瘦身為路由檔（<80 行），個人資料移至 `profile.md` 按需讀取。→ 見 CLAUDE.md
- 派工門檻規則：預計讀 3 個以上檔案、探索式搜尋、網頁瀏覽、批次改檔，一律派
  subagent，主對話只收結論。→ 見 `10-dispatch.md` 第 1 節

## 問題 2：最容易失焦 —— 一次性指令被固化成全域規則，做完的事不收斂

**證據：**
- 舊 CLAUDE.md 第 5 節把 2026-04-17「AI 助理脈絡遷移」單次任務的指令（禁用第一/二
  人稱、輸出用文字區塊）寫成了看似全域的規則。弱模型照字面執行，會在日常回覆中
  產出怪異的去人稱文字。
- singapp 專案留有 4 個未合併的 agent worktree（2026-07-04 產生），其中兩個做了
  重複的事（都產出 heri-jun-zailai.json）。這代表：fan-out 派工時沒有去重設計，
  結束時沒有收斂與清理步驟——上一個任務其實沒有「完成」。
- 舊 CLAUDE.md 第 7 節手抄 skills 清單，與 harness 實際注入的清單重複且已漂移
  （實際環境另有 verify、run、code-review、deep-research 等未列入）。

**修法（已落地）：**
- 檔案分層：全域硬規則進 CLAUDE.md；情境規則進 rules/ 按需讀；一次性指令不入檔。
  一次性指令若必須保留，必須寫明適用範圍（見 `profile.md` 的做法）。
- 派工三件套強制包含驗收條件；多 agent fan-out 必須有收斂步驟（合併、去重、清
  worktree）才算完成。→ 見 `10-dispatch.md` 第 4、7 節、`20-judgment.md` 判準 2
- harness 會自動注入的資訊（skills、agent 清單）不手抄進 CLAUDE.md。→ 見 `40-maintenance.md`

## 問題 3：最容易出錯 —— 沒有驗證制度，而且權限全放行

**證據：**
- `~/.claude/settings.json` 設了 `"defaultMode": "bypassPermissions"` 加
  `"skipDangerousModePermissionPrompt": true`：所有工具呼叫自動放行，沒有人工
  門檻。deny list 只擋部分毀滅性指令（rm -rf、git push --force 等）。
  弱模型 + 全自動放行 = 一次錯誤判斷就直接執行。
- 沒有任何「驗證不自驗」機制：執行者宣稱完成即算完成（自驗偏誤）。worktree 殘留
  就是實例——沒有 fresh 驗收，就沒人發現任務沒收尾。
- 沒有教訓回寫機制：同樣的坑會一踩再踩。

**修法（已落地）：**
- 不可逆動作（刪除、對外發送、部署、覆蓋非自己建立的檔案）在制度層補回人工門檻：
  執行前必須先向使用者確認。權限系統不擋，規則要擋。→ 見 `20-judgment.md` 判準 3
- 驗收一律派 fresh-context subagent；檔案用 read-back、程式碼用實跑。→ 見 `10-dispatch.md` 第 7 節
- 踩坑後寫 `lessons.md`，累積到門檻就整併成規則。→ 見 `40-maintenance.md`

---

## 誠實標註：本次診斷的極限

- 以上證據來自檔案系統與設定檔的靜態檢查，以及本 session 可見的 worktree 殘留。
  無法回看歷史 session 的逐字對話，所以「主對話下場燒 token」是由「無派工規則」
  推斷的結構性風險，不是逐 session 統計出來的量測值。
- 若未來發現實際使用型態與此診斷不符（例如使用者大多做小任務、派工反而增加開銷），
  按 `40-maintenance.md` 修訂門檻數字，不要教條式執行。
