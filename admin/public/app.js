const state = {
  token: localStorage.getItem("blog-admin-token") || "",
  currentPath: "",
  currentSha: "",
  posts: [],
  aiOriginal: "",
  aiSuggestion: "",
  aiRange: null,
  draftTimer: 0,
  undoStack: [],
  redoStack: []
};

import { buildAiPrompt } from "./ai-prompt.js";

const els = {
  tokenInput: document.querySelector("#tokenInput"),
  aiBaseUrlInput: document.querySelector("#aiBaseUrlInput"),
  aiKeyInput: document.querySelector("#aiKeyInput"),
  testAiButton: document.querySelector("#testAiButton"),
  saveTokenButton: document.querySelector("#saveTokenButton"),
  loadPostsButton: document.querySelector("#loadPostsButton"),
  newPostButton: document.querySelector("#newPostButton"),
  postSearchInput: document.querySelector("#postSearchInput"),
  postSortSelect: document.querySelector("#postSortSelect"),
  postList: document.querySelector("#postList"),
  pathInput: document.querySelector("#pathInput"),
  modelInput: document.querySelector("#modelInput"),
  modeSelect: document.querySelector("#modeSelect"),
  polishButton: document.querySelector("#polishButton"),
  saveButton: document.querySelector("#saveButton"),
  applyAiButton: document.querySelector("#applyAiButton"),
  copyAiButton: document.querySelector("#copyAiButton"),
  discardAiButton: document.querySelector("#discardAiButton"),
  reviewPanel: document.querySelector("#reviewPanel"),
  diffSummary: document.querySelector("#diffSummary"),
  diffView: document.querySelector("#diffView"),
  editorInput: document.querySelector("#editorInput"),
  imageFileInput: document.querySelector("#imageFileInput"),
  editorMeta: document.querySelector("#editorMeta"),
  preview: document.querySelector("#preview"),
  status: document.querySelector("#status"),
  errorNotice: document.querySelector("#errorNotice"),
  errorNoticeText: document.querySelector("#errorNoticeText"),
  closeErrorNotice: document.querySelector("#closeErrorNotice")
};

els.tokenInput.value = state.token;
els.modelInput.value = localStorage.getItem("blog-admin-ai-model") || "gpt-5.6-sol";
els.aiBaseUrlInput.value = localStorage.getItem("blog-admin-ai-base-url") || "https://api.ssstoken.net/v1";
els.aiKeyInput.value = sessionStorage.getItem("blog-admin-ai-key") || "";

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
  if (isError) {
    els.errorNoticeText.textContent = message;
    els.errorNotice.hidden = false;
  }
}

function getDraftKey() {
  return `blog-admin-draft:${els.pathInput.value.trim() || "new"}`;
}

function formatLocalDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatLocalTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function snapshot() {
  return { text: els.editorInput.value, start: els.editorInput.selectionStart, end: els.editorInput.selectionEnd };
}

function restoreSnapshot(item) {
  if (!item) return;
  els.editorInput.value = item.text;
  els.editorInput.selectionStart = item.start;
  els.editorInput.selectionEnd = item.end;
  els.editorInput.focus();
  updatePreview();
  saveDraftSoon();
}

function recordUndo() {
  const item = snapshot();
  const last = state.undoStack[state.undoStack.length - 1];
  if (last && last.text === item.text && last.start === item.start && last.end === item.end) return;
  state.undoStack.push(item);
  if (state.undoStack.length > 80) state.undoStack.shift();
  state.redoStack = [];
}

function resetUndoHistory() {
  state.undoStack = [];
  state.redoStack = [];
}

function undoEdit() {
  const current = snapshot();
  const previous = state.undoStack.pop();
  if (!previous) return;
  state.redoStack.push(current);
  restoreSnapshot(previous);
  setStatus("Undone.");
}

function redoEdit() {
  const current = snapshot();
  const next = state.redoStack.pop();
  if (!next) return;
  state.undoStack.push(current);
  restoreSnapshot(next);
  setStatus("Redone.");
}

function saveDraftSoon() {
  clearTimeout(state.draftTimer);
  state.draftTimer = setTimeout(() => {
    localStorage.setItem(getDraftKey(), els.editorInput.value);
    setStatus("Draft autosaved locally.");
  }, 900);
}

