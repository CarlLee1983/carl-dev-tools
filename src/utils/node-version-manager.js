import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { Logger } from './logger.js';
import { PlatformUtils } from './platform.js';
import { FileUtils } from './file.js';
import path from 'path';

export class NodeVersionManager {
    constructor() {
        this.originalVersion = null;
        this.requiredVersion = null;
        this.nvmAvailable = false;
        this.nAvailable = false;
    }

    /**
     * 初始化版本管理器
     */
    async initialize() {
        // 檢查當前 Node.js 版本
        this.originalVersion = await this.getCurrentNodeVersion();
        
        // 檢查版本管理工具
        this.nvmAvailable = await this.checkNvmAvailable();
        this.nAvailable = await this.checkNAvailable();
        
        // 讀取專案要求的版本
        this.requiredVersion = await this.getRequiredVersion();
        
        Logger.debug(`當前 Node.js 版本: ${this.originalVersion}`);
        Logger.debug(`專案要求版本: ${this.requiredVersion}`);
        Logger.debug(`NVM 可用: ${this.nvmAvailable}`);
        Logger.debug(`N 可用: ${this.nAvailable}`);
    }

    /**
     * 取得當前 Node.js 版本
     */
    async getCurrentNodeVersion() {
        try {
            const result = await PlatformUtils.executeCommand('node', ['--version']);
            return result.stdout.replace('v', '');
        } catch (error) {
            throw new Error('無法取得 Node.js 版本');
        }
    }

    /**
     * 檢查 NVM 是否可用
     */
    async checkNvmAvailable() {
        try {
            // 檢查 nvm 命令是否存在
            const nvmPath = process.env.NVM_DIR ? 
                path.join(process.env.NVM_DIR, 'nvm.sh') : 
                path.join(PlatformUtils.getHomeDir(), '.nvm', 'nvm.sh');
            
            return await FileUtils.exists(nvmPath);
        } catch {
            return false;
        }
    }

    /**
     * 檢查 N 是否可用
     */
    async checkNAvailable() {
        return await PlatformUtils.commandExists('n');
    }

