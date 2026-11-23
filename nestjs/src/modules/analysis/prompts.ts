export function summaryPrompt(content: string): string {
  return (
    "请对以下文档进行结构化摘要，使用 Markdown 格式输出。" +
    "要求：\n" +
    "1. 首先用一句话概括文档主题\n" +
    "2. 然后分 3-5 个核心要点（加粗标题 + 简洁说明）\n" +
    "3. 最后给出一句总结\n" +
    "只输出 Markdown 正文，不要额外解释。\n\n" +
    "文档内容：\n\n" +
    content
  );
}

export function mindMapPrompt(content: string): string {
  return (
    "Generate a mind map structure based on the following text. " +
    "The output must be a valid JSON object strictly following this format: " +
    '{ "root": { "data": { "text": "Main Topic" }, "children": [ { "data": { "text": "Subtopic" }, "children": [] } ] } }. ' +
    "Do not include any markdown formatting (like ```json). Just the raw JSON string. " +
    "Text content: \n\n" +
    content
  );
}
