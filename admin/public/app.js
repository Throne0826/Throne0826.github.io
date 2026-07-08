const state = {
  token: localStorage.getItem("blog-admin-token") || "",
  currentPath: "",
  currentSha: "",
  posts: []
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
  return body
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\n/g, "<br>");
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
    els.editorInput.value = data.content || "";
    updatePreview();
    setStatus("AI processing finished. Please review before saving.");
  } finally {
    els.polishButton.disabled = false;
    els.polishButton.textContent = previousText;
  }
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
els.editorInput.addEventListener("input", updatePreview);

newPost();

