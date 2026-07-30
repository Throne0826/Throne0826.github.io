import { buildAiPrompt } from "./ai-prompt.js";
import { createNewPost, isDocumentVersionCurrent, parseArticleMetadata, preserveOuterWhitespace, sortPosts, splitMarkdown, upsertArticleMetadata } from "./editor-utils.js";
import { createMarkdownEditor } from "./editor-bundle.js";

const state = {
  token: localStorage.getItem("blog-admin-token") || "",
  currentPath: "",
  currentSha: "",
  baselineContent: "",
  baselinePath: "",
  posts: [],
  aiOriginal: "",
  aiSuggestion: "",
  aiRange: null,
  aiBaseContent: "",
  aiBasePath: "",
  aiController: null,
  draftTimer: 0,
  previewTimer: 0,
  loadSequence: 0,
  deploySequence: 0,
  diffChanges: [],
  diffIndex: -1,
  syncScroll: localStorage.getItem("blog-admin-sync-scroll") !== "false",
  viewMode: localStorage.getItem("blog-admin-view") || "split",
  theme: document.documentElement.dataset.theme || "light",
  syncingScroll: false
};

let markdownEditor = null;

const els = {
  tokenInput: document.querySelector("#tokenInput"),
  aiBaseUrlInput: document.querySelector("#aiBaseUrlInput"),
  aiKeyInput: document.querySelector("#aiKeyInput"),
  modelInput: document.querySelector("#modelInput"),
  testAiButton: document.querySelector("#testAiButton"),
  saveTokenButton: document.querySelector("#saveTokenButton"),
  loadPostsButton: document.querySelector("#loadPostsButton"),
  newPostButton: document.querySelector("#newPostButton"),
  postSearchInput: document.querySelector("#postSearchInput"),
  postSortSelect: document.querySelector("#postSortSelect"),
  postList: document.querySelector("#postList"),
  postCount: document.querySelector("#postCount"),
  pathInput: document.querySelector("#pathInput"),
  documentTitle: document.querySelector("#documentTitle"),
  dirtyStatus: document.querySelector("#dirtyStatus"),
  modeSelect: document.querySelector("#modeSelect"),
  polishButton: document.querySelector("#polishButton"),
  cancelAiButton: document.querySelector("#cancelAiButton"),
  saveButton: document.querySelector("#saveButton"),
  applyAiButton: document.querySelector("#applyAiButton"),
  copyAiButton: document.querySelector("#copyAiButton"),
  discardAiButton: document.querySelector("#discardAiButton"),
  previousChangeButton: document.querySelector("#previousChangeButton"),
  nextChangeButton: document.querySelector("#nextChangeButton"),
  toggleUnchangedButton: document.querySelector("#toggleUnchangedButton"),
  reviewPanel: document.querySelector("#reviewPanel"),
  diffSummary: document.querySelector("#diffSummary"),
  diffView: document.querySelector("#diffView"),
  workspace: document.querySelector(".workspace"),
  workspaceDivider: document.querySelector("#workspaceDivider"),
  editorMount: document.querySelector("#editorMount"),
  imageFileInput: document.querySelector("#imageFileInput"),
  editorMeta: document.querySelector("#editorMeta"),
  preview: document.querySelector("#preview"),
  syncScrollButton: document.querySelector("#syncScrollButton"),
  status: document.querySelector("#status"),
  draftStatus: document.querySelector("#draftStatus"),
  publishStatus: document.querySelector("#publishStatus"),
  errorNotice: document.querySelector("#errorNotice"),
  errorNoticeText: document.querySelector("#errorNoticeText"),
  closeErrorNotice: document.querySelector("#closeErrorNotice"),
  themeButton: document.querySelector("#themeButton"),
  highlightLight: document.querySelector("#highlightLight"),
  highlightDark: document.querySelector("#highlightDark"),
  aiProgress: document.querySelector("#aiProgress"),
  publishPipeline: document.querySelector("#publishPipeline")
};

els.tokenInput.value = state.token;
els.modelInput.value = localStorage.getItem("blog-admin-ai-model") || "gpt-5.6-sol";
els.aiBaseUrlInput.value = localStorage.getItem("blog-admin-ai-base-url") || "https://api.ssstoken.net/v1";
els.aiKeyInput.value = sessionStorage.getItem("blog-admin-ai-key") || "";

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
  els.status.classList.remove("status-update");
  requestAnimationFrame(() => els.status.classList.add("status-update"));
  if (isError) {
    els.errorNoticeText.textContent = message;
    els.errorNotice.hidden = false;
  }
}

