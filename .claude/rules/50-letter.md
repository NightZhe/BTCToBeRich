# 50 - 給未來 session 的信

寫於 2026-07-07，由 Fable 5 的唯一一次 session 留下。你（正在讀信的模型）多半是
Sonnet、Opus 或 Haiku。這套制度就是為你設計的：它假設你會犯錯，所以把驗證和
升級路徑都寫成了流程。照著做，你的產出會比裸跑好一截。

---

## 一、三件使用者沒問、但最重要的事

### 1. singapp 有一筆沒收尾的帳（第一次 session 就該處理）
`~/harryaiagent/singapp/.claude/worktrees/` 下有 4 個 2026-07-04 留下的未合併
worktree，全部基於 main 的 bae8479：
- `agent-a01fa610…` 與 `agent-a45930…`：**重複**，都改了 src/data/songs.ts 並新增
  public/scores/heri-jun-zailai.json（何日君再來）
- `agent-a4835e…`：只改了 src/data/songs.ts
- `agent-a97747…`：改了 src/data/songs.ts、新增 public/scores/yueliang-daibiao-wodexin.json（月亮代表我的心）

處理方式：逐一 diff 比較（`git -C <worktree路徑> diff`），向使用者提議「合併哪些、
丟哪些」，**得到同意後**才合併與刪 worktree（刪除屬於 20-judgment.md 判準 3 的必問
項）。這件事同時是判準 2「agent 宣稱完成 ≠ 完成」的活教材。

### 2. 這個環境沒有安全網，你的謹慎就是唯一的安全網
- 全域設定是 `bypassPermissions`：除了 deny list 擋下的少數毀滅性指令
  （rm -rf、git push --force、sudo 等），你發的每個指令都直接執行，沒有人審。
- `~/harryaiagent` 頂層已於 2026-07-07 經使用者同意 git init（root commit 83ab844），
  只追蹤 CLAUDE.md 與 .claude/；子專案（各自是獨立 repo）、settings.local.json、
  **profile.md（敏感）** 都在 .gitignore 裡，不要把它們 add 進來。
  → 改規則檔後記得 commit（本地即可，沒有 remote）；改前備份到 backups/ 的規則照舊。
- 使用者對「亂寫」零容忍，曾明確糾正過。查不到就說查不到，這比什麼都重要。

### 3. 讀懂這位使用者，回覆方式比內容更容易失分
- PM、前 Java 工程師：不用科普，但他不寫日常 code——給他的指令要完整可複製，
  不要給「大概這樣改」的片段。
- 中文、結論先行、短。他問「吃得到嗎」這種口語問題時，答案第一句就要是「吃得到」
  或「吃不到」，然後才是細節。
- 他的錢和個人資料在 `profile.md`。財務快照是 2026-03 的，引用前先確認還準不準；
  永遠不要主動在回覆裡複誦他的財務數字。
- 理財、置產、投資類問題：提供事實與框架，最終判斷留給他
  （20-judgment.md 誠實條款第 2 條）。

## 二、這套制度最可能的退化方式，與預防法

| 退化方式 | 早期訊號 | 預防法 |
|----------|----------|--------|
| **規則膨脹**：每次踩坑就加規則，CLAUDE.md 重新長回 7KB 的雜物堆 | CLAUDE.md 超過 80 行；規則檔互相複製內容 | 40-maintenance.md 第 5 節的體積上限是硬的。加新規則前先問「能不能改既有條文而不是新增」 |
| **派工規則被跳過**：「這次很小，直接做」的滑坡，三次之後主對話塞滿 | 你發現自己在主對話連續讀第 3 個檔案 | 10-dispatch.md 第 0 節三問自檢。第二次想跳過門檻，那一刻就派工 |
| **驗證變形式**：驗收 agent 拿到執行者結論照抄，橡皮圖章 | 驗收回報和執行回報用詞雷同；驗收從不曾「不通過」 | 驗收 prompt 永遠不附執行者結論（30-templates.md 模板 5 的括號警告）。發覺驗收「總是全過」時，抽一件自己實跑複核（不必精確計數，當直覺提醒） |
| **lessons 變垃圾場**：只寫不整併，或反過來每 session 都讀而燒 token | lessons.md 超過 150 行沒人動 | 40-maintenance.md 第 4 節的觸發條件。記住：lessons 是寫入用的，平時不讀 |
| **清單漂移**：模型型號、工具名、skill 清單過時後被照抄執行 | session 注入的清單和 10-dispatch.md 第 2 節對不上 | 以系統注入為準，發現不符當場更新（A 級，不用問）。每季核對一次查證日期 |

## 三、交接狀態（2026-07-07 立制 session 結束時）

- 已完成：診斷（00）、CLAUDE.md 重寫（舊版備份於 .claude/backups/）、調度守則（10）、
  判斷 rubric（20）、派工模板（30）、維護協議（40）、lessons 種子、本信（50）、
  profile.md、對抗審查與 read-back（已執行：opus fresh-context 審查發現 1 個規則
  衝突、1 個門檻矛盾、1 個懸空引用、2 個措辭問題，均已於同 session 修正；
  無另存書面報告，需要複核就按 30-templates.md 模板 5 重跑一次）。
- 未完成／留給你：singapp worktree 收尾（見上文第一件事）；記憶目錄（memory/）
  是空的，遇到值得記的使用者事實就開始按系統提示的格式使用。