async function api(path, options = {}) {
  const timeoutMs = options.timeoutMs || 90000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-admin-token": state.token,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时。AI 处理长文时容易超过后台等待时间，建议先选中一段文字再处理。");
    if (error instanceof TypeError) throw new Error("网络请求失败：浏览器与 Render 后台的连接被中断。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function markdownBody(markdown) {
  return markdown.replace(/^---[\s\S]*?---\s*/, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(markdown) {
  const body = markdownBody(markdown);
  if (window.marked) {
    window.marked.setOptions({
      breaks: false,
      gfm: true,
      headerIds: false,
      mangle: false,
      highlight(code, lang) {
        if (!window.hljs) return code;
        const language = window.hljs.getLanguage(lang) ? lang : "plaintext";
        return window.hljs.highlight(code, { language }).value;
      }
    });
    try {
      const rendered = window.marked.parse(body);
      return window.DOMPurify ? window.DOMPurify.sanitize(rendered) : rendered;
    } catch (error) {
      return `<pre>${escapeHtml(body)}</pre>`;
    }
  }
  return escapeHtml(body).replace(/\n/g, "<br>");
}

let mathRenderTimer = 0;
function updatePreview() {
  const value = els.editorInput.value;
  els.preview.innerHTML = renderMarkdown(value);
  if (window.hljs) {
    els.preview.querySelectorAll("pre code").forEach((block) => window.hljs.highlightElement(block));
  }
  els.editorMeta.textContent = `${value.length} 字`;
  clearTimeout(mathRenderTimer);
  mathRenderTimer = setTimeout(() => {
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([els.preview]).catch((error) => setStatus(error.message || String(error), true));
    }
  }, 80);
}

function hideReview() {
  state.aiOriginal = "";
  state.aiSuggestion = "";
  state.aiRange = null;
  els.reviewPanel.hidden = true;
  els.diffView.innerHTML = "";
  els.diffSummary.textContent = "等待生成";
}

function getSelection() {
  return {
    from: els.editorInput.selectionStart,
    to: els.editorInput.selectionEnd,
    text: els.editorInput.value.slice(els.editorInput.selectionStart, els.editorInput.selectionEnd)
  };
}

function replaceRange(range, text, options = {}) {
  if (!options.skipUndo) recordUndo();
  const from = range ? range.from : 0;
  const to = range ? range.to : els.editorInput.value.length;
  els.editorInput.focus();
  els.editorInput.selectionStart = from;
  els.editorInput.selectionEnd = to;
  const insertedWithNativeUndo = typeof document.execCommand === "function"
    && document.execCommand("insertText", false, text);
  if (!insertedWithNativeUndo) {
    els.editorInput.setRangeText(text, from, to, "end");
  }
  updatePreview();
  saveDraftSoon();
}

function insertAtSelection(before, after = "", placeholder = "") {
  const { from, to, text } = getSelection();
  const hadSelection = to > from;
  const selected = text || placeholder;
  const insert = `${before}${selected}${after}`;
  replaceRange({ from, to }, insert);
  if (hadSelection) {
    const cursor = from + insert.length;
    els.editorInput.selectionStart = cursor;
    els.editorInput.selectionEnd = cursor;
  } else {
    const cursorStart = from + before.length;
    const cursorEnd = cursorStart + selected.length;
    els.editorInput.selectionStart = cursorStart;
    els.editorInput.selectionEnd = cursorEnd;
  }
}

function insertBlock(block) {
  const { from, to } = getSelection();
  const current = els.editorInput.value;
  const prefix = from > 0 && current[from - 1] !== "\n" ? "\n\n" : "";
  const suffix = to < current.length && current[to] !== "\n" ? "\n" : "";
  replaceRange({ from, to }, `${prefix}${block}${suffix}`);
}

function splitMarkdown(markdown, maxLength = 3800) {
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

async function requestAi(mode, markdown, chunkIndex = 0, chunkCount = 1) {
  const directKey = els.aiKeyInput.value.trim();
  if (directKey) {
    const prompt = buildAiPrompt({ mode, markdown, chunkIndex, chunkCount });
    return { content: await callDirectChat(prompt, mode === "summary" ? 180000 : 90000) };
  }

  const options = {
    method: "POST",
    timeoutMs: mode === "summary" ? 195000 : 120000,
    body: JSON.stringify({
      mode,
      markdown,
      chunkIndex,
      chunkCount,
      model: els.modelInput.value.trim() || "gpt-5.6-sol",
      apiStyle: "chat"
    })
  };
  try {
    return await api("/api/polish", options);
  } catch (error) {
    if (!String(error.message || error).startsWith("网络请求失败")) throw error;
    setStatus("连接中断，正在自动重试一次...");
    await new Promise((resolve) => setTimeout(resolve, 1800));
    return api("/api/polish", options);
  }
}

function directAiSettings() {
  return {
    baseUrl: els.aiBaseUrlInput.value.trim().replace(/["']+$/, "").replace(/\/+$/, ""),
    key: els.aiKeyInput.value.trim(),
    model: els.modelInput.value.trim() || "gpt-5.6-sol"
  };
}

function extractDirectChatText(data) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || part?.content || "").join("\n").trim();
  }
  return String(data.choices?.[0]?.text || "").trim();
}

async function callDirectChat(prompt, timeoutMs = 90000) {
  const { baseUrl, key, model } = directAiSettings();
  if (!key) throw new Error("请先在左侧 AI 连接中填写 API Key。");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("AI API 地址必须以 https:// 开头。");

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }]
        })
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
        const requestError = new Error(detail || `中转站请求失败：${response.status}`);
        requestError.status = response.status;
        throw requestError;
      }
      const content = extractDirectChatText(data);
      if (!content) throw new Error("中转站返回了空内容。");
      return content;
    } catch (error) {
      if (error.name === "AbortError") throw new Error(`浏览器直连中转站超时（${Math.round(timeoutMs / 1000)} 秒）。`);
      const retryable = error instanceof TypeError || [502, 503, 504].includes(error.status);
      if (!retryable || attempt === 2) throw error;
      setStatus("浏览器直连中断，正在重试一次...");
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("浏览器直连中转站失败。");
}