function setPublishStatus(message, tone = "") {
  els.publishStatus.lastChild.textContent = message;
  els.publishStatus.dataset.tone = tone;
  let stage = "idle";
  if (tone === "success") stage = "live";
  else if (tone === "error") stage = "error";
  else if (/尚未/.test(message)) stage = "idle";
  else if (/提交/.test(message)) stage = "commit";
  else if (/构建|等待/.test(message)) stage = "build";
  else if (/发布|部署|上线/.test(message)) stage = "deploy";
  els.publishPipeline.dataset.stage = stage;
}

function setDraftStatus(message, saving = false) {
  els.draftStatus.lastChild.textContent = message;
  els.draftStatus.classList.toggle("saving", saving);
}

function getDraftKey(path = els.pathInput.value.trim()) {
  return `blog-admin-draft:${path || "new"}`;
}

function formatLocalTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function extractTitle(markdown) {
  const frontMatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const title = frontMatter?.[1].match(/^title\s*:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, "");
  return title || els.pathInput.value.split("/").pop()?.replace(/\.md$/i, "") || "未命名文章";
}

function editorValue() {
  return markdownEditor?.getValue() || "";
}

function isDirty() {
  return editorValue() !== state.baselineContent || els.pathInput.value.trim() !== state.baselinePath;
}

function updateDocumentState() {
  const dirty = isDirty();
  els.documentTitle.textContent = extractTitle(editorValue());
  els.dirtyStatus.className = "state-badge";
  if (!state.currentSha) {
    els.dirtyStatus.textContent = dirty ? "未发布草稿" : "新草稿";
    els.dirtyStatus.classList.add("draft");
  } else if (dirty) {
    els.dirtyStatus.textContent = "未发布修改";
    els.dirtyStatus.classList.add("dirty");
  } else {
    els.dirtyStatus.textContent = "已同步";
    els.dirtyStatus.classList.add("clean");
  }
  els.pathInput.readOnly = Boolean(state.currentSha);
  els.pathInput.title = state.currentSha ? "已发布文章的文件路径不可直接修改" : "新文章发布前可以修改文件路径";
}

function setBaseline(content, path) {
  state.baselineContent = content;
  state.baselinePath = path;
  updateDocumentState();
}

function saveDraftSoon() {
  clearTimeout(state.draftTimer);
  setDraftStatus("正在保存本地草稿...", true);
  const draftPath = els.pathInput.value.trim();
  const draftContent = editorValue();
  state.draftTimer = setTimeout(() => {
    localStorage.setItem(getDraftKey(draftPath), draftContent);
    setDraftStatus(`本地已保存 ${formatLocalTime(new Date()).slice(0, 5)}`);
  }, 700);
}

function markDocumentChanged(options = {}) {
  els.editorMeta.textContent = `${editorValue().length} 字符`;
  updateDocumentState();
  schedulePreview();
  if (!options.skipDraft) saveDraftSoon();
}

function undoEdit() {
  if (!markdownEditor?.undo()) return setStatus("没有可撤销的修改。");
  setStatus("已撤销上一次工具栏或 AI 修改。");
}

function redoEdit() {
  if (!markdownEditor?.redo()) return setStatus("没有可重做的修改。");
  setStatus("已重做修改。");
}

function linkedController(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    controller,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onAbort);
    }
  };
}

async function api(path, options = {}) {
  const timeoutMs = options.timeoutMs || 90000;
  const externalSignal = options.signal;
  const linked = linkedController(externalSignal, timeoutMs);
  const { signal: _ignored, ...fetchOptions } = options;

  try {
    const response = await fetch(path, {
      ...fetchOptions,
      signal: linked.controller.signal,
      headers: {
        "content-type": "application/json",
        "x-admin-token": state.token,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
    return data;
  } catch (error) {
    if (error.name === "AbortError" && externalSignal?.aborted) {
      const canceled = new Error("操作已取消。");
      canceled.code = "CANCELED";
      throw canceled;
    }
    if (error.name === "AbortError" && linked.timedOut()) throw new Error("请求超时，请检查网络或稍后重试。");
    if (error instanceof TypeError) throw new Error("网络请求失败：浏览器与服务连接中断。");
    throw error;
  } finally {
    linked.cleanup();
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
  if (!window.marked) return escapeHtml(body).replace(/\n/g, "<br>");
  window.marked.setOptions({ breaks: false, gfm: true, headerIds: false, mangle: false });
  try {
    const rendered = window.marked.parse(body);
    return window.DOMPurify
      ? window.DOMPurify.sanitize(rendered, { ADD_ATTR: ["open"], ADD_TAGS: ["details", "summary"] })
      : rendered;
  } catch {
    return `<pre>${escapeHtml(body)}</pre>`;
  }
}

function renderPreviewNow() {
  clearTimeout(state.previewTimer);
  const markdown = editorValue();
  els.preview.innerHTML = markdownBody(markdown).trim()
    ? renderMarkdown(markdown)
    : `<div class="preview-empty"><div class="empty-illustration"><i data-lucide="notebook-pen"></i><i data-lucide="sparkles"></i></div><strong>等待正文</strong><span>这篇文章还没有内容。</span></div>`;
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
  if (window.hljs) {
    els.preview.querySelectorAll("pre code").forEach((block) => window.hljs.highlightElement(block));
  }
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(els.preview, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false }
        ],
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
        throwOnError: false
      });
    } catch (error) {
      setStatus(`公式预览失败：${error.message || String(error)}`, true);
    }
  }
}

