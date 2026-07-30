import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAiPrompt } from "./public/ai-prompt.js";
import { parsePostMetadata } from "./lib/post-metadata.js";
import { selectDeployRuns } from "./lib/deploy-status.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const modulesDir = join(root, "node_modules");

const vendorFiles = new Map([
  ["/vendor/marked.min.js", join(modulesDir, "marked", "lib", "marked.umd.js")],
  ["/vendor/purify.min.js", join(modulesDir, "dompurify", "dist", "purify.min.js")],
  ["/vendor/highlight.min.js", join(modulesDir, "@highlightjs", "cdn-assets", "highlight.min.js")],
  ["/vendor/highlight-github.min.css", join(modulesDir, "@highlightjs", "cdn-assets", "styles", "github.min.css")],
  ["/vendor/highlight-github-dark.min.css", join(modulesDir, "@highlightjs", "cdn-assets", "styles", "github-dark.min.css")],
  ["/vendor/katex.min.js", join(modulesDir, "katex", "dist", "katex.min.js")],
  ["/vendor/katex-auto-render.min.js", join(modulesDir, "katex", "dist", "contrib", "auto-render.min.js")],
  ["/vendor/katex.min.css", join(modulesDir, "katex", "dist", "katex.min.css")],
  ["/vendor/lucide.min.js", join(modulesDir, "lucide", "dist", "umd", "lucide.min.js")],
  ["/vendor/diff.min.js", join(modulesDir, "diff", "dist", "diff.min.js")]
]);

