# Terraria Wiki Scraper (Node.js)

这是一个基于 Node.js 原生 API 开发的 **Terraria (Wiki.gg)** 全站爬虫。它能够自动化抓取结构化的游戏数据（物品、NPC、掉落表等）以及非结构化的页面源码（攻略、背景故事等）。

## 🚀 项目特点

*   **零依赖**：基于 Node.js (v18+) 原生 `fetch` 和 `child_process` 实现，无需 `npm install` 任何第三方库。
*   **双模抓取**：
    *   **Cargo 模式**：利用 MediaWiki 的 Cargo 插件接口，像查询数据库一样批量导出结构化数据 (JSON)。
    *   **Wikitext 模式**：利用 MediaWiki API 批量下载页面原始 Wikitext (TXT)。
*   **智能防封**：
    *   自动处理 `HTTP 429 (Too Many Requests)`，指数退避重试。
    *   自动识别 Cargo 表字段（先嗅探后查询），解决 API 禁止通配符 `*` 的问题。
    *   支持断点续传（跳过已存在文件）。

## 🛠️ 环境要求

*   **Node.js**: Version **18.0.0** 或更高版本 (必须支持原生 `fetch`)。
*   **网络**: 能够访问 `https://terraria.wiki.gg/` (如果网络环境特殊，请确保终端 Shell 已配置代理环境变量)。

## 📂 项目结构

```text
.
├── main.js               # 【主入口】一键启动所有流程
├── scraper.js            # 核心脚本1：抓取 Cargo 结构化数据 (Items, NPCs, Drops...)
├── step1_get_map.js      # 核心脚本2：遍历全站获取所有页面标题列表
├── step2_dump_text.js    # 核心脚本3：根据列表批量下载 Wikitext 源码
├── data/                 # [自动生成] 数据存储目录
│   ├── cargo_tables/     # 存放 JSON 格式的属性数据
│   ├── raw_wikitext/     # 存放 TXT 格式的页面源码
│   └── all_pages.json    # 全站页面标题索引
└── README.md             # 说明文档
```

## ⚡️ 快速开始

### 方式一：一键全量抓取（推荐）

直接运行主程序，它会按顺序自动执行三个阶段的任务：

```bash
node main.js
```

*程序运行过程中会自动创建 `data` 目录，并在控制台输出实时进度。*

### 方式二：分步手动执行

如果你只需要某一部分数据，可以单独运行对应的脚本：

**1. 获取结构化数据 (JSON)**
抓取物品属性、怪物数值、合成表等数据库表格。
```bash
node scraper.js
```

**2. 构建全站地图**
获取 Wiki 上所有页面的标题列表（生成 `data/all_pages.json`）。
```bash
node step1_get_map.js
```

**3. 下载页面文本**
根据上一步生成的列表，批量下载页面的源代码。
```bash
node step2_dump_text.js
```

---

## 📊 输出数据说明

### 1. `data/cargo_tables/*.json`
这是最有价值的数据。文件名为表名，内容为对象数组。
*   **Items.json**: 包含物品 ID、伤害、稀有度、买卖价格等。
*   **NPCs.json**: 包含怪物血量、防御、AI 类型等。
*   **Drops.json**: 包含怪物掉落物品的关联数据和概率。
*   **Recipes.json**: 包含合成配方。

**示例 (Items.json):**
```json
[
  {
    "_pageName": "泰拉刃",
    "itemid": "757",
    "name": "Terra Blade",
    "damage": "115",
    "rarity": "Yellow"
  },
  ...
]
```

### 2. `data/raw_wikitext/*.txt`
这是页面的原始维基代码。如果你需要提取“物品描述”、“攻略文本”或“更新历史”，需要解析这些文件。文件名已做去特殊字符处理（如 `:` 替换为 `_`）。

**示例 (指南_史莱姆皇后攻略.txt):**
```wikitext
{{Guide/Loadout|...}}
== 战斗 ==
史莱姆皇后的攻击模式比较固定...
```

---

## ⚠️ 开发与迭代注意事项

如果你计划维护或扩展此项目，请务必阅读以下内容：

### 1. 关于 Cargo 查询策略 (scraper.js)
*   **字段嗅探**: 代码中使用了 `action=cargofields` 先获取字段名，再拼接字段进行 `action=cargoquery`。
    *   *原因*: Wiki.gg 禁用了 `SELECT *` 或 `fields=*` 的通配符查询，直接查询会报错 `MWException`。
    *   *注意*: 如果某张表新增了字段，重新运行脚本会自动获取新字段，无需修改代码。

### 2. 关于 429 限流 (Rate Limiting)
*   **症状**: 控制台出现 `HTTP Error: 429`。
*   **当前策略**: 代码中实现了“指数退避”机制（等待 10s -> 20s -> 30s）。
*   **建议**: 如果数据量急剧增加导致频繁被封，建议：
    *   增大 `CONFIG.delay`（当前为 1500ms）。
    *   增大 `CONFIG.tableCooldown`（表与表之间的休息时间）。
    *   在 `fetchApi` 函数中引入代理池（Proxy Pool）。

### 3. 数据解析 (Next Step)
本项目目前的产物是 **Raw Data** (JSON 和 Wikitext)。
*   **JSON 数据**: 可以直接导入 MongoDB 或 SQLite 使用。
*   **Wikitext 数据**: 目前还是纯文本。若要提取其中的结构化信息（如非 Cargo 存储的 InfoBox），建议引入 **`wikitextparser`** 或 **`mwparserfromhell`** 库进行二次清洗。

### 4. 文件系统限制
*   `raw_wikitext` 目录下可能会有 30,000+ 个小文件。
*   *注意*: 在某些操作系统（如 Windows）上，打开包含数万个文件的文件夹可能会变卡。
*   *未来优化*: 考虑将下载的文本直接存入 SQLite 数据库的一个大表中，而不是存为零散的 TXT 文件。

## 📝 免责声明

本项目仅用于学习交流及个人数据备份。请遵守 [Wiki.gg 的服务条款](https://wiki.gg/terms-of-service) 和 `robots.txt` 规定。请勿高频并发请求以避免对 Wiki 服务器造成压力。