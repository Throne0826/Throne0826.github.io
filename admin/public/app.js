const state = {
  token: localStorage.getItem("blog-admin-token") || "",
  currentPath: "",
  currentSha: "",
  posts: [],
  aiOriginal: "",
  aiSuggestion: "",
  aiRange: null,
  editorView: null,
  fallbackEditor: null
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
  editorHost: document.querySelector("#editorHost"),
  editorMeta: document.querySelector("#editorMeta"),
  preview: document.querySelector("#preview"),
  status: document.querySelector("#status")
};

els.tokenInput.value = state.token;

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

async function setupEditor() {
  try {
    const [{ EditorState }, { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars }, { defaultKeymap, history, historyKeymap }, { markdown }, { syntaxHighlighting, defaultHighlightStyle }] = await Promise.all([
      import("https://esm.sh/@codemirror/state@6.4.1"),
      import("https://esm.sh/@codemirror/view@6.28.6"),
      import("https://esm.sh/@codemirror/commands@6.6.0"),
      import("https://esm.sh/@codemirror/lang-markdown@6.2.5"),
      import("https://esm.sh/@codemirror/language@6.10.2")
    ]);

    const saveKey = {
      key: "Mod-s",
      preventDefault: true,
      run() {
        savePost().catch((error) => setStatus(error.message || String(error), true));
        return true;
      }
    };

    state.editorView = new EditorView({
      parent: els.editorHost,
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          highlightSpecialChars(),
          history(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle),
          highlightActiveLine(),
          keymap.of([saveKey, ...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              if (state.aiSuggestion) hideReview();
              updatePreview();
            }
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "14px" },
            ".cm-scroller": { fontFamily: '"Cascadia Code", Consolas, "Microsoft YaHei UI", monospace' },
            ".cm-content": { padding: "14px 0", lineHeight: "1.65" },
            ".cm-line": { padding: "0 16px" },
            ".cm-gutters": { backgroundColor: "#f7f8fa", borderRight: "1px solid #d9dde5" },
            ".cm-activeLine": { backgroundColor: "#eef5f3" },
            ".cm-activeLineGutter": { backgroundColor: "#e5efec" }
          })
        ]
      })
    });
    setStatus("Editor ready. Ctrl+S saves to GitHub.");
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.className = "fallback-editor";
    textarea.spellcheck = false;
    textarea.addEventListener("input", () => {
      if (state.aiSuggestion) hideReview();
      updatePreview();
    });
    els.editorHost.appendChild(textarea);
    state.fallbackEditor = textarea;
    setStatus(`CodeMirror failed to load; using textarea. ${error.message || error}`, true);
  }
}

function getEditorValue() {
  if (state.editorView) return state.editorView.state.doc.toString();
  return state.fallbackEditor?.value || "";
}

function setEditorValue(value) {
  if (state.editorView) {
    state.editorView.dispatch({
      changes: { from: 0, to: state.editorView.state.doc.length, insert: value }
    });
    return;
  }
  if (state.fallbackEditor) state.fallbackEditor.value = value;
}

function getEditorSelection() {
  if (state.editorView) {
    const range = state.editorView.state.selection.main;
    return {
      from: range.from,
      to: range.to,
      text: state.editorView.state.doc.sliceString(range.from, range.to)
    };
  }
  const el = state.fallbackEditor;
  return {
    from: el?.selectionStart || 0,
    to: el?.selectionEnd || 0,
    text: el ? el.value.slice(el.selectionStart, el.selectionEnd) : ""
  };
}

function replaceEditorRange(range, text) {
  if (!range) {
    setEditorValue(text);
    return;
  }
  if (state.editorView) {
    state.editorView.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length }
    });
    state.editorView.focus();
    return;
  }
  const el = state.fallbackEditor;
  const current = el.value;
  el.value = `${current.slice(0, range.from)}${text}${current.slice(range.to)}`;
  el.selectionStart = el.selectionEnd = range.from + text.length;
  el.focus();
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
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Check Render logs or retry later.");
    }
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
    window.marked.setOptions({ breaks: false, gfm: true, headerIds: false, mangle: false });
    return window.marked.parse(body);
  }
  return escapeHtml(body).replace(/\n/g, "<br>");
}

let mathRenderTimer = 0;

function updatePreview() {
  const value = getEditorValue();
  els.preview.innerHTML = renderMarkdown(value);
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
  els.afterView.textContent = "";
  els.diffView.innerHTML = "";
  els.diffSummary.textContent = "等待生成";
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
    if (before[i] === after[j]) {
      diff.push({ type: "same", text: before[i] });
      i += 1;
      j += 1;
    } else if (rows[i + 1][j] >= rows[i][j + 1]) {
      diff.push({ type: "remove", text: before[i] });
      i += 1;
    } else {
      diff.push({ type: "add", text: after[j] });
      j += 1;
    }
  }
  while (i < before.length) diff.push({ type: "remove", text: before[i++] });
  while (j < after.length) diff.push({ type: "add", text: after[j++] });
  return diff;
}

