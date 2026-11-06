// 读者看得到的文字里本站不用的词，每项是要找的写法和改法（例如 [/重磅|炸裂/u, "不用夸张的说法，直接写发生了什么"]）。
// 写作那一步写完中文标题、摘要和推荐理由后逐个查，用了就让模型只改这些地方一次（packages/backend/src/editorial/
// analyze.ts 的 mendWording）。只列一眼就能判断的写法：拿不准的不列，否则会误改正常的词。空着就不查。

export const READER_WORDING: ReadonlyArray<readonly [RegExp, string]> = [
  [/萌翻|萌化|萌哭|炸裂|破防|泪目|心疼哭/u, "不用夸张和渲染情绪的说法，直接写发生了什么"],
  [/滚滚|胖达|团子/u, "写“大熊猫”或它的名字，不用网络叫法"],
];
