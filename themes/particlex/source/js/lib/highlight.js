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
                c: "C",
                java: "Java",
                javascript: "JavaScript",
                typescript: "TypeScript",
                python: "Python",
                bash: "Bash",
                json: "JSON",
                yaml: "YAML",
                markdown: "Markdown",
                plaintext: "Text",
            };
            return labels[language] || language.toUpperCase();
        },
        getCodeElement(pre) {
            if (pre.matches(".code-content")) return null;
            if (pre.querySelector(".code-content")) return null;
            return pre.querySelector("code") || pre;
        },
        detectLanguage(pre, codeElement) {
            const ignored = new Set([
                "highlight",
                "hljs",
                "code",
                "code-content",
                "line-numbers",
                "table",
                "gutter",
            ]);
            const classes = [
                ...(codeElement ? [...codeElement.classList] : []),
                ...[...pre.classList],
            ].filter(Boolean);
            const prefixed = classes.find((item) => /^lang(uage)?-/.test(item));
            if (prefixed) return this.normalizeLanguage(prefixed);
            const direct = classes.find(
                (item) => !ignored.has(item) && !item.startsWith("hljs-")
            );
            return this.normalizeLanguage(direct || "plaintext");
        },
        highlight() {
            let codes = document.querySelectorAll("pre");
            for (let i of codes) {
                let codeElement = this.getCodeElement(i);
                if (!codeElement) continue;
                let code = codeElement.textContent.replace(/\n$/, "");
                let language = this.detectLanguage(i, codeElement);
                let highlighted;
                let alreadyHighlighted = codeElement.innerHTML.includes("hljs-");
                try {
                    if (alreadyHighlighted) {
                        highlighted = codeElement.innerHTML;
                    } else if (hljs.getLanguage(language)) {
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
                if (typeof hljs.lineNumbersBlock === "function") {
                    hljs.lineNumbersBlock(content, { singleLine: true });
                }
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
