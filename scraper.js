const fs = require('fs');
const path = require('path');

const CONFIG = {
    apiBase: 'https://terraria.wiki.gg/zh/api.php',
    outputDir: './data',
    limit: 500,
    // 基础请求间隔 (毫秒)
    delay: 1500, 
    // 表与表之间的冷却时间 (毫秒) - 关键修改
    tableCooldown: 5000,
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// 通用 API 请求函数 (带 429 智能处理)
async function fetchApi(params, method = 'GET', retryCount = 0) {
    const url = CONFIG.apiBase;
    let options = { 
        method,
        headers: {
            // 伪装 User-Agent，防止被当作低级爬虫直接拒绝
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NodeScraper/1.0'
        }
    };

    if (method === 'GET') {
        const searchParams = new URLSearchParams({ format: 'json', ...params });
        var fullUrl = `${url}?${searchParams.toString()}`;
    } else {
        var fullUrl = url;
        options.body = new URLSearchParams({ format: 'json', ...params });
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    }

    try {
        const response = await fetch(fullUrl, options);
        
        // === 核心修改：专门处理 429 限流 ===
        if (response.status === 429) {
            // 第一次等 10秒，第二次等 20秒，第三次等 30秒
            const waitTime = (retryCount + 1) * 10000; 
            console.warn(`   !!! 触发服务器限流 (429)，暂停 ${waitTime/1000} 秒冷却...`);
            await sleep(waitTime);
            // 增加最大重试次数到 5 次
            if (retryCount < 5) {
                return fetchApi(params, method, retryCount + 1);
            } else {
                throw new Error("429 限流重试次数过多，放弃本次请求");
            }
        }

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
            // 如果是特定的数据库繁忙错误，也等待
            if (data.error.code === 'maxlag') {
                 console.warn("   !!! 服务器繁忙 (maxlag)，等待 5 秒...");
                 await sleep(5000);
                 return fetchApi(params, method, retryCount + 1);
            }
            throw new Error(`API Error: ${data.error.code}`);
        }

        return data;
    } catch (error) {
        console.error(`   X 请求失败: ${error.message}`);
        if (retryCount < 3) { // 普通错误的重试逻辑
            console.log(`   ...等待 3 秒后重试 (${retryCount + 1}/3)`);
            await sleep(3000);
            return fetchApi(params, method, retryCount + 1);
        }
        return null;
    }
}

// 1. 获取所有表名
async function getCargoTableList() {
    console.log("步骤 1: 获取 Cargo 表列表...");
    const data = await fetchApi({ action: 'cargotables', limit: 500 });
    if (!data || !data.cargotables) return [];
    return data.cargotables
        .map(t => (typeof t === 'string' ? t : t.Name || t.title || t.name))
        .filter(name => name);
}

// 2. 获取字段
async function getTableFields(tableName) {
    const data = await fetchApi({ action: 'cargofields', table: tableName });
    if (!data || !data.cargofields) return [];

    const fields = [];
    if (!Array.isArray(data.cargofields)) {
        fields.push(...Object.keys(data.cargofields));
    } else {
        fields.push(...data.cargofields.map(f => f.Name || f.field || f));
    }
    if (!fields.includes('_pageName')) fields.unshift('_pageName');
    return fields;
}

// 3. 下载数据
async function dumpCargoTable(tableName) {
    if (!tableName) return;
    
    const fieldList = await getTableFields(tableName);
    if (fieldList.length === 0) {
        console.log(`   跳过表 [${tableName}] (无字段)`);
        return;
    }
    
    const fieldsParam = fieldList.join(',');
    console.log(`>>> 正在下载表: [${tableName}] (${fieldList.length} 个字段)`);
    
    let allRows = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const data = await fetchApi({
            action: 'cargoquery',
            tables: tableName,
            fields: fieldsParam, 
            limit: CONFIG.limit,
            offset: offset,
            order_by: '_pageName'
        }, 'POST');

        if (!data || !data.cargoquery || data.cargoquery.length === 0) {
            hasMore = false;
            break;
        }

        const rows = data.cargoquery.map(item => item.title);
        allRows = allRows.concat(rows);

        process.stdout.write(`   已获取 ${rows.length} 条... (累计: ${allRows.length})\r`);

        if (rows.length < CONFIG.limit) {
            hasMore = false;
        } else {
            offset += CONFIG.limit;
            // 页内延迟
            await sleep(CONFIG.delay);
        }
    }

    console.log(`\n   √ 表 [${tableName}] 下载完成，共 ${allRows.length} 行`);
    
    const filePath = path.join(CONFIG.outputDir, 'cargo_tables', `${tableName}.json`);
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(allRows, null, 2));
}

(async () => {
    console.log("=== Terraria Wiki 爬虫 V5 (防封版) 启动 ===");
    ensureDir(CONFIG.outputDir);

    const tables = await getCargoTableList();

    console.log(`=== 发现 ${tables.length} 个表，开始任务 ===\n`);

    for (const tableName of tables) {
        if (tableName.startsWith('_')) continue;
        
        // 检查文件是否已经存在，如果存在且数据量不为0，可以选择跳过（断点续传的基础）
        // const filePath = path.join(CONFIG.outputDir, 'cargo_tables', `${tableName}.json`);
        // if (fs.existsSync(filePath)) { console.log(`跳过已存在: ${tableName}`); continue; }

        await dumpCargoTable(tableName);
        
        // === 关键：每下载完一张表，强制休息 ===
        console.log(`   [系统冷却] 表 [${tableName}] 处理完毕，休息 ${CONFIG.tableCooldown/1000} 秒...`);
        await sleep(CONFIG.tableCooldown);
    }

    console.log("\n=== 全部完成 ===");
})();