async function testAiConnection() {
  const previousText = els.testAiButton.textContent;
  els.testAiButton.disabled = true;
  els.testAiButton.textContent = "测试中...";
  try {
    const result = await callDirectChat("只回复 OK。");
    setStatus(`AI 直连成功：${directAiSettings().model} · ${result.slice(0, 30)}`);
  } finally {
    els.testAiButton.disabled = false;
    els.testAiButton.textContent = previousText;
  }
}

async function processMarkdownChunks(mode, markdown, actionLabel) {
  const chunks = splitMarkdown(markdown);
  const results = [];
  for (let index = 0; index < chunks.length; index += 1) {
    setStatus(`AI 正在${actionLabel}：第 ${index + 1}/${chunks.length} 部分...`);
    els.polishButton.textContent = `处理中 ${index + 1}/${chunks.length}`;
    let data;
    try {
      data = await requestAi(mode, chunks[index], index, chunks.length);
    } catch (error) {
      throw new Error(`AI ${actionLabel}第 ${index + 1}/${chunks.length} 部分失败：${error.message || String(error)}`);
    }
    if (!data.content?.trim()) throw new Error(`AI 处理第 ${index + 1} 部分时返回了空内容。`);
    results.push(data.content.trim());
  }
  return results.join("\n\n");
}