function schedulePreview() {
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(renderPreviewNow, 180);
}

function hideReview() {
  state.aiOriginal = "";
  state.aiSuggestion = "";
  state.aiRange = null;
  state.aiBaseContent = "";
  state.aiBasePath = "";
  state.diffChanges = [];
  state.diffIndex = -1;
  els.reviewPanel.hidden = true;
  els.diffView.innerHTML = "";
  els.diffView.classList.remove("collapse-unchanged");
  els.toggleUnchangedButton.setAttribute("aria-pressed", "false");
  els.toggleUnchangedButton.textContent = "折叠未修改";
  els.diffSummary.textContent = "等待生成";
}

function getSelection() {
  return markdownEditor.getSelection();
}

function replaceRange(range, text, options = {}) {
  if (state.aiSuggestion && !options.fromAi) hideReview();
  const from = range ? range.from : 0;
  const to = range ? range.to : editorValue().length;
  markdownEditor.focus();
  markdownEditor.replaceRange(from, to, text);
}

function insertAtSelection(before, after = "", placeholder = "") {
  const { from, to, text } = getSelection();
  const selected = text || placeholder;
  replaceRange({ from, to }, `${before}${selected}${after}`);
  if (to === from) {
    markdownEditor.setSelection(from + before.length, from + before.length + selected.length);
  }
}

function insertBlock(block) {
  const { from, to } = getSelection();
  const current = editorValue();
  const prefix = from > 0 && current[from - 1] !== "\n" ? "\n\n" : "";
  const suffix = to < current.length && current[to] !== "\n" ? "\n" : "";
  replaceRange({ from, to }, `${prefix}${block}${suffix}`);
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
  if (Array.isArray(content)) return content.map((part) => part?.text || part?.content || "").join("\n").trim();
  return String(data.choices?.[0]?.text || "").trim();
}

async function callDirectChat(prompt, timeoutMs = 90000, signal) {
  const { baseUrl, key, model } = directAiSettings();
  if (!key) throw new Error("请先在左侧连接设置中填写 AI API Key。");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("AI API 地址必须以 https:// 开头。");

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const linked = linkedController(signal, timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: linked.controller.signal,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] })
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
      if (error.name === "AbortError" && signal?.aborted) {
        const canceled = new Error("AI 处理已取消。");
        canceled.code = "CANCELED";
        throw canceled;
      }
      if (error.name === "AbortError" && linked.timedOut()) {
        throw new Error(`浏览器直连中转站超时（${Math.round(timeoutMs / 1000)} 秒）。`);
      }
      const retryable = error instanceof TypeError || [502, 503, 504].includes(error.status);
      if (!retryable || attempt === 2) throw error;
      setStatus("AI 连接中断，正在自动重试一次...");
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } finally {
      linked.cleanup();
    }
  }
  throw new Error("浏览器直连中转站失败。");
}

async function requestAi(mode, markdown, chunkIndex = 0, chunkCount = 1, signal) {
  const directKey = els.aiKeyInput.value.trim();
  if (directKey) {
    const prompt = buildAiPrompt({ mode, markdown, chunkIndex, chunkCount });
    return { content: await callDirectChat(prompt, mode === "summary" ? 180000 : 90000, signal) };
  }
  const options = {
    method: "POST",
    timeoutMs: mode === "summary" ? 195000 : 120000,
    signal,
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
    if (error.code === "CANCELED" || !String(error.message || error).startsWith("网络请求失败")) throw error;
    setStatus("连接中断，正在自动重试一次...");
    await new Promise((resolve) => setTimeout(resolve, 1800));
    return api("/api/polish", options);
  }
}

