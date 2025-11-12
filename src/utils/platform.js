import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

export class PlatformUtils {
    /**
     * 取得作業系統類型
     */
    static getPlatform() {
        const platform = os.platform();
        switch (platform) {
            case 'darwin':
                return 'macos';
            case 'win32':
                return 'windows';
            case 'linux':
                return 'linux';
            default:
                return platform;
        }
    }

    /**
     * 檢查是否為 Windows
     */
    static isWindows() {
        return os.platform() === 'win32';
    }

    /**
     * 檢查是否為 macOS
     */
    static isMacOS() {
        return os.platform() === 'darwin';
    }

    /**
     * 檢查是否為 Linux
     */
    static isLinux() {
        return os.platform() === 'linux';
    }

    /**
     * 正規化路徑（處理不同作業系統的路徑分隔符）
     */
    static normalizePath(filePath) {
        return path.normalize(filePath);
    }

    static getHomeDir() {
        return os.homedir();
    }

    static async commandExists(command) {
        try {
            await this.executeCommand('which', [command]);
            return true;
        } catch {
            return false;
        }
    }

    static async executeCommand(command, args = []) {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, { 
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true 
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
                } else {
                    reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
                }
            });

            child.on('error', reject);
        });
    }


    /**
     * 取得暫存目錄
     */
    static getTempDir() {
        return os.tmpdir();
    }

    /**
     * 執行系統命令
     */
    static async executeCommand(command, args = [], options = {}) {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                stdio: 'pipe',
                ...options
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
                } else {
                    reject(new Error(`Command failed with code ${code}: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * 檢查命令是否存在
     */
    static async commandExists(command) {
        try {
            const checkCommand = this.isWindows() ? 'where' : 'which';
            await this.executeCommand(checkCommand, [command]);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 取得環境變數
     */
    static getEnv(key, defaultValue = null) {
        return process.env[key] || defaultValue;
    }

    /**
     * 設定檔案權限（僅 Unix 系統）
     */
    static async setFilePermissions(filePath, mode = 0o755) {
        if (!this.isWindows()) {
            const fs = await import('fs/promises');
            await fs.chmod(filePath, mode);
        }
    }
}
