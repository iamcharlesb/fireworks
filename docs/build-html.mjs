#!/usr/bin/env node
/**
 * Fireworks++ — Markdown → HTML doc builder
 * Converts every .md file in this directory to a styled .html file.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Minimal Markdown → HTML converter ───────────────────────────────────────

function escape(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function convertMarkdown(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(escape(lines[i]));
        i++;
      }
      out.push(
        `<pre><code class="language-${lang || "text"}">${codeLines.join("\n")}</code></pre>`
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      out.push("<hr>");
      i++;
      continue;
    }

    // ATX headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const id = hMatch[2].toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      out.push(`<h${level} id="${id}">${inline(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s/.test(line)) {
      const bqLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(bqLines.join(" "))}</blockquote>`);
      continue;
    }

    // Table
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[-| :]+\|/.test(lines[i + 1])) {
      const headers = line.split("|").slice(1, -1).map((h) => h.trim());
      i += 2; // skip separator
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      const thead = headers.map((h) => `<th>${inline(h)}</th>`).join("");
      const tbody = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("\n");
      out.push(`<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*+]\s/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === "") {
      out.push("");
      i++;
      continue;
    }

    // Paragraph — collect until blank line or block element
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|```|---|[-*+]\s|\d+\.\s|>|\|)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      out.push(`<p>${inline(paraLines.join(" "))}</p>`);
    }
  }

  return out.join("\n");
}

function inline(text) {
  return text
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Bold+italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Strikethrough
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Auto-links
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}

// ─── HTML shell ───────────────────────────────────────────────────────────────

const NAV_LINKS = [
  ["index.html", "Home"],
  ["getting-started.html", "Getting Started"],
  ["concepts.html", "Concepts"],
  ["llms.html", "LLMs"],
  ["chains.html", "Chains"],
  ["agents.html", "Agents"],
  ["tools.html", "Tools"],
  ["memory.html", "Memory"],
  ["prompts.html", "Prompts"],
  ["output-parsers.html", "Output Parsers"],
  ["document-loaders.html", "Document Loaders"],
  ["vector-stores.html", "Vector Stores"],
  ["callbacks.html", "Callbacks"],
  ["cli.html", "CLI"],
  ["checkpoints.html", "Checkpoints"],
  ["evaluations.html", "Evaluations"],
  ["simple-api.html", "Simple API"],
  ["mcp.html", "MCP"],
  ["auth.html", "Auth"],
  ["governance.html", "Governance"],
  ["plugins.html", "Plugins"],
  ["integrations.html", "Integrations"],
  ["monitoring.html", "Monitoring"],
  ["server.html", "Server"],
  ["python-sdk.html", "Python SDK"],
  ["workflows.html", "Workflows"],
  ["routing.html", "Routing"],
  ["safety.html", "Safety"],
  ["api-reference.html", "API Reference"],
];

function shell(title, body, activeFile) {
  const navItems = NAV_LINKS.map(([href, label]) => {
    const active = href === activeFile ? ' class="active"' : "";
    return `<li${active}><a href="${href}">${label}</a></li>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Fireworks++</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #f9fafb;
      --surface: #ffffff;
      --border: #e2e6ef;
      --accent: #e05a1a;
      --accent2: #c04a0e;
      --text: #1a1d2e;
      --muted: #6b7280;
      --code-bg: #f3f4f6;
      --link: #2563eb;
      --nav-w: 260px;
    }

    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      display: flex;
      min-height: 100vh;
    }

    /* ── Sidebar ── */
    nav {
      width: var(--nav-w);
      min-height: 100vh;
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 0;
      position: fixed;
      top: 0; left: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .nav-brand {
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .nav-brand .logo {
      font-size: 22px;
    }
    .nav-brand h1 {
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.3px;
    }
    .nav-brand span {
      font-size: 11px;
      color: var(--accent);
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    nav ul {
      list-style: none;
      padding: 12px 0;
    }
    nav ul li a {
      display: block;
      padding: 7px 24px;
      color: var(--muted);
      text-decoration: none;
      font-size: 14px;
      transition: color 0.15s, background 0.15s;
      border-left: 3px solid transparent;
    }
    nav ul li a:hover {
      color: var(--text);
      background: rgba(255,107,43,0.06);
    }
    nav ul li.active a {
      color: var(--accent2);
      border-left-color: var(--accent);
      background: rgba(255,107,43,0.08);
      font-weight: 600;
    }

    /* ── Main content ── */
    main {
      margin-left: var(--nav-w);
      flex: 1;
      max-width: 860px;
      padding: 52px 60px;
    }

    h1 { font-size: 2rem; font-weight: 800; margin-bottom: 16px; letter-spacing: -0.5px; }
    h2 { font-size: 1.4rem; font-weight: 700; margin: 40px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    h3 { font-size: 1.1rem; font-weight: 600; margin: 28px 0 10px; }
    h4 { font-size: 1rem; font-weight: 600; margin: 20px 0 8px; color: var(--accent2); }
    h5, h6 { font-size: 0.95rem; font-weight: 600; margin: 16px 0 6px; color: var(--muted); }

    p { margin: 12px 0; color: var(--text); }

    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }

    code {
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 0.85em;
      background: var(--code-bg);
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: 4px;
      color: #c2410c;
    }

    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px 24px;
      overflow-x: auto;
      margin: 18px 0;
      position: relative;
    }
    pre code {
      background: none;
      border: none;
      padding: 0;
      color: #374151;
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 0.88em;
      line-height: 1.6;
    }

    /* Syntax-ish colour hints */
    pre code .kw { color: #c678dd; }
    pre code .st { color: #98c379; }
    pre code .cm { color: #5c6370; font-style: italic; }

    blockquote {
      border-left: 4px solid var(--accent);
      background: rgba(255,107,43,0.06);
      padding: 14px 20px;
      border-radius: 0 6px 6px 0;
      margin: 16px 0;
      color: var(--muted);
      font-style: italic;
    }

    ul, ol {
      padding-left: 24px;
      margin: 12px 0;
    }
    li { margin: 5px 0; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 0.9rem;
    }
    th {
      background: var(--surface);
      padding: 10px 14px;
      text-align: left;
      font-weight: 600;
      border: 1px solid var(--border);
      color: var(--accent2);
    }
    td {
      padding: 9px 14px;
      border: 1px solid var(--border);
      vertical-align: top;
    }
    tr:nth-child(even) td { background: rgba(255,255,255,0.02); }

    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 32px 0;
    }

    strong { color: #111; font-weight: 700; }
    em { color: var(--accent2); font-style: italic; }
    del { color: var(--muted); }

    /* ── Badge pills on homepage ── */
    .badge {
      display: inline-block;
      background: rgba(255,107,43,0.15);
      color: var(--accent2);
      border: 1px solid rgba(255,107,43,0.3);
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.78rem;
      font-weight: 600;
      margin: 2px;
    }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    @media (max-width: 768px) {
      nav { display: none; }
      main { margin-left: 0; padding: 24px 20px; }
    }
  </style>
</head>
<body>
  <nav>
    <div class="nav-brand">
      <span class="logo">🔥</span>
      <div>
        <h1>Fireworks++</h1>
        <span>v0.1.0</span>
      </div>
    </div>
    <ul>
      ${navItems}
    </ul>
  </nav>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

// ─── Build ────────────────────────────────────────────────────────────────────

const docsDir = __dirname;
const mdFiles = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md"));

// Also generate an index.html from the project README
const readmePath = path.join(docsDir, "..", "README.md");

const filesToProcess = [
  ...mdFiles.map((f) => ({ src: path.join(docsDir, f), dest: f.replace(".md", ".html") })),
  ...(fs.existsSync(readmePath)
    ? [{ src: readmePath, dest: "index.html" }]
    : []),
];

let built = 0;
for (const { src, dest } of filesToProcess) {
  const md = fs.readFileSync(src, "utf8");
  const firstH1 = md.match(/^#\s+(.+)$/m);
  const title = firstH1 ? firstH1[1] : path.basename(dest, ".html");
  const body = convertMarkdown(md);
  const html = shell(title, body, dest);
  fs.writeFileSync(path.join(docsDir, dest), html, "utf8");
  console.log(`  ✓  ${dest}`);
  built++;
}

console.log(`\nBuilt ${built} HTML files → docs/`);
