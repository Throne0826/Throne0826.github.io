import { parse as parseYaml } from "yaml";

export function parsePostMetadata(content, fallbackName) {
  const fallbackTitle = fallbackName.replace(/\.md$/i, "");
  const frontMatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontMatter) return { title: fallbackTitle, date: "" };
  try {
    const data = parseYaml(frontMatter[1]) || {};
    return {
      title: String(data.title || fallbackTitle),
      date: data.date instanceof Date ? data.date.toISOString() : String(data.date || "")
    };
  } catch {
    return { title: fallbackTitle, date: "" };
  }
}