async function testAiConnection() {
  const previous = els.testAiButton.textContent;
  els.testAiButton.disabled = true;
  els.testAiButton.textContent = "测试中...";
  try {
    const result = await callDirectChat("只回复 OK。");
    setStatus(`AI 连接成功：${directAiSettings().model} · ${result.slice(0, 30)}`);
  } finally {
    els.testAiButton.disabled = false;
    els.testAiButton.textContent = previous;
  }
}

async function processMarkdownChunks(mode, markdown, actionLabel, signal) {
  const chunks = splitMarkdown(markdown);
  const results = [];
  for (let index = 0; index < chunks.length; index += 1) {
    setStatus(`AI 正在${actionLabel}：第 ${index + 1}/${chunks.length} 部分`);
    els.polishButton.lastChild.textContent = `处理中 ${index + 1}/${chunks.length}`;
    const data = await requestAi(mode, chunks[index], index, chunks.length, signal);
    if (!data.content?.trim()) throw new Error(`AI 处理第 ${index + 1} 部分时返回了空内容。`);
    results.push(preserveOuterWhitespace(chunks[index], data.content));
  }
  return results.join("");
}

async function buildArticleMetadata(markdown, signal) {
  setStatus(`AI 正在一次性阅读全文并生成摘要、标签和分类，共 ${markdown.length} 字符`);
  els.polishButton.lastChild.textContent = "生成元数据...";
  const result = await requestAi("summary", markdown, 0, 1, signal);
  const metadata = parseArticleMetadata(result.content);
  if (!metadata.description) throw new Error("AI 没有返回有效摘要，请重试。");
  if (!metadata.tags.length) throw new Error("AI 没有返回有效标签，请重试。");
  if (!metadata.categories.length) throw new Error("AI 没有返回有效分类，请重试。");
  return metadata;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}

async function uploadImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) throw new Error("只能上传图片文件。");
  setStatus(`正在上传图片：${file.name}`);
  const data = await fileToDataUrl(file);
  const result = await api("/api/upload-image", {
    method: "POST",
    timeoutMs: 60000,
    body: JSON.stringify({ name: file.name, type: file.type, data })
  });
  insertAtSelection("", "", `![${file.name}](${result.url})`);
  setStatus(`图片已上传并插入：${result.url}`);
}

function runTool(tool) {
  if (tool === "undo") return undoEdit();
  if (tool === "redo") return redoEdit();
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
    info: () => insertBlock("<details class=\"callout callout-info\" open>\n<summary>提示</summary>\n<p>这里写提示内容。</p>\n</details>\n"),
    sample: () => insertBlock("### 样例输入\n\n```text\n\n```\n\n### 样例输出\n\n```text\n\n```\n"),
    more: () => insertBlock("<!--more-->\n")
  };
  blocks[tool]?.();
}

function buildLineDiff(beforeText, afterText) {
  const parts = window.Diff?.diffLines
    ? window.Diff.diffLines(beforeText, afterText)
    : [{ removed: true, value: beforeText }, { added: true, value: afterText }];
  const rows = [];
  for (const part of parts) {
    const type = part.added ? "add" : part.removed ? "remove" : "same";
    const lines = part.value.split("\n");
    if (lines.at(-1) === "") lines.pop();
    for (const line of lines) rows.push({ type, text: line });
  }
  return rows;
}

function renderDiff(beforeText, afterText, scopeLabel) {
  const diff = buildLineDiff(beforeText, afterText);
  const added = diff.filter((part) => part.type === "add").length;
  const removed = diff.filter((part) => part.type === "remove").length;
  els.diffSummary.textContent = added + removed
    ? `${scopeLabel} · 新增 ${added} 行 · 删除 ${removed} 行`
    : `${scopeLabel} · AI 没有改动内容`;
  const fragment = document.createDocumentFragment();
  state.diffChanges = [];
  for (const part of diff) {
    const row = document.createElement("div");
    row.className = `diff-line diff-${part.type}`;
    const mark = document.createElement("span");
    mark.className = "diff-mark";
    mark.textContent = part.type === "add" ? "+" : part.type === "remove" ? "-" : " ";
    const code = document.createElement("code");
    code.textContent = part.text || " ";
    row.append(mark, code);
    fragment.append(row);
    if (part.type !== "same") state.diffChanges.push(row);
  }
  els.diffView.replaceChildren(fragment);
  state.diffIndex = state.diffChanges.length ? 0 : -1;
  els.reviewPanel.hidden = false;
}

