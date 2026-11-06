# 行业包

这是吱熊猫动态的大熊猫行业包：分类、主题、信源、精选标准和门槛。换一个行业，主要就是改这个文件夹和 [`site/`](../site/)（站名、文案、品牌和页面），步骤见 [把它改成你的行业](../docs/customize.md)。

| 文件 | 内容 |
|---|---|
| `taxonomy.ts` | 分类、标签、机构主体、防止模型写错机构的词表，报头上数的出生消息（`RELEASE`） |
| `institutions.ts` | 机构名录，由 `build-institutions.ts` 生成，不要手改 |
| `build-institutions.ts` | 生成机构名录：`node industry/build-institutions.ts --zhipanda <吱熊猫仓库>`。读吱熊猫的 `data/curation/institutions/institutions.json` 和这里的 `institutions-extra.json`，再列出吱熊猫采集目标里的官方账号和熊猫居住地中名录还认不出的 |
| `institutions-extra.json` | 生成名录的另一份输入：各机构的别名和官网域名，以及吱熊猫还没有 slug 的机构（slug 是提议，吱熊猫加这家机构时用同一个） |
| `topics.json` | 主题目录（`/topics`），站点启动时读取 |
| `sources.json` | 首次启动时导入的示范信源 |
| `prompts/` | 每一步的提示词：预筛、评分、写作、结构化、归组、事件综述、周报月报、翻译 |
| `selection.ts` | 入选门槛（还没有用大熊猫样本校准） |
| `gold.example.jsonl` | 精选评测样本的格式示例 |
| `relation-gold.example.jsonl` | 事件关系评测样本的格式示例 |
| `story-digest-eval.example.jsonl` | 事件综述评测案例的格式示例 |