function cleanSummary(value) {
  const summary = String(value || "")
    .replace(/^["'“”\s]*(?:摘要|description)\s*[:：]\s*/i, "")
    .replace(/["'“”\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(summary).slice(0, 100).join("");
}

function upsertDescription(markdown, summary) {
  const escaped = summary.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const field = `description: "${escaped}"`;
  const frontMatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontMatter) return `---\n${field}\n---\n\n${markdown}`;

  const body = frontMatter[1];
  const descriptionPattern = /^description\s*:[^\n]*(?:\n[ \t]+[^\n]*)*/m;
  const nextBody = descriptionPattern.test(body)
    ? body.replace(descriptionPattern, field)
    : `${body}\n${field}`;
  return `---\n${nextBody}\n---${markdown.slice(frontMatter[0].length)}`;
}

async function buildArticleSummary(markdown) {
  setStatus(`AI 正在一次性阅读全文并生成摘要，共 ${markdown.length} 字符...`);
  els.polishButton.textContent = "生成摘要...";
  const finalResult = await requestAi("summary", markdown, 0, 1);
  const summary = cleanSummary(finalResult.content);
  if (!summary) throw new Error("AI 没有生成有效摘要。");
  return summary;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

async function uploadImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Only image files can be uploaded.", true);
    return;
  }
  setStatus(`Uploading image ${file.name}...`);
  const data = await fileToDataUrl(file);
  const result = await api("/api/upload-image", {
    method: "POST",
    timeoutMs: 60000,
    body: JSON.stringify({ name: file.name, type: file.type, data })
  });
  insertAtSelection("", "", `![${file.name}](${result.url})`);
  setStatus(`Image uploaded and inserted: ${result.url}`);
}
function runTool(tool) {
  if (tool === "undo") {
    undoEdit();
    return;
  }
  if (tool === "redo") {
    redoEdit();
    return;
  }
  const blocks = {
    h2: () => insertAtSelection("## ", "", "小节标题"),
    h3: () => insertAtSelection("### ", "", "小标题"),
    bold: () => insertAtSelection("**", "**", "加粗文本"),
    italic: () => insertAtSelection("*", "*", "斜体文本"),
    code: () => insertBlock("```cpp\n// code\n```\n"),
    link: () => insertAtSelection("[", "](https://)", "链接文本"),
    image: () => els.imageFileInput.click(),
    quote: () => insertBlock("> 引用内容\n"),
    ul: () => insertBlock("- 第一项\n- 第二项\n"),
    ol: () => insertBlock("1. 第一项\n2. 第二项\n"),
    "math-inline": () => insertAtSelection("$", "$", "a+b"),
    "math-block": () => insertBlock("$$\na^{p-1} \\equiv 1 \\pmod p\n$$\n"),
    table: () => insertBlock("| 项目 | 说明 |\n| --- | --- |\n| A | 内容 |\n"),
    info: () => insertBlock("::::info[提示]{open}\n这里写提示内容。\n::::\n"),
    sample: () => insertBlock("### 样例输入\n\n```text\n\n```\n\n### 样例输出\n\n```text\n\n```\n"),
    more: () => insertBlock("<!--more-->\n")
  };
  blocks[tool]?.();
}

function buildLineDiff(beforeText, afterText) {
  const before = beforeText.split("\n");
  const after = afterText.split("\n");
  const rows = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      rows[i][j] = before[i] === after[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  const diff = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) diff.push({ type: "same", text: before[i++] }), j += 1;
    else if (rows[i + 1][j] >= rows[i][j + 1]) diff.push({ type: "remove", text: before[i++] });
    else diff.push({ type: "add", text: after[j++] });
  }
  while (i < before.length) diff.push({ type: "remove", text: before[i++] });
  while (j < after.length) diff.push({ type: "add", text: after[j++] });
  return diff;
}

function renderDiff(beforeText, afterText, scopeLabel) {
  const diff = buildLineDiff(beforeText, afterText);
  const added = diff.filter((part) => part.type === "add").length;
  const removed = diff.filter((part) => part.type === "remove").length;
  els.diffSummary.textContent = added + removed
    ? `${scopeLabel}，新增 ${added} 行，删除 ${removed} 行`
    : `${scopeLabel}，AI 没有改动内容`;
  els.diffView.innerHTML = diff.map((part) => {
    const mark = part.type === "add" ? "+" : part.type === "remove" ? "-" : " ";
    return `<div class="diff-line diff-${part.type}"><span class="diff-mark">${mark}</span><code>${escapeHtml(part.text || " ")}</code></div>`;
  }).join("");
  els.reviewPanel.hidden = false;
}

function filteredPosts() {
  const query = els.postSearchInput.value.trim().toLowerCase();
  const posts = state.posts.filter((post) => !query || post.name.toLowerCase().includes(query) || post.path.toLowerCase().includes(query));
  const sort = els.postSortSelect.value;
  posts.sort((a, b) => {
    if (sort === "name-desc" || sort === "date-desc") return b.name.localeCompare(a.name, "zh-CN");
    return a.name.localeCompare(b.name, "zh-CN");
  });
  return posts;
}

function renderPosts() {
  els.postList.innerHTML = "";
  for (const post of filteredPosts()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `post-item${post.path === state.currentPath ? " active" : ""}`;
    button.textContent = post.name;
    button.addEventListener("click", bind(() => loadPost(post.path)));
    els.postList.appendChild(button);
  }
}

async function loadPosts() {
  setStatus("Loading posts...");
  const data = await api("/api/posts", { timeoutMs: 30000 });
  state.posts = data.posts || [];
  renderPosts();
  setStatus(`Loaded ${state.posts.length} posts`);
}

async function loadPost(path) {
  setStatus("Loading post...");
  const data = await api(`/api/post?path=${encodeURIComponent(path)}`, { timeoutMs: 30000 });
  state.currentPath = data.path;
  state.currentSha = data.sha;
  els.pathInput.value = data.path;
  const draft = localStorage.getItem(getDraftKey());
  if (draft && draft !== data.content) {
    const useDraft = window.confirm("这个浏览器里有未发布的本地草稿。是否恢复草稿？\n\n确定：恢复草稿\n取消：使用 GitHub 上的版本");
    els.editorInput.value = useDraft ? draft : data.content;
  } else {
    els.editorInput.value = data.content;
  }
  resetUndoHistory();
  hideReview();
  updatePreview();
  renderPosts();
  setStatus(`Opened ${data.path}`);
}

function slugifyTitle(title) {
  return title.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-").slice(0, 80) || "new-post";
}

function newPost() {
  const now = new Date();
  const date = formatLocalDate(now);
  const time = formatLocalTime(now);
  const title = "新文章";
  state.currentPath = "";
  state.currentSha = "";
  els.pathInput.value = `source/_posts/${date}-${slugifyTitle(title)}.md`;
  els.editorInput.value = `---\ntitle: ${title}\ndate: ${date} ${time}\nmathjax: true\ntags:\n  - \ncategories:\n  - \n---\n\n# ${title}\n\n`;
  resetUndoHistory();
  hideReview();
  updatePreview();
  renderPosts();
  setStatus("Draft created. The editor is plain Markdown and autosaves locally.");
}

async function waitForDeployStatus(commitUrl) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 5000 : 12000));
    const data = await api("/api/deploy-status", { timeoutMs: 30000 });
    const source = data.source;
    const pages = data.pages;
    const sourceText = source ? `${source.status}${source.conclusion ? `/${source.conclusion}` : ""}` : "unknown";
    const pagesText = pages ? `${pages.status}${pages.conclusion ? `/${pages.conclusion}` : ""}` : "unknown";
    setStatus(`Saved. Deploy status: Hexo ${sourceText}, Pages ${pagesText}. ${commitUrl || ""}`);
    if (source?.status === "completed" && source.conclusion !== "success") return;
    if (pages?.status === "completed") return;
  }
}

