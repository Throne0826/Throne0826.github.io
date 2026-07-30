import { basicSetup, EditorView } from "codemirror";
import { EditorSelection, EditorState, Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { undo, redo } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";

const editorBaseTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--text)",
    height: "100%"
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, "Microsoft YaHei UI", monospace',
    fontSize: "14px",
    lineHeight: "1.7",
    overflow: "auto"
  },
  ".cm-content": {
    caretColor: "var(--primary)",
    minHeight: "100%",
    padding: "18px 0 42px"
  },
  ".cm-line": { padding: "0 18px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)" },
  ".cm-gutters": {
    backgroundColor: "var(--editor-gutter)",
    borderRight: "1px solid var(--line)",
    color: "var(--editor-line-number)",
    minWidth: "46px"
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "36px", padding: "0 9px 0 4px" },
  ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--editor-active-line)",
    color: "var(--primary-strong)"
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--editor-selection) !important"
  },
  ".cm-panels": {
    backgroundColor: "var(--panel)",
    borderBottom: "1px solid var(--line)",
    color: "var(--text)"
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--amber-soft)",
    outline: "1px solid var(--amber)"
  },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--editor-selection)" },
  ".cm-tooltip": {
    backgroundColor: "var(--panel)",
    border: "1px solid var(--line)",
    color: "var(--text)"
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--panel-subtle)",
    border: "1px solid var(--line)",
    color: "var(--muted)"
  }
});

const darkEditorTheme = EditorView.theme({
  "&": { backgroundColor: "var(--editor-bg)", color: "var(--text)" },
  ".cm-gutters": { backgroundColor: "var(--editor-gutter)", color: "var(--editor-line-number)" }
}, { dark: true });

function themeExtensions(theme) {
  return theme === "dark" ? [oneDark, darkEditorTheme] : [];
}

function imageFromTransfer(transfer) {
  return Array.from(transfer?.files || []).find((file) => file.type.startsWith("image/"));
}

export function createMarkdownEditor(options) {
  const themeSlot = new Compartment();
  let suppressChange = false;
  let activeTheme = options.theme || "light";

  const extensions = () => [
    basicSetup,
    markdown({ codeLanguages: languages }),
    EditorView.lineWrapping,
    editorBaseTheme,
    themeSlot.of(themeExtensions(activeTheme)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !suppressChange) options.onChange?.(update.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      keydown(event) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          options.onSave?.();
          return true;
        }
        return false;
      },
      paste(event) {
        const file = imageFromTransfer(event.clipboardData);
        if (!file) return false;
        event.preventDefault();
        options.onImage?.(file);
        return true;
      },
      dragover(event) {
        if (!imageFromTransfer(event.dataTransfer)) return false;
        event.preventDefault();
        return true;
      },
      drop(event) {
        const file = imageFromTransfer(event.dataTransfer);
        if (!file) return false;
        event.preventDefault();
        options.onImage?.(file);
        return true;
      }
    })
  ];

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.value || "",
      extensions: extensions()
    })
  });

  const onScroll = () => options.onScroll?.();
  view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });

  return {
    getValue() {
      return view.state.doc.toString();
    },
    setValue(value, selection = {}) {
      const text = String(value || "");
      const anchor = Math.min(selection.anchor ?? 0, text.length);
      const head = Math.min(selection.head ?? anchor, text.length);
      suppressChange = true;
      view.setState(EditorState.create({
        doc: text,
        selection: EditorSelection.single(anchor, head),
        extensions: extensions()
      }));
      suppressChange = false;
    },
    getSelection() {
      const range = view.state.selection.main;
      return {
        from: range.from,
        to: range.to,
        text: view.state.sliceDoc(range.from, range.to)
      };
    },
    replaceRange(from, to, text, select = "end") {
      const inserted = String(text || "");
      const anchor = select === "all" ? from : from + inserted.length;
      const head = select === "all" ? from + inserted.length : anchor;
      view.dispatch({
        changes: { from, to, insert: inserted },
        selection: EditorSelection.single(anchor, head),
        scrollIntoView: true
      });
    },
    setSelection(from, to = from) {
      view.dispatch({ selection: EditorSelection.single(from, to), scrollIntoView: true });
    },
    focus() {
      view.focus();
    },
    undo() {
      return undo(view);
    },
    redo() {
      return redo(view);
    },
    setTheme(theme) {
      activeTheme = theme;
      view.dispatch({ effects: themeSlot.reconfigure(themeExtensions(theme)) });
    },
    getScrollMetrics() {
      return {
        top: view.scrollDOM.scrollTop,
        height: view.scrollDOM.scrollHeight,
        client: view.scrollDOM.clientHeight
      };
    },
    setScrollTop(value) {
      view.scrollDOM.scrollTop = value;
    },
    destroy() {
      view.scrollDOM.removeEventListener("scroll", onScroll);
      view.destroy();
    }
  };
}
