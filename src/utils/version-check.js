import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

export class VersionChecker {
    /**
     * 檢查 Node.js 版本相容性
     */
    static checkNodeVersion() {
        const currentVersion = process.version;
        const requiredVersion = '>=18.0.0 <24.0.0';
        
        if (!this.satisfiesNodeRange(currentVersion, requiredVersion)) {
            Logger.error(`Node.js 版本不相容！`);
            Logger.error(`當前版本: ${currentVersion}`);
            Logger.error(`需要版本: ${requiredVersion}`);
            Logger.info('請使用 nvm 或其他版本管理工具切換到相容版本');
            return false;
        }
        
        Logger.debug(`Node.js 版本檢查通過: ${currentVersion}`);
        return true;
    }


    /**
     * 檢查版本是否符合目前支援的 Node.js 範圍
     */
    static satisfiesNodeRange(version, range) {
        const parsed = this.parseVersion(version);
        if (!parsed) {
            return false;
        }

        if (range === '>=18.0.0 <24.0.0') {
            return this.compareVersions(parsed, [18, 0, 0]) >= 0
                && this.compareVersions(parsed, [24, 0, 0]) < 0;
        }

        return false;
    }

    /**
     * 比較套件版本是否大於或等於指定版本
     */
    static isGreaterOrEqual(version, minimumVersion) {
        const parsedVersion = this.parseVersion(version);
        const parsedMinimum = this.parseVersion(minimumVersion);

        if (!parsedVersion || !parsedMinimum) {
            return false;
        }

        return this.compareVersions(parsedVersion, parsedMinimum) >= 0;
    }

    /**
     * 從版本字串取出 major/minor/patch
     */
    static parseVersion(version) {
        const match = String(version).match(/(\d+)\.(\d+)\.(\d+)/);

        if (!match) {
            return null;
        }

        return match.slice(1).map(Number);
    }

    /**
     * 比較兩個 semver-like 版本陣列
     */
    static compareVersions(a, b) {
        for (let i = 0; i < 3; i++) {
            if (a[i] > b[i]) {
                return 1;
            }
            if (a[i] < b[i]) {
                return -1;
            }
        }

        return 0;
    }

    /**
     * 檢查套件相容性
     */
    static async checkDependencies() {
        try {
            const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
            const dependencies = packageJson.dependencies || {};
            
            const warnings = [];
            
            // 檢查已知可能有問題的套件
            const riskPackages = {
                'inquirer': { maxVersion: '10.0.0', reason: 'v10+ 可能有 breaking changes' },
                'diff': { maxVersion: '6.0.0', reason: 'v6+ API 可能有變化' }
            };
            
            for (const [pkg, info] of Object.entries(riskPackages)) {
                if (dependencies[pkg]) {
                    const installedVersion = dependencies[pkg];
                    if (this.isGreaterOrEqual(installedVersion, info.maxVersion)) {
                        warnings.push(`${pkg}: ${info.reason}`);
                    }
                }
            }
            
            if (warnings.length > 0) {
                Logger.warning('發現潛在的套件相容性問題:');
                warnings.forEach(warning => Logger.warning(`  - ${warning}`));
                return false;
            }
            
            return true;
            
        } catch (error) {
            Logger.error(`檢查依賴失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 檢查 ES modules 支援
     */
    static checkESModulesSupport() {
        try {
            // 檢查是否支援 top-level await
            eval('(async () => { await Promise.resolve(); })()');
            
            // 檢查是否支援 import.meta
            if (typeof import.meta === 'undefined') {
                Logger.warning('import.meta 不支援，可能影響某些功能');
                return false;
            }
            
            Logger.debug('ES modules 支援檢查通過');
            return true;
            
        } catch (error) {
            Logger.error(`ES modules 支援檢查失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 完整的環境檢查
     */
    static async performFullCheck() {
        Logger.header('環境相容性檢查');
        
        const checks = [
            { name: 'Node.js 版本', check: () => this.checkNodeVersion() },
            { name: 'ES modules 支援', check: () => this.checkESModulesSupport() },
            { name: '套件相容性', check: () => this.checkDependencies() }
        ];
        
        let allPassed = true;
        
        for (const { name, check } of checks) {
            try {
                const result = await check();
                if (result) {
                    Logger.success(`${name}: 通過`);
                } else {
                    Logger.error(`${name}: 失敗`);
                    allPassed = false;
                }
            } catch (error) {
                Logger.error(`${name}: 檢查時發生錯誤 - ${error.message}`);
                allPassed = false;
            }
        }
        
        if (allPassed) {
            Logger.success('所有環境檢查通過！');
        } else {
            Logger.error('環境檢查發現問題，請修正後再繼續');
        }
        
        return allPassed;
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const passed = await VersionChecker.performFullCheck();
    process.exit(passed ? 0 : 1);
}
