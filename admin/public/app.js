const state = {
  token: localStorage.getItem("blog-admin-token") || "",
  currentPath: "",
  currentSha: "",
  posts: [],
  aiOriginal: "",
  aiSuggestion: ""
};

const els = {
  tokenInput: document.querySelector("#tokenInput"),
  saveTokenButton: document.querySelector("#saveTokenButton"),
  loadPostsButton: document.querySelector("#loadPostsButton"),
  newPostButton: document.querySelector("#newPostButton"),
  postList: document.querySelector("#postList"),
  pathInput: document.querySelector("#pathInput"),
  modeSelect: document.querySelector("#modeSelect"),
  polishButton: document.querySelector("#polishButton"),
  saveButton: document.querySelector("#saveButton"),
  applyAiButton: document.querySelector("#applyAiButton"),
  discardAiButton: document.querySelector("#discardAiButton"),
  reviewPanel: document.querySelector("#reviewPanel"),
  diffSummary: document.querySelector("#diffSummary"),
  diffView: document.querySelector("#diffView"),
  editorInput: document.querySelector("#editorInput"),
  preview: document.querySelector("#preview"),
  status: document.querySelector("#status")
};

els.tokenInput.value = state.token;

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
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
    window.marked.setOptions({
      breaks: false,
      gfm: true,
      headerIds: false,
      mangle: false
    });
    return window.marked.parse(body);
  }
  return escapeHtml(body).replace(/\n/g, "<br>");
}

let mathRenderTimer = 0;

function updatePreview() {
  els.preview.innerHTML = renderMarkdown(els.editorInput.value);
  clearTimeout(mathRenderTimer);
  mathRenderTimer = setTimeout(() => {
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([els.preview]).catch((error) => {
        setStatus(error.message || String(error), true);
      });
    }
  }, 80);
}

function hideReview() {
  state.aiOriginal = "";
  state.aiSuggestion = "";
  els.reviewPanel.hidden = true;
  els.diffView.innerHTML = "";
  els.diffSummary.textContent = "等待生成";
}

function buildLineDiff(beforeText, afterText) {
  const before = beforeText.split("\n");
  const after = afterText.split("\n");
  const rows = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      rows[i][j] = before[i] === after[j]
        ? rows[i + 1][j + 1] + 1
        : Math.max(rows[i + 1][j], rows[i][j + 1]);
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
  while (i < before.length) {
    diff.push({ type: "remove", text: before[i] });
    i += 1;
  }
  while (j < after.length) {
    diff.push({ type: "add", text: after[j] });
    j += 1;
  }
  return diff;
}

function compactDiff(diff) {
  const compacted = [];
  let sameBuffer = [];

  function flushSame(forceAll = false) {
    if (!sameBuffer.length) return;
    if (forceAll || sameBuffer.length <= 8) {
      compacted.push(...sameBuffer);
    } else {
      compacted.push(...sameBuffer.slice(0, 3));
      compacted.push({ type: "skip", text: `${sameBuffer.length - 6} unchanged lines` });
      compacted.push(...sameBuffer.slice(-3));
    }
    sameBuffer = [];
  }

  for (const part of diff) {
    if (part.type === "same") {
      sameBuffer.push(part);
    } else {
      flushSame(false);
      compacted.push(part);
    }
  }
  flushSame(false);
  return compacted;
}

function renderDiff(beforeText, afterText) {
  const diff = buildLineDiff(beforeText, afterText);
  const added = diff.filter((part) => part.type === "add").length;
  const removed = diff.filter((part) => part.type === "remove").length;
  const changed = added + removed;
  const display = changed ? compactDiff(diff) : diff;

  els.diffSummary.textContent = changed
    ? `新增 ${added} 行，删除 ${removed} 行`
    : "AI 没有改动内容";

  els.diffView.innerHTML = display.map((part) => {
    if (part.type === "skip") {
      return `<div class="diff-line diff-skip"><span class="diff-mark">...</span><code>${escapeHtml(part.text)}</code></div>`;
    }
    const mark = part.type === "add" ? "+" : part.type === "remove" ? "-" : " ";
    return `<div class="diff-line diff-${part.type}"><span class="diff-mark">${mark}</span><code>${escapeHtml(part.text || " ")}</code></div>`;
  }).join("");

  els.reviewPanel.hidden = false;
}

function renderPosts() {
  els.postList.innerHTML = "";
  for (const post of state.posts) {
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
  els.editorInput.value = data.content;
  hideReview();
  updatePreview();
  renderPosts();
  setStatus(`Opened ${data.path}`);
}

function slugifyTitle(title) {
  return title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "new-post";
}

function newPost() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  const title = "新文章";
  state.currentPath = "";
  state.currentSha = "";
  els.pathInput.value = `source/_posts/${date}-${slugifyTitle(title)}.md`;
  els.editorInput.value = `---\ntitle: ${title}\ndate: ${date} ${time}\ntags:\n  - \ncategories:\n  - \n---\n\n# ${title}\n\n`;
  hideReview();
  updatePreview();
  renderPosts();
  setStatus("Draft created. Save will commit to GitHub and trigger deploy.");
}

async function polish() {
  const markdown = els.editorInput.value.trim();
  if (!markdown) {
    setStatus("Current post is empty.", true);
    return;
  }

  const previousText = els.polishButton.textContent;
  els.polishButton.disabled = true;
  els.polishButton.textContent = "处理中...";
  setStatus("AI is processing. This usually takes 10-30 seconds...");

  try {
    const data = await api("/api/polish", {
      method: "POST",
      timeoutMs: 120000,
      body: JSON.stringify({
        mode: els.modeSelect.value,
        markdown
      })
    });
    state.aiOriginal = markdown;
    state.aiSuggestion = data.content || "";
    renderDiff(state.aiOriginal, state.aiSuggestion);
    setStatus("AI suggestion is ready. Review the diff, then apply or discard.");
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
  els.editorInput.value = state.aiSuggestion;
  hideReview();
  updatePreview();
  setStatus("AI changes applied. Review the preview before saving.");
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
els.discardAiButton.addEventListener("click", discardAiSuggestion);
els.editorInput.addEventListener("input", () => {
  if (state.aiSuggestion) hideReview();
  updatePreview();
});

newPost();
