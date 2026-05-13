import path from 'path';
import { FileUtils } from './utils/file.js';
import { Logger } from './utils/logger.js';

export class BackupManager {
    constructor(projectPath = process.cwd()) {
        this.projectPath = projectPath;
        this.backupDir = path.join(projectPath, '.env-backups');
        this.envFile = path.join(projectPath, '.env');
    }

    /**
     * 建立備份
     */
    async create(envName = null, customName = null) {
        try {
            // 確保備份目錄存在
            await FileUtils.ensureDir(this.backupDir);

            // 決定要備份的檔案
            let sourceFile;
            let backupBaseName;

            if (envName) {
                sourceFile = path.join(this.projectPath, `.env.${envName}`);
                backupBaseName = envName;
            } else {
                sourceFile = this.envFile;
                backupBaseName = await this._getCurrentEnvName();
            }

            // 檢查來源檔案是否存在
            if (!(await FileUtils.exists(sourceFile))) {
                throw new Error(`要備份的檔案不存在: ${sourceFile}`);
            }

            // 生成備份檔案名稱
            const timestamp = FileUtils.generateTimestamp();
            const backupName = customName || backupBaseName;
            const backupFileName = `.env.backup.${backupName}.${timestamp}`;
            const backupPath = path.join(this.backupDir, backupFileName);

            // 複製檔案到備份目錄
            await FileUtils.copy(sourceFile, backupPath);

            // 記錄備份資訊
            await this._recordBackupInfo(backupFileName, sourceFile, customName);

            Logger.success(`備份已建立: ${backupFileName}`);
            return backupFileName;

        } catch (error) {
            Logger.error(`建立備份失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 列出備份
     */
    async list() {
        try {
            // 確保備份目錄存在
            if (!(await FileUtils.exists(this.backupDir))) {
                return [];
            }

            const backupFiles = await FileUtils.listFiles(this.backupDir, '^\\.env\\.backup\\.');
            const backups = [];

            for (const file of backupFiles) {
                const filePath = path.join(this.backupDir, file);
                const stats = await FileUtils.getStats(filePath);
                
                // 解析備份檔案名稱
                const parsed = this._parseBackupFileName(file);
                
                backups.push({
                    fileName: file,
                    envName: parsed.envName,
                    timestamp: parsed.timestamp,
                    size: stats.size,
                    created: stats.mtime,
                    age: this._calculateAge(stats.mtime)
                });
            }

            // 按建立時間排序（最新的在前）
            backups.sort((a, b) => b.created - a.created);

            return backups;

        } catch (error) {
            Logger.error(`列出備份失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 還原備份
     */
    async restore(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);

            // 檢查備份檔案是否存在
            if (!(await FileUtils.exists(backupPath))) {
                throw new Error(`備份檔案不存在: ${backupName}`);
            }

            // 備份當前 .env（如果存在）
            if (await FileUtils.exists(this.envFile)) {
                const currentBackupName = await this.create(null, 'before-restore');
                Logger.info(`當前環境已備份為: ${currentBackupName}`);
            }

            // 還原指定備份
            await FileUtils.copy(backupPath, this.envFile);

            // 記錄還原操作
            await this._recordRestoreInfo(backupName);

            Logger.success(`已從備份還原: ${backupName}`);

        } catch (error) {
            Logger.error(`還原備份失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 清理舊備份
     */
    async clean(olderThanDays = 30, keepMinimum = 5) {
        try {
            const backups = await this.list();
            
            if (backups.length <= keepMinimum) {
                Logger.info(`備份數量 (${backups.length}) 未超過最小保留數量 (${keepMinimum})，跳過清理`);
                return { deleted: 0, kept: backups.length };
            }

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

            let deletedCount = 0;
            const toDelete = [];

            // 找出要刪除的備份（保留最新的 keepMinimum 個）
            for (let i = keepMinimum; i < backups.length; i++) {
                const backup = backups[i];
                if (backup.created < cutoffDate) {
                    toDelete.push(backup);
                }
            }

            // 刪除舊備份
            for (const backup of toDelete) {
                const backupPath = path.join(this.backupDir, backup.fileName);
                await FileUtils.deleteFile(backupPath);
                deletedCount++;
                Logger.debug(`已刪除舊備份: ${backup.fileName}`);
            }

            if (deletedCount > 0) {
                Logger.success(`已清理 ${deletedCount} 個舊備份`);
            } else {
                Logger.info('沒有需要清理的舊備份');
            }

            return {
                deleted: deletedCount,
                kept: backups.length - deletedCount
            };

        } catch (error) {
            Logger.error(`清理備份失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 取得備份詳細資訊
     */
    async getBackupInfo(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);

            if (!(await FileUtils.exists(backupPath))) {
                throw new Error(`備份檔案不存在: ${backupName}`);
            }

            const stats = await FileUtils.getStats(backupPath);
            const content = await FileUtils.readFile(backupPath);
            const lines = content.split('\n');
            const parsed = this._parseBackupFileName(backupName);

            // 計算環境變數數量
            let varCount = 0;
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    varCount++;
                }
            }

            return {
                fileName: backupName,
                envName: parsed.envName,
                timestamp: parsed.timestamp,
                size: stats.size,
                created: stats.mtime,
                age: this._calculateAge(stats.mtime),
                variableCount: varCount,
                lineCount: lines.length
            };

        } catch (error) {
            Logger.error(`取得備份資訊失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 私有方法：取得當前環境名稱
     */
    async _getCurrentEnvName() {
        try {
            if (!(await FileUtils.exists(this.envFile))) {
                return 'current';
            }

            const content = await FileUtils.readFile(this.envFile);
            const lines = content.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('APP_ENV=')) {
                    return trimmed.split('=')[1] || 'current';
                }
            }

            return 'current';

        } catch {
            return 'current';
        }
    }

    /**
     * 私有方法：解析備份檔案名稱
     */
    _parseBackupFileName(fileName) {
        // 格式: .env.backup.{envName}.{timestamp}
        const parts = fileName.split('.');
        if (parts.length >= 4) {
            const envName = parts[3];
            const timestamp = parts[4] || '';
            return { envName, timestamp };
        }

        return { envName: 'unknown', timestamp: '' };
    }

    /**
     * 私有方法：計算檔案年齡
     */
    _calculateAge(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffMs / (1000 * 60));

        if (diffDays > 0) {
            return `${diffDays} 天前`;
        } else if (diffHours > 0) {
            return `${diffHours} 小時前`;
        } else if (diffMinutes > 0) {
            return `${diffMinutes} 分鐘前`;
        } else {
            return '剛剛';
        }
    }

    /**
     * 私有方法：記錄備份資訊
     */
    async _recordBackupInfo(backupFileName, sourceFile, customName) {
        try {
            const logFile = path.join(this.backupDir, '.backup-log');
            const timestamp = new Date().toISOString();
            const entry = {
                timestamp,
                backupFile: backupFileName,
                sourceFile: path.basename(sourceFile),
                customName,
                action: 'create'
            };

            // 讀取現有日誌
            let logs = [];
            try {
                const existingLog = await FileUtils.readFile(logFile);
                logs = JSON.parse(existingLog);
            } catch {
                // 檔案不存在或格式錯誤，建立新的
            }

            logs.push(entry);

            // 只保留最近 100 筆記錄
            if (logs.length > 100) {
                logs = logs.slice(-100);
            }

            await FileUtils.writeFile(logFile, JSON.stringify(logs, null, 2));

        } catch (error) {
            Logger.debug(`記錄備份資訊失敗: ${error.message}`);
        }
    }

    /**
     * 私有方法：記錄還原資訊
     */
    async _recordRestoreInfo(backupFileName) {
        try {
            const logFile = path.join(this.backupDir, '.backup-log');
            const timestamp = new Date().toISOString();
            const entry = {
                timestamp,
                backupFile: backupFileName,
                action: 'restore'
            };

            // 讀取現有日誌
            let logs = [];
            try {
                const existingLog = await FileUtils.readFile(logFile);
                logs = JSON.parse(existingLog);
            } catch {
                logs = [];
            }

            logs.push(entry);

            // 只保留最近 100 筆記錄
            if (logs.length > 100) {
                logs = logs.slice(-100);
            }

            await FileUtils.writeFile(logFile, JSON.stringify(logs, null, 2));

        } catch (error) {
            Logger.debug(`記錄還原資訊失敗: ${error.message}`);
        }
    }
}