    /**
     * 取得專案要求的 Node.js 版本
     */
    async getRequiredVersion() {
        try {
            // 優先讀取 .nvmrc
            const nvmrcPath = path.join(process.cwd(), '.nvmrc');
            if (await FileUtils.exists(nvmrcPath)) {
                const version = await FileUtils.readFile(nvmrcPath);
                return version.trim();
            }

            // 其次讀取 package.json 的 engines.node
            const packageJsonPath = path.join(process.cwd(), 'package.json');
            if (await FileUtils.exists(packageJsonPath)) {
                const packageJson = JSON.parse(await FileUtils.readFile(packageJsonPath));
                if (packageJson.engines && packageJson.engines.node) {
                    // 解析版本範圍，取最新的穩定版本
                    const nodeRange = packageJson.engines.node;
                    return this.parseVersionRange(nodeRange);
                }
            }

            return null;
        } catch (error) {
            Logger.warning(`讀取專案版本要求失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * 解析版本範圍並回傳建議版本
     */
    parseVersionRange(range) {
        // 簡單的版本範圍解析
        if (range.includes('>=18.0.0') && range.includes('<24.0.0')) {
            return '22.11.0'; // 最新的 LTS 版本
        }
        if (range.includes('>=18.0.0') && range.includes('<23.0.0')) {
            return '20.18.0'; // 20.x LTS
        }
        if (range.includes('>=18.0.0')) {
            return '18.20.0'; // 18.x LTS
        }
        
        // 如果無法解析，回傳 null
        return null;
    }

    /**
     * 檢查是否需要切換版本
     */
    needsVersionSwitch() {
        if (!this.requiredVersion || !this.originalVersion) {
            return false;
        }

        // 檢查主版本是否相同
        const currentMajor = parseInt(this.originalVersion.split('.')[0]);
        const requiredMajor = parseInt(this.requiredVersion.split('.')[0]);
        
        return currentMajor !== requiredMajor;
    }

    /**
     * 切換到要求的 Node.js 版本
     */
    async switchToRequiredVersion() {
        if (!this.needsVersionSwitch()) {
            Logger.debug('當前版本符合要求，無需切換');
            return true;
        }

        if (!this.requiredVersion) {
            Logger.warning('未指定要求的 Node.js 版本');
            return false;
        }

        Logger.info(`切換 Node.js 版本: ${this.originalVersion} → ${this.requiredVersion}`);

        try {
            if (this.nvmAvailable) {
                return await this.switchWithNvm();
            } else if (this.nAvailable) {
                return await this.switchWithN();
            } else {
                Logger.error('未找到 Node.js 版本管理工具 (nvm 或 n)');
                Logger.info('請手動安裝 nvm 或 n 來支援自動版本切換');
                return false;
            }
        } catch (error) {
            Logger.error(`版本切換失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 使用 NVM 切換版本
     */
    async switchWithNvm() {
        try {
            // 檢查版本是否已安裝
            const listResult = await this.executeNvmCommand(['list']);
            const installedVersions = listResult.stdout;
            
            if (!installedVersions.includes(this.requiredVersion)) {
                Logger.info(`安裝 Node.js ${this.requiredVersion}...`);
                await this.executeNvmCommand(['install', this.requiredVersion]);
            }

            // 切換版本
            await this.executeNvmCommand(['use', this.requiredVersion]);
            
            // 驗證切換結果
            const newVersion = await this.getCurrentNodeVersion();
            if (newVersion.startsWith(this.requiredVersion.split('.')[0])) {
                Logger.success(`已切換到 Node.js ${newVersion}`);
                return true;
            } else {
                throw new Error(`版本切換失敗，當前版本: ${newVersion}`);
            }
        } catch (error) {
            Logger.error(`NVM 切換失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 使用 N 切換版本
     */
    async switchWithN() {
        try {
            // 安裝並切換到指定版本
            Logger.info(`使用 n 切換到 Node.js ${this.requiredVersion}...`);
            await PlatformUtils.executeCommand('n', [this.requiredVersion]);
            
            // 驗證切換結果
            const newVersion = await this.getCurrentNodeVersion();
            if (newVersion.startsWith(this.requiredVersion.split('.')[0])) {
                Logger.success(`已切換到 Node.js ${newVersion}`);
                return true;
            } else {
                throw new Error(`版本切換失敗，當前版本: ${newVersion}`);
            }
        } catch (error) {
            Logger.error(`N 切換失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 切換回原始版本
     */
    async switchBackToOriginal() {
        if (!this.originalVersion) {
            Logger.debug('沒有原始版本資訊，跳過切換');
            return true;
        }

        const currentVersion = await this.getCurrentNodeVersion();
        if (currentVersion === this.originalVersion) {
            Logger.debug('已經是原始版本，無需切換');
            return true;
        }

        Logger.info(`切換回原始 Node.js 版本: ${currentVersion} → ${this.originalVersion}`);

        try {
            if (this.nvmAvailable) {
                await this.executeNvmCommand(['use', this.originalVersion]);
            } else if (this.nAvailable) {
                await PlatformUtils.executeCommand('n', [this.originalVersion]);
            }

            const finalVersion = await this.getCurrentNodeVersion();
            Logger.success(`已切換回 Node.js ${finalVersion}`);
            return true;
        } catch (error) {
            Logger.warning(`切換回原始版本失敗: ${error.message}`);
            Logger.info('請手動切換回原始版本');
            return false;
        }
    }

    /**
     * 執行 NVM 命令
     */
    async executeNvmCommand(args) {
        const nvmScript = process.env.NVM_DIR ? 
            path.join(process.env.NVM_DIR, 'nvm.sh') : 
            path.join(PlatformUtils.getHomeDir(), '.nvm', 'nvm.sh');

        // 在 bash 中執行 nvm 命令
        const command = `source ${nvmScript} && nvm ${args.join(' ')}`;
        
        return await PlatformUtils.executeCommand('bash', ['-c', command]);
    }

    /**
     * 建立版本管理包裝器
     */
    static async withCorrectVersion(callback) {
        const manager = new NodeVersionManager();
        
        try {
            await manager.initialize();
            
            // 切換到要求的版本
            const switchSuccess = await manager.switchToRequiredVersion();
            if (!switchSuccess) {
                Logger.warning('版本切換失敗，使用當前版本繼續執行');
            }

            // 執行回調函數
            const result = await callback();

            return result;
        } finally {
            // 無論成功或失敗，都嘗試切換回原始版本
            try {
                await manager.switchBackToOriginal();
            } catch (error) {
                Logger.debug(`切換回原始版本時發生錯誤: ${error.message}`);
            }
        }
    }
}
