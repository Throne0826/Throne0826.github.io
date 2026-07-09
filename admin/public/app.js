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

const els = {
  tokenInput: document.querySelector("#tokenInput"),
  saveTokenButton: document.querySelector("#saveTokenButton"),
  loadPostsButton: document.querySelector("#loadPostsButton"),
  newPostButton: document.querySelector("#newPostButton"),
  postSearchInput: document.querySelector("#postSearchInput"),
  postSortSelect: document.querySelector("#postSortSelect"),
  postList: document.querySelector("#postList"),
  pathInput: document.querySelector("#pathInput"),
  modeSelect: document.querySelector("#modeSelect"),
  polishButton: document.querySelector("#polishButton"),
  saveButton: document.querySelector("#saveButton"),
  applyAiButton: document.querySelector("#applyAiButton"),
  copyAiButton: document.querySelector("#copyAiButton"),
  discardAiButton: document.querySelector("#discardAiButton"),
  reviewPanel: document.querySelector("#reviewPanel"),
  diffSummary: document.querySelector("#diffSummary"),
  beforeView: document.querySelector("#beforeView"),
  afterView: document.querySelector("#afterView"),
  diffView: document.querySelector("#diffView"),
  editorInput: document.querySelector("#editorInput"),
  imageFileInput: document.querySelector("#imageFileInput"),
  editorMeta: document.querySelector("#editorMeta"),
  preview: document.querySelector("#preview"),
  status: document.querySelector("#status")
};

els.tokenInput.value = state.token;

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
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
  state.undoStack.push(snapshot());
  if (state.undoStack.length > 80) state.undoStack.shift();
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
    if (error.name === "AbortError") throw new Error("Request timed out. Check Render logs or retry later.");
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
      return window.marked.parse(body);
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
  els.beforeView.textContent = "";
  els.afterView.value = "";
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
  if (!range) {
    els.editorInput.value = text;
  } else {
    const current = els.editorInput.value;
    els.editorInput.value = `${current.slice(0, range.from)}${text}${current.slice(range.to)}`;
    els.editorInput.selectionStart = els.editorInput.selectionEnd = range.from + text.length;
  }
  els.editorInput.focus();
  updatePreview();
  saveDraftSoon();
}

function insertAtSelection(before, after = "", placeholder = "") {
  const { from, to, text } = getSelection();
  const selected = text || placeholder;
  const insert = `${before}${selected}${after}`;
  replaceRange({ from, to }, insert);
  const cursorStart = from + before.length;
  const cursorEnd = cursorStart + selected.length;
  els.editorInput.selectionStart = cursorStart;
  els.editorInput.selectionEnd = cursorEnd;
}

function insertBlock(block) {
  const { from, to } = getSelection();
  const current = els.editorInput.value;
  const prefix = from > 0 && current[from - 1] !== "\n" ? "\n\n" : "";
  const suffix = to < current.length && current[to] !== "\n" ? "\n" : "";
  replaceRange({ from, to }, `${prefix}${block}${suffix}`);
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
    bold: () => insertAtSelection("**", "**", "加粗文本"),
    italic: () => insertAtSelection("*", "*", "斜体文本"),
    code: () => insertBlock("```cpp\n// code\n```\n"),
    link: () => insertAtSelection("[", "](https://)", "链接文本"),
    image: () => els.imageFileInput.click(),
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
  els.beforeView.textContent = beforeText;
  els.afterView.value = afterText;
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
  recordUndo();
  const draft = localStorage.getItem(getDraftKey());
  if (draft && draft !== data.content) {
    const useDraft = window.confirm("这个浏览器里有未发布的本地草稿。是否恢复草稿？\n\n确定：恢复草稿\n取消：使用 GitHub 上的版本");
    els.editorInput.value = useDraft ? draft : data.content;
  } else {
    els.editorInput.value = data.content;
  }
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
  recordUndo();
  els.editorInput.value = `---\ntitle: ${title}\ndate: ${date} ${time}\nmathjax: true\ntags:\n  - \ncategories:\n  - \n---\n\n# ${title}\n\n`;
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
  const fullText = els.editorInput.value.trim();
  if (!fullText) {
    setStatus("Current post is empty.", true);
    return;
  }
  const selection = getSelection();
  const hasSelection = selection.text.trim().length > 0;
  const targetText = hasSelection ? selection.text : fullText;
  const previousText = els.polishButton.textContent;
  els.polishButton.disabled = true;
  els.polishButton.textContent = "处理中...";
  setStatus(hasSelection ? "AI is processing selected text..." : "AI is processing the whole post...");
  try {
    const data = await api("/api/polish", {
      method: "POST",
      timeoutMs: 120000,
      body: JSON.stringify({ mode: els.modeSelect.value, markdown: targetText })
    });
    state.aiOriginal = targetText;
    state.aiSuggestion = data.content || "";
    state.aiRange = hasSelection ? { from: selection.from, to: selection.to } : null;
    renderDiff(state.aiOriginal, state.aiSuggestion, hasSelection ? "选中文本" : "整篇文章");
    setStatus("AI suggestion is ready. You can edit the suggestion before applying it.");
  } finally {
    els.polishButton.disabled = false;
    els.polishButton.textContent = previousText;
  }
}

function applyAiSuggestion() {
  if (!state.aiSuggestion && !els.afterView.value) {
    setStatus("No AI suggestion to apply.", true);
    return;
  }
  replaceRange(state.aiRange, els.afterView.value || state.aiSuggestion);
  hideReview();
  setStatus("AI changes applied. Review the preview before saving.");
}

async function copyAiSuggestion() {
  const text = els.afterView.value || state.aiSuggestion;
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
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redoEdit();
    else undoEdit();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoEdit();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    savePost().catch((error) => setStatus(error.message || String(error), true));
  }
});

newPost();