async function polish() {
  const fullText = els.editorInput.value;
  if (!fullText) {
    setStatus("当前文章是空的。", true);
    return;
  }
  const selection = getSelection();
  const hasSelection = selection.text.trim().length > 0;
  const mode = els.modeSelect.value;
  const actionLabels = { polish: "润色", format: "整理格式", check: "检查问题" };
  const useSelection = hasSelection && mode !== "check" && mode !== "summary";
  const target = useSelection
    ? { from: selection.from, to: selection.to, text: selection.text, label: "选中文本" }
    : { from: 0, to: fullText.length, text: fullText, label: "整篇文章" };
  const targetText = target.text.trim();
  if (!targetText) {
    setStatus("当前光标附近没有可处理的正文。", true);
    return;
  }
  els.errorNotice.hidden = true;
  const previousText = els.polishButton.textContent;
  els.polishButton.disabled = true;
  els.polishButton.textContent = "检查配置...";
  try {
    const directSettings = directAiSettings();
    if (directSettings.key) {
      setStatus(`浏览器直连 AI：${directSettings.model} · ${directSettings.baseUrl}`);
    } else {
      const aiConfig = await api("/api/ai-config", { timeoutMs: 15000 });
      if (!aiConfig.configured) throw new Error("请在左侧 AI 连接中填写 API Key。");
      const requestedModel = els.modelInput.value.trim() || aiConfig.model;
      setStatus(`正在连接 AI：${requestedModel} · chat · ${aiConfig.provider}`);
    }
    els.polishButton.textContent = "处理中...";
    let suggestion;
    if (mode === "summary") {
      const summary = await buildArticleSummary(fullText);
      suggestion = upsertDescription(fullText, summary);
      setStatus(`摘要已生成，共 ${Array.from(summary).length} 字。`);
    } else {
      suggestion = await processMarkdownChunks(mode, targetText, actionLabels[mode] || "处理");
    }
    state.aiOriginal = target.text;
    state.aiSuggestion = suggestion;
    state.aiRange = target.from === 0 && target.to === fullText.length ? null : { from: target.from, to: target.to };
    renderDiff(state.aiOriginal, state.aiSuggestion, target.label);
    setStatus("AI 建议已生成。请检查完整差异后应用到正文。");
  } finally {
    els.polishButton.disabled = false;
    els.polishButton.textContent = previousText;
  }
}

