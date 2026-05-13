import path from 'path';
import { FileUtils } from './utils/file.js';
import { Logger } from './utils/logger.js';
import { EnvValidator } from './utils/validator.js';

export class EnvManager {
    constructor(projectPath = process.cwd()) {
        this.projectPath = projectPath;
        this.envFile = path.join(projectPath, '.env');
        this.backupDir = path.join(projectPath, '.env-backups');
        this.templatesDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'templates');
    }

    /**
     * 建立新環境檔案
     */
    async create(envName, sourceFile = '.env.example') {
        try {
            Logger.info(`建立環境檔案: ${envName}`);

            const targetFile = path.join(this.projectPath, `.env.${envName}`);
            
            // 檢查目標檔案是否已存在
            if (await FileUtils.exists(targetFile)) {
                throw new Error(`環境檔案已存在: .env.${envName}`);
            }

            let sourceFilePath;
            
            // 檢查來源檔案
            if (sourceFile === 'template') {
                // 使用內建範本
                sourceFilePath = path.join(this.templatesDir, `env.${envName}.template`);
                if (!(await FileUtils.exists(sourceFilePath))) {
                    sourceFilePath = path.join(this.templatesDir, 'env.local.template');
                }
            } else {
                // 使用專案中的檔案
                sourceFilePath = path.join(this.projectPath, sourceFile);
            }

            if (!(await FileUtils.exists(sourceFilePath))) {
                throw new Error(`來源檔案不存在: ${sourceFile}`);
            }

            // 複製檔案
            await FileUtils.copy(sourceFilePath, targetFile);

            // 如果使用範本，替換變數
            if (sourceFile === 'template') {
                await this._replaceTemplateVariables(targetFile, envName);
            }

            Logger.success(`環境檔案已建立: .env.${envName}`);
            
            // 驗證建立的檔案
            const validation = await EnvValidator.validateFormat(targetFile);
            if (!validation.valid) {
                Logger.warning('建立的檔案有格式問題:');
                validation.errors.forEach(error => Logger.error(`  ${error}`));
            }

            return targetFile;

        } catch (error) {
            Logger.error(`建立環境檔案失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 切換環境
     */
    async switch(envName) {
        try {
            Logger.info(`切換到環境: ${envName}`);

            const sourceFile = path.join(this.projectPath, `.env.${envName}`);
            
            // 檢查來源環境檔案是否存在
            if (!(await FileUtils.exists(sourceFile))) {
                throw new Error(`環境檔案不存在: .env.${envName}`);
            }

            // 備份當前 .env（如果存在）
            if (await FileUtils.exists(this.envFile)) {
                await this._backupCurrentEnv();
            }

            // 複製環境檔案到 .env
            await FileUtils.copy(sourceFile, this.envFile);

            // 驗證新環境檔案
            const validation = await EnvValidator.validateFormat(this.envFile);
            if (!validation.valid) {
                Logger.warning('切換的環境檔案有格式問題:');
                validation.errors.forEach(error => Logger.error(`  ${error}`));
            }

            // 記錄切換歷史
            await this._recordSwitchHistory(envName);

            Logger.success(`已切換到環境: ${envName}`);

        } catch (error) {
            Logger.error(`切換環境失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 列出所有環境
     */
    async list() {
        try {
            const envFiles = await FileUtils.listFiles(this.projectPath, '^\\.env\\.');
            const environments = [];

            for (const file of envFiles) {
                const envName = file.replace(/^\.env\./, '');
                const filePath = path.join(this.projectPath, file);
                const stats = await FileUtils.getStats(filePath);
                
                environments.push({
                    name: envName,
                    file: file,
                    size: stats.size,
                    modified: stats.mtime,
                    isCurrent: await this._isCurrentEnv(envName)
                });
            }

            // 按修改時間排序
            environments.sort((a, b) => b.modified - a.modified);

            return environments;

        } catch (error) {
            Logger.error(`列出環境失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 取得當前環境資訊
     */
    async current() {
        try {
            if (!(await FileUtils.exists(this.envFile))) {
                return null;
            }

            const stats = await FileUtils.getStats(this.envFile);
            const validation = await EnvValidator.validateFormat(this.envFile);
            const envVars = await EnvValidator.parseEnvFile(this.envFile);

            return {
                file: '.env',
                size: stats.size,
                modified: stats.mtime,
                valid: validation.valid,
                errors: validation.errors,
                warnings: validation.warnings,
                variableCount: Object.keys(envVars).length,
                environment: envVars.APP_ENV || 'unknown'
            };

        } catch (error) {
            Logger.error(`取得當前環境資訊失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 比較環境差異
     */
    async diff(env1, env2 = 'current') {
        try {
            let file1Path, file2Path;

            if (env1 === 'current') {
                file1Path = this.envFile;
            } else {
                file1Path = path.join(this.projectPath, `.env.${env1}`);
            }

            if (env2 === 'current') {
                file2Path = this.envFile;
            } else {
                file2Path = path.join(this.projectPath, `.env.${env2}`);
            }

            // 檢查檔案是否存在
            if (!(await FileUtils.exists(file1Path))) {
                throw new Error(`環境檔案不存在: ${env1}`);
            }
            if (!(await FileUtils.exists(file2Path))) {
                throw new Error(`環境檔案不存在: ${env2}`);
            }

            const vars1 = await EnvValidator.parseEnvFile(file1Path);
            const vars2 = await EnvValidator.parseEnvFile(file2Path);

            const differences = {
                added: {},      // 在 env2 中新增的
                removed: {},    // 在 env2 中移除的
                changed: {},    // 值有變化的
                unchanged: {}   // 相同的
            };

            // 找出所有唯一的 key
            const allKeys = new Set([...Object.keys(vars1), ...Object.keys(vars2)]);

            for (const key of allKeys) {
                const value1 = vars1[key];
                const value2 = vars2[key];

                if (value1 === undefined) {
                    differences.added[key] = value2;
                } else if (value2 === undefined) {
                    differences.removed[key] = value1;
                } else if (value1 !== value2) {
                    differences.changed[key] = { from: value1, to: value2 };
                } else {
                    differences.unchanged[key] = value1;
                }
            }

            return differences;

        } catch (error) {
            Logger.error(`比較環境差異失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 私有方法：備份當前環境
     */
    async _backupCurrentEnv() {
        try {
            await FileUtils.ensureDir(this.backupDir);
            
            const timestamp = FileUtils.generateTimestamp();
            const currentEnvName = await this._getCurrentEnvName();
            const backupFileName = `.env.backup.${currentEnvName}.${timestamp}`;
            const backupPath = path.join(this.backupDir, backupFileName);

            await FileUtils.copy(this.envFile, backupPath);
            Logger.debug(`當前環境已備份: ${backupFileName}`);

        } catch (error) {
            Logger.warning(`備份當前環境失敗: ${error.message}`);
        }
    }

    /**
     * 私有方法：取得當前環境名稱
     */
    async _getCurrentEnvName() {
        try {
            const envVars = await EnvValidator.parseEnvFile(this.envFile);
            return envVars.APP_ENV || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * 私有方法：檢查是否為當前環境
     */
    async _isCurrentEnv(envName) {
        try {
            if (!(await FileUtils.exists(this.envFile))) {
                return false;
            }

            const currentVars = await EnvValidator.parseEnvFile(this.envFile);
            const envFile = path.join(this.projectPath, `.env.${envName}`);
            const envVars = await EnvValidator.parseEnvFile(envFile);

            // 簡單比較：檢查主要變數是否相同
            const keyVars = ['APP_ENV', 'APP_NAME', 'DB_DATABASE'];
            for (const key of keyVars) {
                if (currentVars[key] !== envVars[key]) {
                    return false;
                }
            }

            return true;

        } catch {
            return false;
        }
    }

    /**
     * 私有方法：替換範本變數
     */
    async _replaceTemplateVariables(filePath, envName) {
        try {
            let content = await FileUtils.readFile(filePath);
            const projectName = path.basename(this.projectPath);

            // 替換常見變數
            content = content.replace(/MyApp/g, projectName);
            content = content.replace(/myapp_local/g, `${projectName}_${envName}`);
            content = content.replace(/myapp_staging/g, `${projectName}_${envName}`);
            content = content.replace(/myapp_production/g, `${projectName}_${envName}`);

            await FileUtils.writeFile(filePath, content);

        } catch (error) {
            Logger.warning(`替換範本變數失敗: ${error.message}`);
        }
    }

    /**
     * 私有方法：記錄切換歷史
     */
    async _recordSwitchHistory(envName) {
        try {
            await FileUtils.ensureDir(this.backupDir);
            const historyFile = path.join(this.backupDir, '.switch-history');
            const timestamp = new Date().toISOString();
            const entry = `${timestamp} - 切換到: ${envName}\n`;

            // 追加到歷史檔案
            const existingHistory = await FileUtils.exists(historyFile)
                ? await FileUtils.readFile(historyFile)
                : '';
            await FileUtils.writeFile(historyFile, existingHistory + entry);

        } catch (error) {
            Logger.debug(`記錄切換歷史失敗: ${error.message}`);
        }
    }
}
