# Node.js 升級指南

## 🚀 升級前準備

### 1. 檢查當前環境
```bash
# 檢查當前 Node.js 版本
node --version

# 檢查 pnpm 版本
pnpm --version

# 執行環境相容性檢查
cd scripts && node src/utils/version-check.js
```

### 2. 備份當前環境
```bash
# 備份 package-lock 檔案
cp pnpm-lock.yaml pnpm-lock.yaml.backup

# 備份 node_modules（可選）
tar -czf node_modules.backup.tar.gz node_modules/
```

## 📋 支援的 Node.js 版本

| Node.js 版本 | 支援狀態 | 備註 |
|-------------|---------|------|
| 18.x LTS    | ✅ 完全支援 | 推薦版本 |
| 20.x LTS    | ✅ 完全支援 | 推薦版本 |
| 21.x        | ⚠️ 部分支援 | 可能有問題 |
| 22.x LTS    | ✅ 完全支援 | 最新推薦版本 |
| 23.x+       | ❌ 不支援 | 等待相容性測試 |

## 🔄 升級步驟

### 步驟 1: 升級 Node.js
```bash
# 使用 nvm 升級（推薦）
nvm install 20
nvm use 20

# 或使用 n
n 20

# 驗證版本
node --version
```

### 步驟 2: 更新 pnpm
```bash
# 更新 pnpm 到最新版本
npm install -g pnpm@latest

# 驗證版本
pnpm --version
```

### 步驟 3: 重新安裝依賴
```bash
cd scripts

# 清理舊的依賴
rm -rf node_modules pnpm-lock.yaml
rm -rf node-tools/*/node_modules node-tools/*/pnpm-lock.yaml

# 重新安裝
pnpm install
```

### 步驟 4: 執行測試
```bash
# 測試 DevKit 主功能
./devkit

# 測試環境管理工具
./devkit env:env --help

# 測試 Git 工具
./devkit git:clean-branch --help
```

## ⚠️ 常見問題與解決方案

### 問題 1: ES modules 錯誤
```
Error [ERR_REQUIRE_ESM]: require() of ES Module
```

**解決方案**：
1. 確保 `package.json` 中有 `"type": "module"`
2. 使用 `import` 而不是 `require`
3. 檢查所有依賴是否支援 ES modules

### 問題 2: 依賴套件不相容
```
npm ERR! peer dep missing
```

**解決方案**：
```bash
# 更新有問題的套件
pnpm update commander chalk inquirer

# 或指定版本安裝
pnpm add commander@latest chalk@latest inquirer@latest
```

### 問題 3: pnpm 工作區問題
```
ERR_PNPM_WORKSPACE_PACKAGE_NOT_FOUND
```

**解決方案**：
```bash
# 重新建立工作區連結
pnpm install --force

# 或清理後重新安裝
pnpm store prune
pnpm install
```

## 🧪 測試清單

升級後請執行以下測試：

- [ ] `./devkit` 顯示工具列表
- [ ] `./devkit git:clean-branch --help` 顯示幫助
- [ ] `./devkit env:env --help` 顯示幫助
- [ ] `./devkit env:env init` 初始化環境管理
- [ ] 在實際專案中測試環境切換功能
- [ ] 測試備份和還原功能

## 🤖 自動版本管理

DevKit 現在支援自動 Node.js 版本切換：

### 自動版本切換機制
- 工具執行前自動檢查並切換到正確的 Node.js 版本
- 執行完成後自動切換回原始版本
- 支援 nvm 和 n 版本管理工具
- 無需手動管理版本切換

### 使用方式
```bash
# 工具會自動處理版本切換
./devkit env:env init

# 執行過程：
# 1. 檢查當前版本 (例如: 18.20.0)
# 2. 切換到要求版本 (例如: 22.11.0)
# 3. 執行環境管理工具
# 4. 切換回原始版本 (18.20.0)
```

### 版本管理工具需求
確保已安裝以下任一版本管理工具：

**NVM (推薦)**：
```bash
# 安裝 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新載入 shell
source ~/.bashrc
```

**N**：
```bash
# 安裝 n
npm install -g n
```

## 🔧 版本鎖定策略

為了避免意外升級造成問題：

### 1. 使用 .nvmrc 檔案
```bash
# 建立 .nvmrc
echo "22.11.0" > .nvmrc

# 使用指定版本
nvm use
```

### 2. 更新 package.json engines
```json
{
  "engines": {
    "node": ">=18.0.0 <23.0.0",
    "pnpm": ">=8.0.0 <10.0.0"
  }
}
```

### 3. 使用 packageManager 欄位
```json
{
  "packageManager": "pnpm@8.10.0"
}
```

## 📞 取得協助

如果升級過程中遇到問題：

1. 檢查 [Node.js 官方升級指南](https://nodejs.org/en/download/releases/)
2. 查看各依賴套件的 CHANGELOG
3. 在專案 Issues 中回報問題

## 🔄 回滾程序

如果升級後出現問題：

```bash
# 回滾 Node.js 版本
nvm use 18

# 還原依賴
rm -rf node_modules pnpm-lock.yaml
cp pnpm-lock.yaml.backup pnpm-lock.yaml
pnpm install

# 或完全還原
tar -xzf node_modules.backup.tar.gz
```