function scrollDiff(direction) {
  if (!state.diffChanges.length) return;
  state.diffIndex = (state.diffIndex + direction + state.diffChanges.length) % state.diffChanges.length;
  state.diffChanges[state.diffIndex].scrollIntoView({ behavior: "smooth", block: "center" });
}

function toggleUnchanged() {
  const collapsed = els.diffView.classList.toggle("collapse-unchanged");
  els.toggleUnchangedButton.setAttribute("aria-pressed", String(collapsed));
  els.toggleUnchangedButton.textContent = collapsed ? "显示未修改" : "折叠未修改";
}

function filteredPosts() {
  const query = els.postSearchInput.value.trim().toLowerCase();
  const posts = state.posts.filter((post) => !query
    || post.name.toLowerCase().includes(query)
    || post.path.toLowerCase().includes(query)
    || String(post.title || "").toLowerCase().includes(query));
  return sortPosts(posts, els.postSortSelect.value);
}

function renderPosts() {
  const posts = filteredPosts();
  els.postList.replaceChildren();
  els.postCount.textContent = `${state.posts.length} 篇`;
  if (!posts.length) {
    const empty = document.createElement("div");
    empty.className = "post-list-empty";
    const illustration = document.createElement("div");
    illustration.className = "list-empty-illustration";
    const icon = document.createElement("i");
    icon.dataset.lucide = state.posts.length ? "search-x" : "files";
    illustration.append(icon);
    const message = document.createElement("strong");
    message.textContent = state.posts.length ? "暂无匹配文章" : "文章列表为空";
    empty.append(illustration, message);
    els.postList.append(empty);
    window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
    return;
  }
  for (const post of posts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `post-item${post.path === state.currentPath ? " active" : ""}`;
    const title = document.createElement("span");
    title.className = "post-title";
    title.textContent = post.title || post.name.replace(/\.md$/i, "");
    const meta = document.createElement("span");
    meta.className = "post-meta";
    meta.textContent = post.date ? String(post.date).slice(0, 10) : post.name;
    button.append(title, meta);
    button.addEventListener("click", () => loadPost(post.path).catch(showError));
    els.postList.append(button);
  }
}

async function loadPosts(options = {}) {
  if (!state.token) throw new Error("请先在连接设置中保存 Admin Token。");
  if (!options.quiet) setStatus("正在加载文章列表...");
  const data = await api("/api/posts", { timeoutMs: 60000 });
  state.posts = data.posts || [];
  renderPosts();
  if (!options.quiet) setStatus(`已加载 ${state.posts.length} 篇文章。`);
}

function confirmNavigation() {
  if (!isDirty()) return true;
  return window.confirm("当前文章有未发布修改，本地草稿已经保留。仍要切换吗？");
}

async function loadPost(path, options = {}) {
  if (!options.skipConfirm && path !== state.currentPath && !confirmNavigation()) return;
  const sequence = ++state.loadSequence;
  setStatus("正在加载文章...");
  const data = await api(`/api/post?path=${encodeURIComponent(path)}`, { timeoutMs: 30000 });
  if (sequence !== state.loadSequence) return;
  state.currentPath = data.path;
  state.currentSha = data.sha;
  els.pathInput.value = data.path;
  const draft = localStorage.getItem(getDraftKey(data.path));
  let content = data.content;
  if (draft && draft !== data.content) {
    const restore = window.confirm("检测到这篇文章的本地未发布草稿。\n\n确定：恢复草稿\n取消：使用 GitHub 版本");
    if (restore) content = draft;
  }
  markdownEditor.setValue(content);
  setBaseline(data.content, data.path);
  hideReview();
  renderPreviewNow();
  els.editorMeta.textContent = `${content.length} 字符`;
  setDraftStatus(content === data.content ? "GitHub 版本已加载" : "已恢复本地草稿");
  localStorage.setItem("blog-admin-last-path", data.path);
  renderPosts();
  setStatus(`已打开：${extractTitle(content)}`);
  setPublishStatus("已发布", "success");
}

function newPost(options = {}) {
  if (!options.skipConfirm && !confirmNavigation()) return;
  state.loadSequence += 1;
  const { path, content } = createNewPost(new Date(), "新文章");
  state.currentPath = "";
  state.currentSha = "";
  els.pathInput.value = path;
  markdownEditor.setValue(content);
  setBaseline(content, path);
  hideReview();
  renderPreviewNow();
  els.editorMeta.textContent = `${content.length} 字符`;
  setDraftStatus("新草稿尚未修改");
  setPublishStatus("尚未发布");
  renderPosts();
  setStatus("已创建新草稿。");
  markdownEditor.focus();
}

