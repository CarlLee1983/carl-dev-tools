import fs from 'fs/promises';
import { Logger } from './logger.js';

export class FileUtils {
    /**
     * 檢查檔案是否存在
     */
    static async exists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 確保目錄存在，如果不存在則建立
     */
    static async ensureDir(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            Logger.error(`無法建立目錄 ${dirPath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 複製檔案
     */
    static async copy(source, destination) {
        try {
            await fs.copyFile(source, destination);
            Logger.debug(`檔案已複製: ${source} -> ${destination}`);
        } catch (error) {
            Logger.error(`複製檔案失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 讀取檔案內容
     */
    static async readFile(filePath) {
        try {
            return await fs.readFile(filePath, 'utf8');
        } catch (error) {
            Logger.error(`讀取檔案失敗 ${filePath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 寫入檔案內容
     */
    static async writeFile(filePath, content) {
        try {
            await fs.writeFile(filePath, content, 'utf8');
            Logger.debug(`檔案已寫入: ${filePath}`);
        } catch (error) {
            Logger.error(`寫入檔案失敗 ${filePath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 刪除檔案
     */
    static async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
            Logger.debug(`檔案已刪除: ${filePath}`);
        } catch (error) {
            Logger.error(`刪除檔案失敗 ${filePath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 取得檔案統計資訊
     */
    static async getStats(filePath) {
        try {
            return await fs.stat(filePath);
        } catch (error) {
            Logger.error(`取得檔案資訊失敗 ${filePath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 列出目錄中的檔案
     */
    static async listFiles(dirPath, pattern = null) {
        try {
            const files = await fs.readdir(dirPath);
            if (pattern) {
                const regex = new RegExp(pattern);
                return files.filter(file => regex.test(file));
            }
            return files;
        } catch (error) {
            Logger.error(`列出目錄檔案失敗 ${dirPath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 生成時間戳記
     */
    static generateTimestamp() {
        const now = new Date();
        return now.toISOString()
            .replace(/[:.]/g, '')
            .replace('T', '_')
            .slice(0, 15);
    }
}
