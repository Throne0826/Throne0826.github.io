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

function normalizeMetadataList(value, limit) {
  const items = Array.isArray(value) ? value : String(value || "").split(/[,，、]/);
  const normalized = [];
  for (const item of items) {
    const cleaned = String(item || "")
      .replace(/^#+\s*/, "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 40);
    if (!cleaned || normalized.some((existing) => existing.toLowerCase() === cleaned.toLowerCase())) continue;
    normalized.push(cleaned);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

export function parseArticleMetadata(value) {
  const source = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return { description: "", tags: [], categories: [] };

  try {
    const data = JSON.parse(source.slice(start, end + 1));
    return {
      description: cleanSummary(data.description ?? data.summary ?? data["摘要"]),
      tags: normalizeMetadataList(data.tags ?? data["标签"], 6),
      categories: normalizeMetadataList(data.categories ?? data.category ?? data["分类"], 2)
    };
  } catch {
    return { description: "", tags: [], categories: [] };
  }
}

function yamlQuoted(value) {
  return JSON.stringify(String(value || ""));
}

function replaceFrontMatterField(lines, key, replacementLines) {
  const fieldPattern = new RegExp(`^${key}\\s*:`);
  const topLevelPattern = /^[A-Za-z_][A-Za-z0-9_-]*\s*:/;
  const start = lines.findIndex((line) => fieldPattern.test(line));
  if (start < 0) {
    lines.push(...replacementLines);
    return;
  }

  let end = start + 1;
  while (end < lines.length && !topLevelPattern.test(lines[end])) end += 1;
  lines.splice(start, end - start, ...replacementLines);
}

export function upsertArticleMetadata(markdown, metadata) {
  const description = cleanSummary(metadata?.description);
  const tags = normalizeMetadataList(metadata?.tags, 6);
  const categories = normalizeMetadataList(metadata?.categories, 2);
  const fields = [
    [`description: ${yamlQuoted(description)}`],
    ["tags:", ...tags.map((tag) => `  - ${yamlQuoted(tag)}`)],
    ["categories:", ...categories.map((category) => `  - ${yamlQuoted(category)}`)]
  ];
  const frontMatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!frontMatter) {
    return `---\n${fields.flat().join("\n")}\n---\n\n${markdown}`;
  }

  const lines = frontMatter[1].split(/\r?\n/);
  replaceFrontMatterField(lines, "description", fields[0]);
  replaceFrontMatterField(lines, "tags", fields[1]);
  replaceFrontMatterField(lines, "categories", fields[2]);
  return `---\n${lines.join("\n")}\n---${markdown.slice(frontMatter[0].length)}`;
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