function compactDiff(diff) {
  const compacted = [];
  let sameBuffer = [];
  const flushSame = () => {
    if (!sameBuffer.length) return;
    if (sameBuffer.length <= 8) compacted.push(...sameBuffer);
    else {
      compacted.push(...sameBuffer.slice(0, 3));
      compacted.push({ type: "skip", text: `${sameBuffer.length - 6} unchanged lines` });
      compacted.push(...sameBuffer.slice(-3));
    }
    sameBuffer = [];
  };

  for (const part of diff) {
    if (part.type === "same") sameBuffer.push(part);
    else {
      flushSame();
      compacted.push(part);
    }
  }
  flushSame();
  return compacted;
}

function renderDiff(beforeText, afterText, scopeLabel) {
  const diff = buildLineDiff(beforeText, afterText);
  const added = diff.filter((part) => part.type === "add").length;
  const removed = diff.filter((part) => part.type === "remove").length;
  const changed = added + removed;
  const display = changed ? compactDiff(diff) : diff;

  els.diffSummary.textContent = changed
    ? `${scopeLabel}，新增 ${added} 行，删除 ${removed} 行`
    : `${scopeLabel}，AI 没有改动内容`;
  els.beforeView.textContent = beforeText;
  els.afterView.textContent = afterText;
  els.diffView.innerHTML = display.map((part) => {
    if (part.type === "skip") {
      return `<div class="diff-line diff-skip"><span class="diff-mark">...</span><code>${escapeHtml(part.text)}</code></div>`;
    }
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
    if (sort === "name-desc") return b.name.localeCompare(a.name, "zh-CN");
    if (sort === "date-desc") return b.name.localeCompare(a.name, "zh-CN");
    if (sort === "date-asc") return a.name.localeCompare(b.name, "zh-CN");
    return a.name.localeCompare(b.name, "zh-CN");
  });
  return posts;
}

function renderPosts() {
  els.postList.innerHTML = "";
  const posts = filteredPosts();
  for (const post of posts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `post-item${post.path === state.currentPath ? " active" : ""}`;
    button.textContent = post.name;
    button.addEventListener("click", () => loadPost(post.path));
    els.postList.appendChild(button);
  }
}

async function loadPosts() {
  setStatus("Loading posts...");
  const data = await api("/api/posts");
  state.posts = data.posts || [];
  renderPosts();
  setStatus(`Loaded ${state.posts.length} posts`);
}

async function loadPost(path) {
  setStatus("Loading post...");
  const data = await api(`/api/post?path=${encodeURIComponent(path)}`);
  state.currentPath = data.path;
  state.currentSha = data.sha;
  els.pathInput.value = data.path;
  setEditorValue(data.content);
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
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  const title = "新文章";
  state.currentPath = "";
  state.currentSha = "";
  els.pathInput.value = `source/_posts/${date}-${slugifyTitle(title)}.md`;
  setEditorValue(`---\ntitle: ${title}\ndate: ${date} ${time}\ntags:\n  - \ncategories:\n  - \n---\n\n# ${title}\n\n`);
  hideReview();
  updatePreview();
  renderPosts();
  setStatus("Draft created. Select text for partial AI editing, or run AI on the whole post.");
}

async function polish() {
  const fullText = getEditorValue().trim();
  if (!fullText) {
    setStatus("Current post is empty.", true);
    return;
  }

  const selection = getEditorSelection();
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
    setStatus("AI suggestion is ready. Compare, then apply/copy/discard.");
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
  replaceEditorRange(state.aiRange, state.aiSuggestion);
  hideReview();
  updatePreview();
  setStatus("AI changes applied. Review the preview before saving.");
}

async function copyAiSuggestion() {
  if (!state.aiSuggestion) {
    setStatus("No AI suggestion to copy.", true);
    return;
  }
  await navigator.clipboard.writeText(state.aiSuggestion);
  setStatus("AI suggestion copied.");
}

function discardAiSuggestion() {
  hideReview();
  setStatus("AI suggestion discarded.");
}

async function savePost() {
  const path = els.pathInput.value.trim();
  const content = getEditorValue();
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
      body: JSON.stringify({
        path,
        content,
        sha: state.currentSha,
        message: `Update ${path.replace(/^source\/_posts\//, "")}`
      })
    });
    state.currentPath = data.path;
    state.currentSha = data.sha;
    hideReview();
    setStatus(`Committed. GitHub Actions will deploy: ${data.commit || data.path}`);
    await loadPosts();
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

await setupEditor();
newPost();
