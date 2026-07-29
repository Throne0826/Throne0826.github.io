export function buildAiPrompt({ mode, markdown, chunkIndex = 0, chunkCount = 1 }) {
  const task = {
    polish: "Polish the article language so it is fluent, professional, and easy to understand. Preserve meaning, technical facts, structure, Markdown, LaTeX, and all code exactly.",
    format: "Adjust formatting based on content without broadly rewriting it. Improve heading levels, bold, italic, underline with <u>, highlight with <mark>, lists, quotes, tables, whitespace, Markdown structure, and LaTeX delimiters. Apply formatting only where semantically useful.",
    check: "Verify the language and factual content for accuracy and correct detected problems directly. Never modify any content inside fenced code blocks. You may correct Markdown syntax, LaTeX syntax, mathematical formulas, headings, punctuation, and inaccurate prose.",
    summary: "Read the complete Markdown article, ignore any existing YAML description, and output only one coherent Chinese summary of no more than 100 Chinese characters. Do not add a label, quotes, Markdown, or explanation."
  }[mode || "polish"] || "Polish and clean up the Markdown article.";

  if (mode === "summary") {
    return [
      "You are an editor for a Chinese technical blog.",
      task,
      "Cover the supplied content as a whole and do not invent information.",
      "",
      markdown || ""
    ].join("\n");
  }

  return [
    "You are an editor for a Chinese technical blog.",
    task,
    chunkCount > 1 ? `This is part ${chunkIndex + 1} of ${chunkCount}. Edit this part independently and do not add chunk labels.` : "",
    "Requirements:",
    "1. Output only the edited Markdown part. Do not wrap the entire result in backticks and do not explain your changes.",
    "2. Preserve Hexo YAML front matter delimiters and all existing fields when present.",
    "3. Preserve fenced code blocks byte-for-byte. Do not remove, rewrite, reformat, or correct code.",
    "4. Preserve algorithms, complexity, variable names, citations, links, images, and Hexo markers such as <!--more-->.",
    "5. Use natural Chinese punctuation and spacing between Chinese and English text.",
    "6. Keep valid LaTeX unchanged; only repair LaTeX or formulas when the selected task permits it.",
    "",
    markdown || ""
  ].join("\n");
}
