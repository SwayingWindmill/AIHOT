// 这个行业的分类体系：类别、标签词表、机构（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。
//
// 主体是机构（繁育基地、动物园、保护区），不是单只大熊猫：大熊猫有近千只，全列进每次调用的提示词太长。
// 单只大熊猫由吱熊猫的采集词表打上（raw.pandaSlugs），之后由吱熊猫的接口解析。
import { INSTITUTIONS } from "./institutions.ts";

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出日常类：日报写过的事又有日常类的后续报道（比如出生消息之后的幼崽视频），只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进最后一节（日常）。
 * tagColor 是飞书推送卡片里跟在标题后面的这一类小标签的颜色（飞书 text_tag 的颜色名）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。
 */
export const CATEGORIES = [
  { key: "breeding", tagColor: "carmine", label: "繁育", feedLabel: "繁育与幼崽", section: "繁育与成长", guide: "机构确认的配种、怀孕、产仔、双胞胎，以及幼崽的满月、百天、断奶、离开妈妈独立生活等成长节点。粉丝猜测的“疑似怀孕”不算确认；幼崽的日常萌态视频归日常。" },
  { key: "health", tagColor: "red", label: "健康", feedLabel: "健康与离世", section: "健康与离世", guide: "机构通报的疾病、受伤、治疗、体检结果、衰老护理，以及大熊猫离世和讣告。离世周年、生日回顾和悼念帖不是新的离世，归日常；粉丝凭视频推测的健康问题没有机构说明时，不当作病情。" },
  { key: "moves", tagColor: "orange", label: "迁移", feedLabel: "迁移与旅外", section: "迁移与旅外", guide: "大熊猫在机构之间转运、赴海外合作、旅外大熊猫回国、隔离检疫、入住新馆和与公众见面。写明是宣布、启程还是已经抵达；海外回国以接收的国内基地公告为准。" },
  { key: "naming", tagColor: "yellow", label: "命名", section: "繁育与成长", guide: "机构正式公布的名字和命名仪式。征名投票、候选名和粉丝起的昵称还不是正式名字，征名活动本身归场馆。" },
  { key: "venue", tagColor: "turquoise", label: "场馆", feedLabel: "场馆动态", section: "场馆动态", guide: "机构的开放时间、闭馆、限流、票务、预约规则、新展区、活动和征名等面向游客的公告。讲的是某只大熊猫的转运或健康时按那件事归类，不因发布方是场馆归到这里。" },
  { key: "conservation", tagColor: "green", label: "科研保护", feedLabel: "科研与野外", section: "保护与政策", guide: "科研论文和繁育技术、野化培训与放归、野外调查、红外相机拍到的野生大熊猫、栖息地和种群数据。圈养个体的日常不算科研；政府文件和合作协议归政策。" },
  { key: "policy", tagColor: "indigo", label: "政策合作", feedLabel: "政策与合作", section: "保护与政策", guide: "国家公园、保护法规、主管部门的通报与处罚，以及中外大熊猫保护合作协议的签署、续约和到期。具体某只大熊猫按协议启程或回国归迁移。" },
  { key: "daily", tagColor: "violet", label: "日常", feedLabel: "熊猫日常", section: "日常", guide: "饲养员和机构发布的日常生活、吃竹子、玩耍、丰容、生日会、季节活动，周年纪念和回顾，以及科普和解读。日常可爱是正当内容，但不把日常镜头写成健康、怀孕或转运的消息。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布：日报报头的“N 则出生消息”、改分类后修订已出的报告都按它数。
 * 按条数，不按只数：一则双胞胎消息算一则。category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "breeding", tag: "出生", unit: "则出生消息" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["大熊猫", "熊猫", "幼崽", "饲养员", "基地", "动物园", "旅外", "国宝"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["birth_breeding", "health_death", "relocation", "naming", "venue_notice", "research_conservation", "policy_cooperation", "daily_life", "explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "出生", "配种/怀孕", "幼崽成长", "健康", "离世", "迁移", "回国", "命名", "场馆公告", "活动", "科研", "野外/放归", "政策/合作", "日常", "纪念/回顾", "科普",
  "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "双胞胎", "幼崽", "老年大熊猫", "旅外大熊猫", "秦岭大熊猫", "生日", "饮食", "丰容", "野化培训", "国家公园", "熊猫外交", "饲养员", "直播", "游客文明",
] as const;

/** 卡片上显示成标签的机构：主体是这家机构的报道会带上它（ENTITIES 的 displayTag）。 */
const DISPLAY_TAGS: Readonly<Record<string, string>> = {
  "chengdu-research-base": "成都大熊猫基地",
  ccrcgp: "中国大熊猫保护研究中心",
  "beijing-zoo": "北京动物园",
  "chongqing-zoo": "重庆动物园",
  "shanghai-wild-animal-park": "上海野生动物园",
  "qinling-panda-research-center": "秦岭大熊猫研究中心",
  "ocean-park-hong-kong": "香港海洋公园",
  "giant-panda-national-park": "大熊猫国家公园",
  "smithsonian-national-zoo": "史密森国家动物园",
  "san-diego-zoo": "圣地亚哥动物园",
  "ueno-zoo": "上野动物园",
};

/** 可选的实体标签（机构）。 */
export const ENTITY_TAGS: readonly string[] = Object.values(DISPLAY_TAGS);

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  诞生: "出生", 产仔: "出生", 新生: "出生", 新生幼崽: "出生", 降生: "出生", 繁育: "配种/怀孕", 配种: "配种/怀孕", 怀孕: "配种/怀孕", 发情: "配种/怀孕",
  成长: "幼崽成长", 满月: "幼崽成长", 百天: "幼崽成长", 断奶: "幼崽成长", 独立: "幼崽成长",
  生病: "健康", 疾病: "健康", 治疗: "健康", 体检: "健康", 受伤: "健康", 去世: "离世", 死亡: "离世", 病逝: "离世", 讣告: "离世",
  转运: "迁移", 搬家: "迁移", 出国: "迁移", 入住: "迁移", 隔离: "迁移", 检疫: "迁移", 归国: "回国", 回家: "回国",
  起名: "命名", 取名: "命名", 名字: "命名", 公告: "场馆公告", 开放: "场馆公告", 闭馆: "场馆公告", 票务: "场馆公告", 预约: "场馆公告",
  研究: "科研", 论文: "科研", 野生: "野外/放归", 野外: "野外/放归", 放归: "野外/放归", 红外相机: "野外/放归",
  政策: "政策/合作", 合作: "政策/合作", 法规: "政策/合作", 协议: "政策/合作", 萌: "日常", 吃播: "日常", 纪念: "纪念/回顾", 周年: "纪念/回顾", 回顾: "纪念/回顾",
  知识: "科普", 解读: "科普", 海外: "旅外大熊猫", 旅外: "旅外大熊猫", 秦岭: "秦岭大熊猫", 竹子: "饮食", 老年: "老年大熊猫",
};

// ── 机构与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 机构主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * id 是吱熊猫的机构 slug（industry/institutions.ts，由 build-institutions.ts 生成）。
 * aliases 给结构抽取模型看（提示词里每家只列前三个），所有名字都用来认出说的是哪家机构。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = Object.fromEntries(
  INSTITUTIONS.map((i) => [i.id, { name: i.nameZh, displayTag: DISPLAY_TAGS[i.id] ?? null, aliases: [...i.aliases] }]),
);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 拉丁字母的名字按整词认，中文名按字面认。 */
const namePattern = (names: readonly string[]) =>
  new RegExp(names.map((n) => (/^[\x20-\x7e]+$/.test(n) ? `(?<![A-Za-z])${escape(n)}(?![A-Za-z])` : escape(n))).join("|"), "i");

/**
 * 身份词典：摘要和标题里出现的机构，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴，
 * 比如把卧龙的消息写成成都基地）。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = INSTITUTIONS.map((i) => ({
  id: i.id, name: i.nameZh, patterns: [namePattern(i.aliases)],
}));

/** 这些域名上的文章，发布方就是对应的机构。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = INSTITUTIONS.filter((i) => i.domains.length > 0).map((i) => ({
  entityId: i.id, domains: i.domains,
}));

/** 原文里的这些写法也算提到了对应机构。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
