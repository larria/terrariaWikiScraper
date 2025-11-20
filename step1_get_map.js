const fs = require('fs');

const CONFIG = {
    apiBase: 'https://terraria.wiki.gg/zh/api.php',
    outputFile: './data/all_pages.json',
    limit: 500, // 每次请求获取500个标题
};

// 复用之前的 Fetch 函数 (包含 User-Agent 防止被拒)
async function fetchApi(params) {
    const url = `${CONFIG.apiBase}?${new URLSearchParams({ format: 'json', ...params }).toString()}`;
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 TerrariaScraper/1.0' }
        });
        return await res.json();
    } catch (e) {
        console.error("Request Failed:", e);
        return null;
    }
}

(async () => {
    console.log("=== 开始构建页面地图 ===");
    
    let allTitles = [];
    let apcontinue = null;
    let hasMore = true;

    while (hasMore) {
        const params = {
            action: 'query',
            list: 'allpages',
            aplimit: CONFIG.limit,
            apnamespace: 0, // 0 代表“主命名空间” (正文)，如果你想要“分类”页，填 14
        };

        if (apcontinue) params.apcontinue = apcontinue;

        const data = await fetchApi(params);
        
        if (!data || !data.query || !data.query.allpages) break;

        const pages = data.query.allpages;
        const titles = pages.map(p => p.title);
        allTitles = allTitles.concat(titles);

        process.stdout.write(`   已发现 ${pages.length} 个页面... (总计: ${allTitles.length})\r`);

        // 检查是否有下一页
        if (data.continue && data.continue.apcontinue) {
            apcontinue = data.continue.apcontinue;
        } else {
            hasMore = false;
        }
    }

    console.log(`\n\n√ 地图构建完成，共发现 ${allTitles.length} 个页面`);
    
    // 保存文件
    if (!fs.existsSync('./data')) fs.mkdirSync('./data');
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(allTitles, null, 2));
    console.log(`√ 列表已保存至 ${CONFIG.outputFile}`);
})();