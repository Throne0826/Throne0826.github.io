import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");

const config = {
  port: Number(process.env.PORT || 8787),
  adminToken: process.env.ADMIN_TOKEN || "",
  githubOwner: process.env.GITHUB_OWNER || "Throne0826",
  githubRepo: process.env.GITHUB_REPO || "",
  githubBranch: process.env.GITHUB_BRANCH || "main",
  githubToken: process.env.GITHUB_TOKEN || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
  openaiApiStyle: process.env.OPENAI_API_STYLE || "responses"
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(payload);
}

function getAuthToken(req) {
  const header = req.headers["x-admin-token"];
  return Array.isArray(header) ? header[0] : header || "";
}

function requireAdmin(req, res) {
  if (!config.adminToken) {
    sendJson(res, 500, { error: "ADMIN_TOKEN is not configured on the server." });
    return false;
  }
  if (getAuthToken(req) !== config.adminToken) {
    sendJson(res, 401, { error: "Unauthorized." });
    return false;
  }
  return true;
}

function requireGithubConfig(res) {
  if (!config.githubRepo || !config.githubToken) {
    sendJson(res, 500, {
      error: "GITHUB_REPO and GITHUB_TOKEN must be configured on the server."
    });
    return false;
  }
  return true;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizePostPath(input) {
  const raw = String(input || "").replaceAll("\\", "/").trim();
  const withoutPrefix = raw.replace(/^\/+/, "").replace(/^source\/_posts\//, "");
  const clean = normalize(withoutPrefix).replaceAll("\\", "/");

  if (!clean || clean.startsWith("../") || clean.includes("/../")) {
    throw new Error("Invalid post path.");
  }
  if (!clean.endsWith(".md")) {
    throw new Error("Post path must end with .md.");
  }
  return `source/_posts/${clean}`;
}

function base64EncodeUtf8(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function base64DecodeUtf8(value) {
  return Buffer.from(value.replace(/\n/g, ""), "base64").toString("utf8");
}

async function githubFetch(path, options = {}) {
  const url = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.githubToken}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.message || `GitHub request failed: ${response.status}`);
  }
  return data;
}

async function listPosts() {
  const tree = await githubFetch(`/git/trees/${encodeURIComponent(config.githubBranch)}?recursive=1`);
  return tree.tree
    .filter((item) => item.type === "blob")
    .filter((item) => item.path.startsWith("source/_posts/") && item.path.endsWith(".md"))
    .map((item) => ({
      path: item.path,
      name: item.path.replace(/^source\/_posts\//, ""),
      sha: item.sha
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

async function getPost(postPath) {
  const data = await githubFetch(
    `/contents/${encodeURIComponent(postPath).replaceAll("%2F", "/")}?ref=${encodeURIComponent(config.githubBranch)}`
  );
  return {
    path: data.path,
    sha: data.sha,
    content: base64DecodeUtf8(data.content || "")
  };
}

async function savePost({ path, content, sha, message }) {
  const postPath = normalizePostPath(path);
  const payload = {
    message: message || `Update ${postPath.replace(/^source\/_posts\//, "")}`,
    content: base64EncodeUtf8(content || ""),
    branch: config.githubBranch
  };
  if (sha) payload.sha = sha;

  return githubFetch(`/contents/${encodeURIComponent(postPath).replaceAll("%2F", "/")}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

function polishPrompt({ mode, markdown }) {
  const task = {
    polish: "Improve the Chinese wording so the article reads naturally while preserving the author's meaning and all technical details.",
    format: "Clean up Markdown formatting, including heading levels, lists, code fences, blank lines, and Hexo front matter, without changing technical meaning.",
    title: "Improve the title and update the title field in Hexo front matter when appropriate.",
    summary: "Add or improve a description/summary field in Hexo front matter and lightly polish the article body."
  }[mode || "polish"] || "Polish and clean up the Markdown article.";

  return [
    "You are an editor for a Chinese technical blog.",
    task,
    "Requirements:",
    "1. Output only the complete Markdown document. Do not explain your changes.",
    "2. Preserve Hexo YAML front matter delimiters and fields.",
    "3. Do not remove code blocks or change algorithms, complexity, variable names, formulas, or technical facts.",
    "4. Use natural Chinese punctuation and spacing between Chinese and English text.",
    "",
    markdown || ""
  ].join("\n");
}
function extractOpenAIText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extractChatText(data) {
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callOpenAI(path, payload) {
  const response = await fetch(`${config.openaiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.openaiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI-compatible request failed: ${response.status}`);
  }
  return data;
}

async function polishMarkdown(body) {
  if (!config.openaiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  if (config.openaiApiStyle === "chat") {
    const data = await callOpenAI("/chat/completions", {
      model: config.openaiModel,
      messages: [
        {
          role: "user",
          content: polishPrompt(body)
        }
      ],
      temperature: 0.3
    });
    const text = extractChatText(data);
    if (!text) throw new Error("OpenAI-compatible chat API returned an empty response.");
    return text;
  }

  const data = await callOpenAI("/responses", {
    model: config.openaiModel,
    input: polishPrompt(body)
  });
  const text = extractOpenAIText(data);
  if (!text) throw new Error("OpenAI Responses API returned an empty response.");
  return text;
}

async function handleApi(req, res, url) {
  if (!requireAdmin(req, res)) return;
  if (url.pathname !== "/api/polish" && !requireGithubConfig(res)) return;

  try {
    if (req.method === "GET" && url.pathname === "/api/posts") {
      sendJson(res, 200, { posts: await listPosts() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/post") {
      const postPath = normalizePostPath(url.searchParams.get("path"));
      sendJson(res, 200, await getPost(postPath));
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/post") {
      const body = await readBody(req);
      const result = await savePost(body);
      sendJson(res, 200, {
        path: result.content?.path,
        sha: result.content?.sha,
        commit: result.commit?.html_url
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/polish") {
      const body = await readBody(req);
      sendJson(res, 200, { content: await polishMarkdown(body) });
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    sendJson(res, 500, { error: error.message || String(error) });
  }
}

async function serveStatic(req, res, url) {
  const route = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(publicDir, normalize(route).replace(/^(\.\.[/\\])+/, ""));

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mime[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  } catch {
    const fallback = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": mime[".html"], "cache-control": "no-store" });
    res.end(fallback);
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
}).listen(config.port, () => {
  console.log(`Blog admin is running on http://localhost:${config.port}`);
});