function deployLabel(run) {
  if (!run) return "等待创建";
  if (run.status !== "completed") return run.status === "queued" ? "排队中" : "构建中";
  return run.conclusion === "success" ? "成功" : `失败：${run.conclusion || "unknown"}`;
}

async function waitForDeployStatus(commitSha, commitUrl) {
  const sequence = ++state.deploySequence;
  for (let attempt = 1; attempt <= 16; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 5000 : 12000));
    if (sequence !== state.deploySequence) return;
    const query = commitSha ? `?sha=${encodeURIComponent(commitSha)}` : "";
    const data = await api(`/api/deploy-status${query}`, { timeoutMs: 30000 });
    const sourceText = deployLabel(data.source);
    const pagesText = deployLabel(data.pages);
    setStatus(`发布进度：Hexo ${sourceText} · Pages ${pagesText}`);
    const publishLabel = data.pages?.status === "completed" && data.pages.conclusion === "success"
      ? "已上线"
      : data.source?.status === "completed" && data.source.conclusion === "success"
        ? "正在部署"
        : "正在构建";
    setPublishStatus(publishLabel, publishLabel === "已上线" ? "success" : "progress");
    if (data.source?.status === "completed" && data.source.conclusion !== "success") {
      setPublishStatus("构建失败", "error");
      throw new Error(`Hexo 构建失败。${data.source.url || commitUrl || ""}`);
    }
    if (data.pages?.status === "completed") {
      if (data.pages.conclusion === "success") {
        setStatus("文章已经部署到网站。");
        setPublishStatus("已上线", "success");
      } else {
        setPublishStatus("部署失败", "error");
        throw new Error(`GitHub Pages 部署失败：${data.pages.conclusion || "unknown"}`);
      }
      return;
    }
  }
  setStatus("文章已提交，但部署仍在进行。稍后可刷新网站查看。");
  setPublishStatus("部署时间较长", "progress");
}

function setAiRunning(running) {
  els.polishButton.disabled = running;
  els.modeSelect.disabled = running;
  els.cancelAiButton.hidden = !running;
  els.aiProgress.hidden = !running;
  document.body.classList.toggle("ai-running", running);
  if (!running) els.polishButton.lastChild.textContent = "AI 处理";
}

async function polish() {
  const fullText = editorValue();
  const pathAtStart = els.pathInput.value.trim();
  if (!fullText) throw new Error("当前文章是空的。");
  const selection = getSelection();
  const hasSelection = selection.text.trim().length > 0;
  const mode = els.modeSelect.value;
  const labels = { polish: "润色", format: "整理格式", check: "检查问题" };
  const useSelection = hasSelection && mode !== "check" && mode !== "summary";
  const target = useSelection
    ? { from: selection.from, to: selection.to, text: selection.text, label: "选中文本" }
    : { from: 0, to: fullText.length, text: fullText, label: "整篇文章" };
  if (!target.text.trim()) throw new Error("没有可处理的正文。");

  els.errorNotice.hidden = true;
  const controller = new AbortController();
  state.aiController = controller;
  setAiRunning(true);
  try {
    const settings = directAiSettings();
    if (settings.key) {
      setStatus(`正在连接 AI：${settings.model}`);
    } else {
      const config = await api("/api/ai-config", { timeoutMs: 15000, signal: controller.signal });
      if (!config.configured) throw new Error("请在连接设置中填写 AI API Key。");
      setStatus(`正在连接 AI：${els.modelInput.value.trim() || config.model}`);
    }
    els.polishButton.lastChild.textContent = "处理中...";
    const suggestion = mode === "summary"
      ? upsertArticleMetadata(fullText, await buildArticleMetadata(fullText, controller.signal))
      : await processMarkdownChunks(mode, target.text, labels[mode] || "处理", controller.signal);

    if (!isDocumentVersionCurrent(fullText, pathAtStart, editorValue(), els.pathInput.value.trim())) {
      throw new Error("AI 处理期间正文发生了变化。为避免覆盖新内容，本次结果已丢弃，请重新执行。");
    }
    state.aiOriginal = target.text;
    state.aiSuggestion = suggestion;
    state.aiRange = target.from === 0 && target.to === fullText.length ? null : { from: target.from, to: target.to };
    state.aiBaseContent = fullText;
    state.aiBasePath = pathAtStart;
    renderDiff(state.aiOriginal, state.aiSuggestion, target.label);
    setStatus("AI 建议已生成，请检查完整差异。");
  } catch (error) {
    if (error.code === "CANCELED") {
      setStatus("AI 处理已取消。");
      return;
    }
    throw error;
  } finally {
    if (state.aiController === controller) state.aiController = null;
    setAiRunning(false);
  }
}