function applyAiSuggestion() {
  if (!state.aiSuggestion) {
    setStatus("No AI suggestion to apply.", true);
    return;
  }
  replaceRange(state.aiRange, state.aiSuggestion);
  hideReview();
  setStatus("AI changes applied. Review the preview before saving.");
}

async function copyAiSuggestion() {
  const text = state.aiSuggestion;
  if (!text) {
    setStatus("No AI suggestion to copy.", true);
    return;
  }
  await navigator.clipboard.writeText(text);
  setStatus("AI suggestion copied.");
}

function discardAiSuggestion() {
  hideReview();
  setStatus("AI suggestion discarded.");
}

async function savePost() {
  const path = els.pathInput.value.trim();
  const content = els.editorInput.value;
  if (!path || !content.trim()) {
    setStatus("Path and content are required.", true);
    return;
  }
  const previousText = els.saveButton.textContent;
  els.saveButton.disabled = true;
  els.saveButton.textContent = "保存中...";
  setStatus("Saving to GitHub...");
  try {
    const data = await api("/api/post", {
      method: "PUT",
      body: JSON.stringify({ path, content, sha: state.currentSha, message: `Update ${path.replace(/^source\/_posts\//, "")}` })
    });
    state.currentPath = data.path;
    state.currentSha = data.sha;
    hideReview();
    localStorage.removeItem(getDraftKey());
    setStatus(`Committed. Waiting for GitHub Pages deploy... ${data.commit || data.path}`);
    await loadPosts();
    waitForDeployStatus(data.commit).catch((error) => setStatus(error.message || String(error), true));
  } finally {
    els.saveButton.disabled = false;
    els.saveButton.textContent = previousText;
  }
}

function bind(handler) {
  return async () => {
    try {
      await handler();
    } catch (error) {
      setStatus(error.message || String(error), true);
    }
  };
}

els.saveTokenButton.addEventListener("click", () => {
  state.token = els.tokenInput.value.trim();
  localStorage.setItem("blog-admin-token", state.token);
  setStatus("Token saved in this browser.");
});
els.closeErrorNotice.addEventListener("click", () => {
  els.errorNotice.hidden = true;
});
els.modelInput.addEventListener("change", () => {
  const model = els.modelInput.value.trim() || "gpt-5.6-sol";
  els.modelInput.value = model;
  localStorage.setItem("blog-admin-ai-model", model);
  setStatus(`AI 模型已切换为 ${model}`);
});
els.aiBaseUrlInput.addEventListener("change", () => {
  const baseUrl = els.aiBaseUrlInput.value.trim().replace(/["']+$/, "").replace(/\/+$/, "") || "https://api.ssstoken.net/v1";
  els.aiBaseUrlInput.value = baseUrl;
  localStorage.setItem("blog-admin-ai-base-url", baseUrl);
});
els.aiKeyInput.addEventListener("input", () => {
  sessionStorage.setItem("blog-admin-ai-key", els.aiKeyInput.value.trim());
});
els.testAiButton.addEventListener("click", bind(testAiConnection));
els.loadPostsButton.addEventListener("click", bind(loadPosts));
els.newPostButton.addEventListener("click", newPost);
els.polishButton.addEventListener("click", bind(polish));
els.saveButton.addEventListener("click", bind(savePost));
els.applyAiButton.addEventListener("click", applyAiSuggestion);
els.copyAiButton.addEventListener("click", bind(copyAiSuggestion));
els.discardAiButton.addEventListener("click", discardAiSuggestion);
els.postSearchInput.addEventListener("input", renderPosts);
els.postSortSelect.addEventListener("change", renderPosts);
els.imageFileInput.addEventListener("change", bind(async () => {
  const [file] = els.imageFileInput.files || [];
  await uploadImageFile(file);
  els.imageFileInput.value = "";
}));
document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => runTool(button.dataset.tool));
});
els.editorInput.addEventListener("input", () => {
  if (state.aiSuggestion) hideReview();
  updatePreview();
  saveDraftSoon();
});
els.editorInput.addEventListener("paste", (event) => {
  const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  uploadImageFile(file).catch((error) => setStatus(error.message || String(error), true));
});

els.editorInput.addEventListener("dragover", (event) => {
  event.preventDefault();
});

els.editorInput.addEventListener("drop", (event) => {
  const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  uploadImageFile(file).catch((error) => setStatus(error.message || String(error), true));
});

els.editorInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    savePost().catch((error) => setStatus(error.message || String(error), true));
  }
});

newPost();





