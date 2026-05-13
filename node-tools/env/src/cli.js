#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { EnvManager } from './manager.js';
import { BackupManager } from './backup.js';
import { Logger } from './utils/logger.js';

const program = new Command();

// 設定程式資訊
program
    .name('env-manager')
    .description('通用環境檔案管理工具')
    .version('1.0.0');

// 全域選項
program
    .option('-d, --debug', '啟用除錯模式')
    .option('-p, --project-path <path>', '指定專案路徑', process.env.DEVKIT_PROJECT_PATH || process.env.DEVKIT_ORIGINAL_CWD || process.cwd());

// 初始化命令
program
    .command('init')
    .description('初始化環境管理')
    .action(async (_options) => {
        try {
            const projectPath = program.opts().projectPath;
            Logger.info(`初始化環境管理 - 專案路徑: ${projectPath}`);
            
            const manager = new EnvManager(projectPath);
            const current = await manager.current();
            
            if (current) {
                Logger.success('環境管理已初始化');
                console.log(`當前環境: ${current.environment}`);
                console.log(`檔案大小: ${current.size} bytes`);
                console.log(`變數數量: ${current.variableCount}`);
            } else {
                Logger.info('未找到 .env 檔案');
                
                const answer = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'createFromExample',
                    message: '是否要從 .env.example 建立 .env 檔案？',
                    default: true
                }]);
                
                if (answer.createFromExample) {
                    await manager.create('local', '.env.example');
                    await manager.switch('local');
                }
            }
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 建立環境命令
program
    .command('create <name>')
    .description('建立新環境檔案')
    .option('-f, --from <source>', '來源檔案', '.env.example')
    .option('-t, --template', '使用內建範本')
    .action(async (name, options) => {
        try {
            const projectPath = program.opts().projectPath;
            const manager = new EnvManager(projectPath);
            
            const sourceFile = options.template ? 'template' : options.from;
            await manager.create(name, sourceFile);
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 切換環境命令
program
    .command('switch <name>')
    .description('切換到指定環境')
    .action(async (name) => {
        try {
            const projectPath = program.opts().projectPath;
            const manager = new EnvManager(projectPath);
            
            await manager.switch(name);
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 列出環境命令
program
    .command('list')
    .alias('ls')
    .description('列出所有環境檔案')
    .action(async () => {
        try {
            const projectPath = program.opts().projectPath;
            const manager = new EnvManager(projectPath);
            
            const environments = await manager.list();
            
            if (environments.length === 0) {
                Logger.info('未找到環境檔案');
                return;
            }
            
            console.log('\n環境檔案列表:');
            console.log('─'.repeat(80));
            
            for (const env of environments) {
                const current = env.isCurrent ? chalk.green('● ') : '  ';
                const name = env.isCurrent ? chalk.green.bold(env.name) : env.name;
                const size = `${env.size} bytes`;
                const modified = env.modified.toLocaleString('zh-TW');
                
                console.log(`${current}${name.padEnd(20)} ${size.padEnd(15)} ${modified}`);
            }
            
            console.log('─'.repeat(80));
            console.log(`總計: ${environments.length} 個環境檔案`);
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 顯示當前環境命令
program
    .command('current')
    .description('顯示當前環境資訊')
    .action(async () => {
        try {
            const projectPath = program.opts().projectPath;
            const manager = new EnvManager(projectPath);
            
            const current = await manager.current();
            
            if (!current) {
                Logger.info('未找到 .env 檔案');
                return;
            }
            
            console.log('\n當前環境資訊:');
            console.log('─'.repeat(50));
            console.log(`環境: ${chalk.cyan(current.environment)}`);
            console.log(`檔案: ${current.file}`);
            console.log(`大小: ${current.size} bytes`);
            console.log(`變數數量: ${current.variableCount}`);
            console.log(`最後修改: ${current.modified.toLocaleString('zh-TW')}`);
            console.log(`狀態: ${current.valid ? chalk.green('有效') : chalk.red('有錯誤')}`);
            
            if (current.errors.length > 0) {
                console.log('\n錯誤:');
                current.errors.forEach(error => console.log(`  ${chalk.red('✗')} ${error}`));
            }
            
            if (current.warnings.length > 0) {
                console.log('\n警告:');
                current.warnings.forEach(warning => console.log(`  ${chalk.yellow('⚠')} ${warning}`));
            }
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 比較環境差異命令
program
    .command('diff <env1> [env2]')
    .description('比較環境差異')
    .option('-c, --color', '彩色輸出', true)
    .action(async (env1, env2 = 'current', _options) => {
        try {
            const projectPath = program.opts().projectPath;
            const manager = new EnvManager(projectPath);
            
            const differences = await manager.diff(env1, env2);
            
            console.log(`\n比較 ${chalk.cyan(env1)} 與 ${chalk.cyan(env2)} 的差異:`);
            console.log('─'.repeat(80));
            
            // 顯示新增的變數
            if (Object.keys(differences.added).length > 0) {
                console.log(`\n${chalk.green('新增的變數')} (在 ${env2} 中):`);
                for (const [key, value] of Object.entries(differences.added)) {
                    console.log(`  ${chalk.green('+')} ${key}=${value}`);
                }
            }
            
            // 顯示移除的變數
            if (Object.keys(differences.removed).length > 0) {
                console.log(`\n${chalk.red('移除的變數')} (在 ${env2} 中):`);
                for (const [key, value] of Object.entries(differences.removed)) {
                    console.log(`  ${chalk.red('-')} ${key}=${value}`);
                }
            }
            
            // 顯示變更的變數
            if (Object.keys(differences.changed).length > 0) {
                console.log(`\n${chalk.yellow('變更的變數')}:`);
                for (const [key, change] of Object.entries(differences.changed)) {
                    console.log(`  ${chalk.yellow('~')} ${key}:`);
                    console.log(`    ${chalk.red('-')} ${change.from}`);
                    console.log(`    ${chalk.green('+')} ${change.to}`);
                }
            }
            
            // 顯示統計
            const totalChanges = Object.keys(differences.added).length + 
                               Object.keys(differences.removed).length + 
                               Object.keys(differences.changed).length;
            
            console.log(`\n統計: ${totalChanges} 個差異, ${Object.keys(differences.unchanged).length} 個相同`);
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 備份命令群組
const backupCmd = program
    .command('backup')
    .description('備份管理命令');

// 建立備份
backupCmd
    .command('create [name]')
    .description('建立備份')
    .option('-e, --env <envName>', '指定要備份的環境')
    .action(async (customName, options) => {
        try {
            const projectPath = program.opts().projectPath;
            const backupManager = new BackupManager(projectPath);
            
            await backupManager.create(options.env, customName);
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 列出備份
backupCmd
    .command('list')
    .alias('ls')
    .description('列出所有備份')
    .action(async () => {
        try {
            const projectPath = program.opts().projectPath;
            const backupManager = new BackupManager(projectPath);
            
            const backups = await backupManager.list();
            
            if (backups.length === 0) {
                Logger.info('未找到備份檔案');
                return;
            }
            
            console.log('\n備份檔案列表:');
            console.log('─'.repeat(100));
            console.log('環境名稱'.padEnd(15) + '時間戳記'.padEnd(20) + '大小'.padEnd(15) + '建立時間'.padEnd(25) + '年齡');
            console.log('─'.repeat(100));
            
            for (const backup of backups) {
                const envName = backup.envName.padEnd(15);
                const timestamp = backup.timestamp.padEnd(20);
                const size = `${backup.size} bytes`.padEnd(15);
                const created = backup.created.toLocaleString('zh-TW').padEnd(25);
                const age = backup.age;
                
                console.log(`${envName}${timestamp}${size}${created}${age}`);
            }
            
            console.log('─'.repeat(100));
            console.log(`總計: ${backups.length} 個備份檔案`);
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 還原備份
backupCmd
    .command('restore <backupName>')
    .description('從備份還原')
    .action(async (backupName) => {
        try {
            const projectPath = program.opts().projectPath;
            const backupManager = new BackupManager(projectPath);
            
            // 確認操作
            const answer = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: `確定要從備份 ${backupName} 還原嗎？這將覆蓋當前的 .env 檔案。`,
                default: false
            }]);
            
            if (answer.confirm) {
                await backupManager.restore(backupName);
            } else {
                Logger.info('取消還原操作');
            }
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 清理備份
backupCmd
    .command('clean')
    .description('清理舊備份')
    .option('-d, --days <days>', '保留天數', '30')
    .option('-k, --keep <count>', '最小保留數量', '5')
    .action(async (options) => {
        try {
            const projectPath = program.opts().projectPath;
            const backupManager = new BackupManager(projectPath);
            
            const days = parseInt(options.days);
            const keep = parseInt(options.keep);
            
            await backupManager.clean(days, keep);
            
        } catch (error) {
            Logger.error(error.message);
            process.exit(1);
        }
    });

// 設定除錯模式
if (program.opts().debug) {
    process.env.DEBUG = 'true';
}

// 解析命令列參數
program.parse();

// 如果沒有提供命令，顯示幫助
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