function applyAiSuggestion() {
  if (!state.aiSuggestion) throw new Error("当前没有可应用的 AI 建议。");
  if (!isDocumentVersionCurrent(state.aiBaseContent, state.aiBasePath, editorValue(), els.pathInput.value.trim())) {
    hideReview();
    throw new Error("正文已经变化，旧的 AI 建议不能再应用，请重新生成。");
  }
  const suggestion = state.aiSuggestion;
  const range = state.aiRange;
  replaceRange(range, suggestion, { fromAi: true });
  hideReview();
  setStatus("AI 修改已应用，保存发布前请检查预览。");
}

async function copyAiSuggestion() {
  if (!state.aiSuggestion) throw new Error("当前没有可复制的 AI 建议。");
  await navigator.clipboard.writeText(state.aiSuggestion);
  setStatus("AI 建议已复制。");
}

function discardAiSuggestion() {
  hideReview();
  setStatus("已丢弃 AI 建议。");
}

async function savePost() {
  const path = els.pathInput.value.trim();
  const content = editorValue();
  if (!path || !content.trim()) throw new Error("文件路径和文章内容不能为空。");
  const draftKey = getDraftKey(path);
  els.saveButton.disabled = true;
  els.saveButton.lastChild.textContent = "保存中...";
  setStatus("正在提交到 GitHub...");
  setPublishStatus("正在提交", "progress");
  try {
    const data = await api("/api/post", {
      method: "PUT",
      body: JSON.stringify({ path, content, sha: state.currentSha, message: `Update ${path.replace(/^source\/_posts\//, "")}` })
    });
    state.currentPath = data.path;
    state.currentSha = data.sha;
    setBaseline(content, data.path);
    hideReview();
    clearTimeout(state.draftTimer);
    localStorage.removeItem(draftKey);
    localStorage.setItem("blog-admin-last-path", data.path);
    setDraftStatus("已提交到 GitHub");
    setPublishStatus("等待构建", "progress");
    setStatus("文章已提交，正在等待 Hexo 和 GitHub Pages 部署。");
    els.saveButton.classList.remove("success-pop");
    requestAnimationFrame(() => els.saveButton.classList.add("success-pop"));
    await loadPosts({ quiet: true });
    waitForDeployStatus(data.commitSha, data.commit).catch(showError);
  } finally {
    els.saveButton.disabled = false;
    els.saveButton.lastChild.textContent = "保存并发布";
  }
}

function showError(error) {
  setStatus(error?.message || String(error), true);
}

function bind(handler) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      showError(error);
    }
  };
}

function setViewMode(mode) {
  if (!["source", "split", "preview"].includes(mode)) mode = "split";
  state.viewMode = mode;
  els.workspace.dataset.view = mode;
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  localStorage.setItem("blog-admin-view", mode);
}

function setSyncScroll(enabled) {
  state.syncScroll = enabled;
  els.syncScrollButton.setAttribute("aria-pressed", String(enabled));
  els.syncScrollButton.classList.toggle("active", enabled);
  localStorage.setItem("blog-admin-sync-scroll", String(enabled));
}

function setTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem("blog-admin-theme", state.theme);
  els.highlightLight.disabled = state.theme === "dark";
  els.highlightDark.disabled = state.theme !== "dark";
  markdownEditor?.setTheme(state.theme);

  const nextTheme = state.theme === "dark" ? "浅色" : "深色";
  els.themeButton.title = `切换${nextTheme}主题`;
  els.themeButton.setAttribute("aria-label", `切换${nextTheme}主题`);
  const icon = document.createElement("i");
  icon.dataset.lucide = state.theme === "dark" ? "sun" : "moon";
  els.themeButton.replaceChildren(icon);
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function syncScroll(source, target) {
  if (!state.syncScroll || state.syncingScroll) return;
  const sourceMetrics = source.getScrollMetrics
    ? source.getScrollMetrics()
    : { top: source.scrollTop, height: source.scrollHeight, client: source.clientHeight };
  const targetMetrics = target.getScrollMetrics
    ? target.getScrollMetrics()
    : { top: target.scrollTop, height: target.scrollHeight, client: target.clientHeight };
  const sourceRange = sourceMetrics.height - sourceMetrics.client;
  const targetRange = targetMetrics.height - targetMetrics.client;
  if (sourceRange <= 0 || targetRange <= 0) return;
  state.syncingScroll = true;
  const nextTop = (sourceMetrics.top / sourceRange) * targetRange;
  if (target.setScrollTop) target.setScrollTop(nextTop);
  else target.scrollTop = nextTop;
  requestAnimationFrame(() => { state.syncingScroll = false; });
}

