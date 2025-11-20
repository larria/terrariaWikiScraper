const fs = require('fs');
const path = require('path');

const CONFIG = {
    apiBase: 'https://terraria.wiki.gg/zh/api.php',
    inputList: './data/all_pages.json',
    outputDir: './data/raw_wikitext',
    batchSize: 50, // 一次请求下载 50 个页面 (MediaWiki 推荐值)
    delay: 2000,   // 批次间隔 2秒
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

// 文件名清洗函数 (把 : / ? * 等非法字符换成下划线)
const sanitizeName = (name) => name.replace(/[\\/:*?"<>|]/g, '_');

async function fetchApi(params, retryCount = 0) {
    const url = CONFIG.apiBase;
    const options = {
        method: 'POST', // 必须用 POST，因为 50 个标题拼起来很长
        headers: {
            'User-Agent': 'Mozilla/5.0 TerrariaScraper/1.0',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({ format: 'json', ...params })
    };

    try {
        const res = await fetch(url, options);
        
        if (res.status === 429) {
            const wait = (retryCount + 1) * 5000;
            console.warn(`   [429 限流] 休息 ${wait/1000} 秒...`);
            await sleep(wait);
            return fetchApi(params, retryCount + 1);
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error.code);
        return data;
    } catch (e) {
        console.error(`   X 请求失败: ${e.message}`);
        if (retryCount < 3) {
            await sleep(3000);
            return fetchApi(params, retryCount + 1);
        }
        return null;
    }
}

async function downloadBatch(titles) {
    // 拼接标题： A|B|C
    const titlesParam = titles.join('|');
    
    const data = await fetchApi({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content', // 获取内容
        titles: titlesParam
    });

    if (!data || !data.query || !data.query.pages) return;

    const pages = data.query.pages; // 这是一个对象 { pageId: content }

    // 遍历返回的页面并保存
    for (const pageId in pages) {
        const page = pages[pageId];
        if (page.missing) continue; // 页面不存在（极少见）

        const title = page.title;
        const content = page.revisions ? page.revisions[0]['*'] : '';

        // 保存
        const fileName = sanitizeName(title) + '.txt';
        fs.writeFileSync(path.join(CONFIG.outputDir, fileName), content);
    }
    
    console.log(`   √ 已保存 ${Object.keys(pages).length} 个页面`);
}

(async () => {
    console.log("=== 开始批量下载 Wikitext ===");
    ensureDir(CONFIG.outputDir);

    // 1. 读取标题列表
    if (!fs.existsSync(CONFIG.inputList)) {
        console.error("找不到 all_pages.json，请先运行 step1");
        return;
    }
    const allTitles = JSON.parse(fs.readFileSync(CONFIG.inputList, 'utf-8'));
    
    // 2. 分批处理
    const total = allTitles.length;
    console.log(`加载了 ${total} 个标题，准备下载...`);

    for (let i = 0; i < total; i += CONFIG.batchSize) {
        const batch = allTitles.slice(i, i + CONFIG.batchSize);
        
        console.log(`>>> 正在处理第 ${i + 1} - ${Math.min(i + CONFIG.batchSize, total)} 个页面...`);
        
        // 检查这批文件是否都已经存在 (断点续传优化)
        // 只要这批里有一个文件没下载，就发起请求。如果全都有，就跳过。
        const allExists = batch.every(t => fs.existsSync(path.join(CONFIG.outputDir, sanitizeName(t) + '.txt')));
        
        if (allExists) {
            console.log("   [跳过] 本批次文件已存在");
            continue;
        }

        await downloadBatch(batch);
        
        // 批次间隔休息
        await sleep(CONFIG.delay);
    }

    console.log("\n=== 全部下载完成 ===");
})();