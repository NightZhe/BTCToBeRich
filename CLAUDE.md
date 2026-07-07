# CLAUDE.md — 路由檔

本檔只放路由與硬規則，保持在 80 行以內。詳細規則在 `.claude/rules/`，按需讀取。
（舊版完整備份：`.claude/backups/CLAUDE.md.20260707.bak`）

## 溝通
- 一律用繁體中文回覆。結論先行，理由在後。
- 使用者是 PM，有 Java 後端背景：看得懂 code，但指令要給完整可複製的版本。

## 動手前（每個 session 的前三步）
1. 任務不是三分鐘小事 → 先讀 `.claude/rules/10-dispatch.md`（派工與模型調度）。
2. 要派 subagent → 套 `.claude/rules/30-templates.md` 的對應模板，不要裸派。
3. 拿不準「該不該問使用者／算不算完成／要不要換方法」→ 查 `.claude/rules/20-judgment.md`。

## 規則檔索引（都在 `.claude/rules/`）
| 檔案 | 內容 | 何時讀 |
|------|------|--------|
| `10-dispatch.md` | 模型調度守則：派工門檻、model 選擇、升降級、驗收 | 非小事的任務動手前 |
| `20-judgment.md` | 判斷 rubric：升級/完成/該問/換路/品質底線 | 遇到判斷點時 |
| `30-templates.md` | 派工 prompt 模板（搜尋/實作/重構/研究/審查） | 每次派 subagent |
| `40-maintenance.md` | 如何安全更新這些規則檔、教訓怎麼回寫 | 踩坑後、想改規則前 |
| `50-letter.md` | 前代模型留下的交接信與待辦 | 新環境第一次 session |
| `lessons.md` | 踩坑記錄（只在踩坑時寫、整併時讀，平時不用讀） | 按 40 號檔指示 |
| `profile.md` | 使用者個人背景（含財務，敏感） | 僅個人脈絡相關任務 |
| `00-diagnosis.md` | 2026-07 的 harness 診斷 | 歷史參考，平時不讀 |

## 硬規則（不可違反）
1. **不可逆動作先確認**：刪除檔案/資料、對外發送、正式部署、覆蓋非自己建立的檔案，
   執行前先向使用者確認。本環境預設 bypassPermissions（僅少數毀滅性指令被 deny list
   擋下，其餘一律自動放行），所以這條規則就是主要的門檻。
2. **不編造**：不確定的事實就查；查不到就寫明「未查證」。使用者對亂寫零容忍
   （2026-02-24 曾指正「應該仔細看文本，不要亂寫」）。
3. **改規則檔前先備份**：`cp <檔案> .claude/backups/<檔名>.$(date +%Y%m%d-%H%M).bak`，
   再按 `40-maintenance.md` 的權限分級行事。
4. **驗證不自驗**：宣稱完成前，按 `10-dispatch.md` 第 7 節驗收。程式碼要有實跑證據。
5. **使用者說「部署」「發布」「推上去」**：用 `/deploy` skill，不要手動 git push。
6. 可用 skills 與 subagent 清單由系統自動注入 session 開頭，**以注入的清單為準**，
   不要依賴任何手抄清單（包括本檔）。

## 專案清單
| 專案 | 路徑 | 技術 | 說明 | 線上 |
|------|------|------|------|------|
| etf-app | `~/harryaiagent/etf-app` | Node.js / Express | 台灣 ETF 儀表板（0050/006208/00919/00878/00929） | https://taiwan-etf-app-production.up.railway.app |
| 8591_recommender | `~/harryaiagent/8591_recommender` | Python | 591 租屋推薦系統 | — |
| singapp | `~/harryaiagent/singapp` | Vite / TypeScript | 歌唱/歌曲 app（git repo，main 分支）。注意：截至 2026-07-07 留有 4 個未合併 worktree，見 `50-letter.md` | — |

## 記憶機制分工（避免重複記錄）
- 使用者的長期事實與偏好回饋 → 記憶目錄（系統提示會給路徑與格式）。
- 制度與工作規則 → `.claude/rules/`。
- 本檔 → 只放路由與硬規則。三處不互相複製內容。