const config = {
  port: Number(process.env.PORT || 8787),
  adminToken: process.env.ADMIN_TOKEN || "",
  githubOwner: process.env.GITHUB_OWNER || "Throne0826",
  githubRepo: process.env.GITHUB_REPO || "",
  githubBranch: process.env.GITHUB_BRANCH || "main",
  githubToken: process.env.GITHUB_TOKEN || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.6-sol",
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
  openaiApiStyle: process.env.OPENAI_API_STYLE || "chat"
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

const securityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

function logApi(req, res, url) {
  const startedAt = Date.now();
  const safePath = `${url.pathname}${url.search ? "?..." : ""}`;
  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    console.log(`${new Date().toISOString()} ${req.method} ${safePath} ${res.statusCode} ${ms}ms`);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders,
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

async function readBody(req, maxBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
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
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("GitHub request timed out. Render may be slow or GitHub API is unreachable.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const postMetadataCache = new Map();

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function listPosts() {
  const tree = await githubFetch(`/git/trees/${encodeURIComponent(config.githubBranch)}?recursive=1`);
  const posts = tree.tree
    .filter((item) => item.type === "blob")
    .filter((item) => item.path.startsWith("source/_posts/") && item.path.endsWith(".md"));

  return mapWithConcurrency(posts, 6, async (item) => {
    const name = item.path.replace(/^source\/_posts\//, "");
    let metadata = postMetadataCache.get(item.sha);
    if (!metadata) {
      try {
        const blob = await githubFetch(`/git/blobs/${encodeURIComponent(item.sha)}`);
        metadata = parsePostMetadata(base64DecodeUtf8(blob.content || ""), name);
      } catch (error) {
        console.warn(`Unable to read metadata for ${item.path}: ${error.message || String(error)}`);
        metadata = parsePostMetadata("", name);
      }
      postMetadataCache.set(item.sha, metadata);
    }
    return { path: item.path, name, sha: item.sha, ...metadata };
  });
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

function sanitizeImageName(name) {
  const fallback = "image";
  const raw = String(name || fallback).replace(/\.[^.]+$/, "");
  return raw
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallback;
}

function imageExtensionFromMime(mimeType) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg"
  }[mimeType] || "";
}

async function uploadImage({ name, type, data }) {
  const ext = imageExtensionFromMime(type);
  if (!ext) throw new Error("Unsupported image type. Use jpg, png, gif, webp, or svg.");
  const base64 = String(data || "").replace(/^data:[^;]+;base64,/, "");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) throw new Error("Image data is empty.");
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Image is too large. Keep it under 5MB.");

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const stamp = `${yyyy}${mm}${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  const filename = `${stamp}-${sanitizeImageName(name)}.${ext}`;
  const repoPath = `source/images/uploads/${yyyy}/${mm}/${filename}`;

  const result = await githubFetch(`/contents/${encodeURIComponent(repoPath).replaceAll("%2F", "/")}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Upload image ${filename}`,
      content: bytes.toString("base64"),
      branch: config.githubBranch
    })
  });

  return {
    path: repoPath,
    url: `/images/uploads/${yyyy}/${mm}/${filename}`,
    commit: result.commit?.html_url
  };
}

async function getDeployStatus(expectedSha = "") {
  const data = await githubFetch("/actions/runs?per_page=30");
  const runs = data.workflow_runs || [];
  const { source: sourceDeploy, pages: pagesDeploy } = selectDeployRuns(runs, expectedSha);

  return {
    source: sourceDeploy ? {
      title: sourceDeploy.display_title,
      status: sourceDeploy.status,
      conclusion: sourceDeploy.conclusion,
      branch: sourceDeploy.head_branch,
      sha: sourceDeploy.head_sha,
      url: sourceDeploy.html_url,
      createdAt: sourceDeploy.created_at,
      updatedAt: sourceDeploy.updated_at
    } : null,
    pages: pagesDeploy ? {
      status: pagesDeploy.status,
      conclusion: pagesDeploy.conclusion,
      branch: pagesDeploy.head_branch,
      sha: pagesDeploy.head_sha,
      url: pagesDeploy.html_url,
      createdAt: pagesDeploy.created_at,
      updatedAt: pagesDeploy.updated_at
    } : null
  };
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
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || part?.content || "").join("\n").trim();
  }
  return String(data.choices?.[0]?.text || "").trim();
}

async function callOpenAI(path, payload, timeoutMs = 85000) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${config.openaiBaseUrl}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${config.openaiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const responseText = await response.text();
      let data = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = {};
      }
      if (!response.ok) {
        const detail = data.error?.message || data.message || responseText.slice(0, 300);
        const requestError = new Error(detail || `OpenAI-compatible request failed: ${response.status}`);
        requestError.status = response.status;
        throw requestError;
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      const retryable = error instanceof TypeError || [502, 503, 504].includes(error.status);
      if (!retryable || attempt === 2) throw error;
      console.warn(`AI provider request failed on attempt ${attempt}; retrying once.`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("AI provider request failed after retry.");
}

async function polishMarkdown(body) {
  if (!config.openaiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const requestedModel = String(body.model || config.openaiModel).trim();
  if (!/^[a-zA-Z0-9._:/-]{1,100}$/.test(requestedModel)) {
    throw new Error("Invalid AI model ID.");
  }
  const apiStyle = body.apiStyle === "responses" ? "responses" : body.apiStyle === "chat" ? "chat" : config.openaiApiStyle;
  const prompt = buildAiPrompt(body);
  const timeoutMs = body.mode === "summary" ? 175000 : 85000;
  const callChat = async () => {
    const data = await callOpenAI("/chat/completions", {
      model: requestedModel,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }, timeoutMs);
    const text = extractChatText(data);
    if (!text) throw new Error("OpenAI-compatible chat API returned an empty response.");
    return text;
  };

  try {
    if (apiStyle === "chat") return await callChat();

    try {
      const data = await callOpenAI("/responses", {
        model: requestedModel,
        input: prompt
      }, timeoutMs);
      const text = extractOpenAIText(data);
      if (!text) throw new Error("OpenAI Responses API returned an empty response.");
      return text;
    } catch (error) {
      if (![400, 404, 405, 422].includes(error.status)) throw error;
      console.warn(`Responses API failed with ${error.status}; retrying with chat completions.`);
      return await callChat();
    }
  } catch (error) {
    error.model = requestedModel;
    error.apiStyle = apiStyle;
    throw error;
  }
}

async function handleApi(req, res, url) {
  logApi(req, res, url);
  if (!requireAdmin(req, res)) return;
  const aiRoute = url.pathname === "/api/polish" || url.pathname === "/api/ai-config";
  if (!aiRoute && !requireGithubConfig(res)) return;

  try {
    if (req.method === "GET" && url.pathname === "/api/ai-config") {
      let provider = config.openaiBaseUrl;
      try {
        provider = new URL(config.openaiBaseUrl).host;
      } catch {
        provider = "无效地址";
      }
      sendJson(res, 200, {
        configured: Boolean(config.openaiKey),
        model: config.openaiModel,
        apiStyle: config.openaiApiStyle,
        provider
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/deploy-status") {
      const expectedSha = String(url.searchParams.get("sha") || "").trim();
      if (expectedSha && !/^[a-f0-9]{40}$/i.test(expectedSha)) throw new Error("Invalid commit SHA.");
      sendJson(res, 200, await getDeployStatus(expectedSha));
      return;
    }

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
        commit: result.commit?.html_url,
        commitSha: result.commit?.sha
      });
      return;
    }


    if (req.method === "POST" && url.pathname === "/api/upload-image") {
      const body = await readBody(req);
      sendJson(res, 200, await uploadImage(body));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/polish") {
      const body = await readBody(req);
      sendJson(res, 200, { content: await polishMarkdown(body) });
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    const message = error.message || String(error);
    console.error(`[api] ${req.method} ${url.pathname} failed:`, message);
    const detail = url.pathname === "/api/polish"
      ? `AI 请求失败 [${error.model || config.openaiModel} / ${error.apiStyle || config.openaiApiStyle}]：${message}`
      : message;
    sendJson(res, 500, { error: detail });
  }
}

async function serveStatic(req, res, url) {
  const route = url.pathname === "/" ? "/index.html" : url.pathname;
  let filePath = vendorFiles.get(route);
  if (!filePath && route.startsWith("/vendor/fonts/")) {
    const fontName = basename(route);
    if (/^[a-zA-Z0-9_.-]+$/.test(fontName)) filePath = join(modulesDir, "katex", "dist", "fonts", fontName);
  }
  if (!filePath) filePath = join(publicDir, normalize(route).replace(/^(\.\.[/\\])+/, ""));

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      ...securityHeaders,
      "content-type": mime[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { ...securityHeaders, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("Not found.");
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
  console.log(`GitHub target: ${config.githubOwner}/${config.githubRepo || "(missing repo)"}#${config.githubBranch}`);
  console.log(`OpenAI style: ${config.openaiApiStyle}; model: ${config.openaiModel}; base: ${config.openaiBaseUrl}`);
});