function setupMarkdownEditor() {
  markdownEditor = createMarkdownEditor({
    parent: els.editorMount,
    value: "",
    theme: state.theme,
    onChange() {
      if (state.aiSuggestion) hideReview();
      markDocumentChanged();
    },
    onSave() {
      savePost().catch(showError);
    },
    onImage(file) {
      uploadImageFile(file).catch(showError);
    },
    onScroll() {
      syncScroll(markdownEditor, els.preview);
    }
  });
}

function setupDivider() {
  let dragging = false;
  const resize = (clientX) => {
    const bounds = els.workspace.getBoundingClientRect();
    const width = Math.min(Math.max(clientX - bounds.left, 280), bounds.width - 280);
    els.workspace.style.setProperty("--source-width", `${width}px`);
  };
  els.workspaceDivider.addEventListener("pointerdown", (event) => {
    dragging = true;
    els.workspaceDivider.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing");
  });
  els.workspaceDivider.addEventListener("pointermove", (event) => {
    if (dragging) resize(event.clientX);
  });
  els.workspaceDivider.addEventListener("pointerup", (event) => {
    dragging = false;
    els.workspaceDivider.releasePointerCapture(event.pointerId);
    document.body.classList.remove("resizing");
  });
  els.workspaceDivider.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const bounds = els.workspace.getBoundingClientRect();
    const current = els.workspaceDivider.getBoundingClientRect().left;
    resize(current + (event.key === "ArrowLeft" ? -24 : 24));
  });
}

els.saveTokenButton.addEventListener("click", bind(async () => {
  state.token = els.tokenInput.value.trim();
  localStorage.setItem("blog-admin-token", state.token);
  await loadPosts();
  setStatus("Admin Token 已保存，文章列表已刷新。");
}));
els.closeErrorNotice.addEventListener("click", () => { els.errorNotice.hidden = true; });
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
els.aiKeyInput.addEventListener("input", () => sessionStorage.setItem("blog-admin-ai-key", els.aiKeyInput.value.trim()));
els.testAiButton.addEventListener("click", bind(testAiConnection));
els.loadPostsButton.addEventListener("click", bind(loadPosts));
els.newPostButton.addEventListener("click", () => newPost());
els.polishButton.addEventListener("click", bind(polish));
els.cancelAiButton.addEventListener("click", () => state.aiController?.abort());
els.saveButton.addEventListener("click", bind(savePost));
els.applyAiButton.addEventListener("click", bind(async () => applyAiSuggestion()));
els.copyAiButton.addEventListener("click", bind(copyAiSuggestion));
els.discardAiButton.addEventListener("click", discardAiSuggestion);
els.previousChangeButton.addEventListener("click", () => scrollDiff(-1));
els.nextChangeButton.addEventListener("click", () => scrollDiff(1));
els.toggleUnchangedButton.addEventListener("click", toggleUnchanged);
els.postSearchInput.addEventListener("input", renderPosts);
els.postSortSelect.addEventListener("change", renderPosts);
els.pathInput.addEventListener("input", () => markDocumentChanged());
els.imageFileInput.addEventListener("change", bind(async () => {
  const [file] = els.imageFileInput.files || [];
  await uploadImageFile(file);
  els.imageFileInput.value = "";
}));
document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    runTool(button.dataset.tool);
    button.closest(".more-tools")?.removeAttribute("open");
  });
});
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setViewMode(button.dataset.view)));
els.syncScrollButton.addEventListener("click", () => setSyncScroll(!state.syncScroll));
els.themeButton.addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
els.preview.addEventListener("scroll", () => syncScroll(els.preview, markdownEditor));
window.addEventListener("beforeunload", (event) => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});

async function initialize() {
  setupMarkdownEditor();
  setTheme(state.theme);
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
  setViewMode(state.viewMode);
  setSyncScroll(state.syncScroll);
  setupDivider();
  newPost({ skipConfirm: true });
  if (!state.token) {
    document.querySelector(".settings-panel")?.setAttribute("open", "");
    setStatus("请先在连接设置中保存 Admin Token。");
    return;
  }
  try {
    await loadPosts();
    const lastPath = localStorage.getItem("blog-admin-last-path");
    const target = state.posts.some((post) => post.path === lastPath) ? lastPath : state.posts[0]?.path;
    if (target) await loadPost(target, { skipConfirm: true });
  } catch (error) {
    showError(error);
    document.querySelector(".settings-panel")?.setAttribute("open", "");
  }
}

initialize();
