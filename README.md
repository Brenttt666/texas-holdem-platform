# HOME GAME — Texas Hold'em

這是一個可部署的多人德州撲克 MVP，使用純娛樂籌碼，不支援現金交易或兌換。

## 功能
- RWD 網頁：手機、平板、桌面瀏覽器
- 建立私人房間、房間代碼與分享邀請資訊
- 最多 8 位玩家，Socket.IO 即時同步
- 自訂小盲注、大盲注、預設買入籌碼
- 加入 AI 玩家（基本策略）
- Fold / Check / Call / Raise / All-in
- 伺服器端洗牌、發牌、牌型判定

## 本機啟動
需要 Node.js 20 或更新版本。

```bash
npm install
npm start
```

瀏覽器開啟 http://localhost:3000

## 部署到公開網址（Render）
專案已附 `render.yaml`，可在 Render 選擇從 GitHub 部署 Blueprint。先將整個專案上傳到自己的 GitHub repository，再到 Render 建立 Blueprint 並選取該 repository。Render 會依照 `render.yaml` 安裝套件、啟動伺服器並產生 HTTPS 公開網址。免費方案可能休眠，且伺服器重啟會清空進行中的房間；正式長時間遊玩建議使用常駐方案。

## 重要限制與後續工作
這是第一版可測試 MVP，尚未達到正式商用或高可靠度遊戲伺服器標準：
- 目前房間存在伺服器記憶體，伺服器重啟會清空房間。
- 目前未做帳號系統、斷線重連恢復、持久化戰績與房主移交。
- AI 是簡化策略，並非高階牌力分析。
- 下注與底池目前為基本版本；正式公開給大量玩家前，應補齊 side pot（邊池）、短碼加注規則、離線玩家逾時處理、完整測試與安全性檢查。
- 建議先以朋友小規模測試，再逐步補強。

## 目錄
- `server.js`：房間、玩家、發牌、下注流程與即時同步
- `public/index.html`：介面
- `public/style.css`：響應式樣式
- `public/app.js`：前端互動
