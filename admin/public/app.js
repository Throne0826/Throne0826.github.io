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
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-admin-token": state.token,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(markdown) {
  const withoutFrontMatter = markdown.replace(/^---[\s\S]*?---\s*/, "");
  const escaped = escapeHtml(withoutFrontMatter);
  const withCode = escaped.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  return withCode
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith("<pre>")) return block;
      if (/^###\s/.test(block)) return `<h3>${block.replace(/^###\s/, "")}</h3>`;
      if (/^##\s/.test(block)) return `<h2>${block.replace(/^##\s/, "")}</h2>`;
      if (/^#\s/.test(block)) return `<h1>${block.replace(/^#\s/, "")}</h1>`;
      if (/^&gt;\s/.test(block)) return `<blockquote>${block.replace(/^&gt;\s?/gm, "")}</blockquote>`;
      if (/^[-*]\s/m.test(block)) {
        const items = block
          .split("\n")
          .map((line) => line.replace(/^[-*]\s+/, ""))
          .map((line) => `<li>${line}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

function updatePreview() {
  els.preview.innerHTML = renderMarkdown(els.editorInput.value);
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
  setStatus("正在加载文章列表...");
  const data = await api("/api/posts");
  state.posts = data.posts || [];
  renderPosts();
  setStatus(`已加载 ${state.posts.length} 篇文章`);
}

async function loadPost(path) {
  setStatus("正在读取文章...");
  const data = await api(`/api/post?path=${encodeURIComponent(path)}`);
  state.currentPath = data.path;
  state.currentSha = data.sha;
  els.pathInput.value = data.path;
  els.editorInput.value = data.content;
  updatePreview();
  renderPosts();
  setStatus(`已打开 ${data.path}`);
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
  const title = "新文章";
  state.currentPath = "";
  state.currentSha = "";
  els.pathInput.value = `source/_posts/${date}-${slugifyTitle(title)}.md`;
  els.editorInput.value = `---\ntitle: ${title}\ndate: ${date} ${now.toTimeString().slice(0, 8)}\ntags:\n  - \ncategories:\n  - \n---\n\n# ${title}\n\n`;
  updatePreview();
  renderPosts();
  setStatus("已创建草稿，保存后会提交到 GitHub 并触发部署");
}

async function polish() {
  const markdown = els.editorInput.value.trim();
  if (!markdown) {
    setStatus("当前文章为空，无法处理", true);
    return;
  }
  setStatus("AI 正在处理文章...");
  const data = await api("/api/polish", {
    method: "POST",
    body: JSON.stringify({
      mode: els.modeSelect.value,
      markdown
    })
  });
  els.editorInput.value = data.content || "";
  updatePreview();
  setStatus("AI 处理完成，请检查后保存");
}

async function savePost() {
  const path = els.pathInput.value.trim();
  const content = els.editorInput.value;
  if (!path || !content.trim()) {
    setStatus("文件路径和内容不能为空", true);
    return;
  }

  setStatus("正在保存到 GitHub...");
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
  setStatus(`已提交，GitHub Actions 将自动发布：${data.commit || data.path}`);
  await loadPosts();
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
  setStatus("令牌已保存到当前浏览器");
});
els.loadPostsButton.addEventListener("click", bind(loadPosts));
els.newPostButton.addEventListener("click", newPost);
els.polishButton.addEventListener("click", bind(polish));
els.saveButton.addEventListener("click", bind(savePost));
els.editorInput.addEventListener("input", updatePreview);

newPost();
