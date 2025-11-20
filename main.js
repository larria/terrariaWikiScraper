const { spawn } = require('child_process');
const path = require('path');

// 定义执行顺序和脚本文件名
const STEPS = [
    { 
        name: "阶段一：抓取结构化数据 (Cargo)", 
        script: 'scraper.js' 
    },
    { 
        name: "阶段二：构建全站页面地图", 
        script: 'step1_get_map.js' 
    },
    { 
        name: "阶段三：批量下载页面源码 (Wikitext)", 
        script: 'step2_dump_text.js' 
    }
];

/**
 * 运行单个脚本的辅助函数
 * 使用 spawn 启动子进程，并将子进程的日志直接输出到主终端
 */
function runScript(scriptName, stepName) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, scriptName);
        console.log(`\n\n=========================================`);
        console.log(`>>> 开始执行: ${stepName}`);
        console.log(`>>> 脚本文件: ${scriptName}`);
        console.log(`=========================================\n`);

        // 启动子进程: node scriptName
        // stdio: 'inherit' 意味着子进程的 console.log 直接显示在当前窗口
        const child = spawn('node', [scriptPath], { stdio: 'inherit' });

        child.on('error', (err) => {
            console.error(`!!! 无法启动脚本 ${scriptName}:`, err);
            reject(err);
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`\n>>> ${stepName} 执行成功 (Exit Code: 0)`);
                resolve();
            } else {
                console.error(`\n!!! ${stepName} 执行失败 (Exit Code: ${code})`);
                // 如果你希望某个步骤失败后继续执行后续步骤，这里可以 resolve() 而不是 reject()
                reject(new Error(`Script ${scriptName} failed`));
            }
        });
    });
}

// 主流程控制
(async () => {
    const startTime = Date.now();
    console.log("🚀 Terraria Wiki 全站爬取任务启动...");

    try {
        // 依次执行每个步骤
        for (const step of STEPS) {
            await runScript(step.script, step.name);
            
            // 步骤之间稍微休息一下，给系统喘息时间
            console.log("... 等待 3 秒后进入下一阶段 ...");
            await new Promise(r => setTimeout(r, 3000));
        }

        const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
        console.log(`\n✅✅✅ 所有任务圆满完成！总耗时: ${duration} 分钟`);
        console.log(`📂 数据已保存在 ./data 目录下`);

    } catch (error) {
        console.error("\n❌❌❌ 任务流中断:", error.message);
        process.exit(1);
    }
})();