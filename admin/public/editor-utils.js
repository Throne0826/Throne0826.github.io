function pad(value) {
  return String(value).padStart(2, "0");
}

export function splitMarkdown(markdown, maxLength = 3800) {
  const lines = markdown.match(/[^\n]*\n|[^\n]+$/g) || [];
  const chunks = [];
  let current = "";
  let fence = "";
  for (const line of lines) {
    const marker = line.trimStart().match(/^(```|~~~)/)?.[1] || "";
    current += line;
    if (marker) fence = fence ? (marker === fence ? "" : fence) : marker;
    if (!fence && current.length >= maxLength && (line.trim() === "" || current.length >= maxLength * 1.25)) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [markdown];
}

export function preserveOuterWhitespace(source, transformed) {
  const leading = source.match(/^\s*/)?.[0] || "";
  const trailing = source.match(/\s*$/)?.[0] || "";
  return `${leading}${String(transformed || "").trim()}${trailing}`;
}

export function cleanSummary(value) {
  const summary = String(value || "")
    .replace(/^["'“”\s]*(?:摘要|description)\s*[:：]\s*/i, "")
    .replace(/["'“”\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const characters = Array.from(summary);
  if (characters.length <= 100) return summary;
  const shortened = characters.slice(0, 100).join("");
  const sentenceEnd = Math.max(shortened.lastIndexOf("。"), shortened.lastIndexOf("！"), shortened.lastIndexOf("？"));
  return sentenceEnd >= 50 ? shortened.slice(0, sentenceEnd + 1) : shortened;
}

export function upsertDescription(markdown, summary) {
  const escaped = summary.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const field = `description: "${escaped}"`;
  const frontMatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontMatter) return `---\n${field}\n---\n\n${markdown}`;
  const pattern = /^description\s*:[^\n]*(?:\n[ \t]+[^\n]*)*/m;
  const body = pattern.test(frontMatter[1]) ? frontMatter[1].replace(pattern, field) : `${frontMatter[1]}\n${field}`;
  return `---\n${body}\n---${markdown.slice(frontMatter[0].length)}`;
}

export function slugifyTitle(title) {
  return title.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-").slice(0, 80) || "new-post";
}

export function createNewPost(now = new Date(), title = "新文章") {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const stamp = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return {
    path: `source/_posts/${date}-${stamp}-${slugifyTitle(title)}.md`,
    content: `---\ntitle: ${title}\ndate: ${date} ${time}\nmathjax: true\ntags:\n  - \ncategories:\n  - \n---\n\n# ${title}\n\n`
  };
}

function postTimestamp(post) {
  const parsed = Date.parse(post.date || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortPosts(posts, sort) {
  return [...posts].sort((a, b) => {
    if (sort === "date-desc" || sort === "date-asc") {
      const order = postTimestamp(a) - postTimestamp(b);
      return sort === "date-desc" ? -order : order;
    }
    const order = a.name.localeCompare(b.name, "zh-CN");
    return sort === "name-desc" ? -order : order;
  });
}

export function isDocumentVersionCurrent(baseContent, basePath, currentContent, currentPath) {
  return baseContent === currentContent && basePath === currentPath;
}
