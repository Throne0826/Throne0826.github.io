mixins.highlight = {
    data() {
        return { copying: false };
    },
    created() {
        hljs.configure({ ignoreUnescapedHTML: true });
        this.renderers.push(this.highlight);
    },
    methods: {
        sleep(delay) {
            return new Promise((resolve) => setTimeout(resolve, delay));
        },
        escapeHTML(value) {
            return value.replace(/[&<>"']/g, (char) => {
                const chars = {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                };
                return chars[char];
            });
        },
        normalizeLanguage(value) {
            const raw = (value || "")
                .toLowerCase()
                .replace(/^language-/, "")
                .replace(/^lang-/, "");
            const aliases = {
                "c++": "cpp",
                cc: "cpp",
                cxx: "cpp",
                hpp: "cpp",
                py: "python",
                js: "javascript",
                ts: "typescript",
                sh: "bash",
                shell: "bash",
                plain: "plaintext",
                text: "plaintext",
            };
            return aliases[raw] || raw || "plaintext";
        },
        getLanguageLabel(language) {
            const labels = {
                cpp: "C++",
                javascript: "JavaScript",
                typescript: "TypeScript",
                python: "Python",
                bash: "Bash",
                plaintext: "Text",
            };
            return labels[language] || language.toUpperCase();
        },
        highlight() {
            let codes = document.querySelectorAll("pre");
            for (let i of codes) {
                let code = i.textContent;
                let classes = [...i.classList];
                if (i.firstElementChild) classes.push(...i.firstElementChild.classList);
                let rawLanguage = classes.find((item) => /^lang(uage)?-/.test(item)) || classes[0] || "plaintext";
                let language = this.normalizeLanguage(rawLanguage);
                let highlighted;
                try {
                    if (hljs.getLanguage(language)) {
                        highlighted = hljs.highlight(code, { language }).value;
                    } else {
                        language = "plaintext";
                        highlighted = this.escapeHTML(code);
                    }
                } catch {
                    language = "plaintext";
                    highlighted = this.escapeHTML(code);
                }
                i.innerHTML = `
                    <div class="code-content hljs">${highlighted}</div>
                    <div class="language">${this.getLanguageLabel(language)}</div>
                    <div class="copycode" title="复制代码">
                        <i class="fa-solid fa-copy fa-fw"></i>
                        <i class="fa-solid fa-check fa-fw"></i>
                    </div>
                `;
                let content = i.querySelector(".code-content");
                hljs.lineNumbersBlock(content, { singleLine: true });
                let copycode = i.querySelector(".copycode");
                copycode.addEventListener("click", async () => {
                    if (this.copying) return;
                    this.copying = true;
                    copycode.classList.add("copied");
                    await navigator.clipboard.writeText(code);
                    await this.sleep(1000);
                    copycode.classList.remove("copied");
                    this.copying = false;
                });
            }
        },
    },
};

