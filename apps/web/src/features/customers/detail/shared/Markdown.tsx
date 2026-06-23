import type { MarkdownBlock } from "./types";

export function MarkdownReport({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <article className="markdown-report">
      {blocks.map((block, index) => {
        if (block.type === "h1") return <h1 key={index}>{cleanMarkdownText(block.text)}</h1>;
        if (block.type === "h2") return <h2 key={index}>{cleanMarkdownText(block.text)}</h2>;
        if (block.type === "h3") return <h3 key={index}>{cleanMarkdownText(block.text)}</h3>;
        if (block.type === "quote") return <div className="report-note" key={index}>{cleanMarkdownText(block.text)}</div>;
        if (block.type === "list") return <ul key={index}>{block.items?.map((item, itemIndex) => <li key={itemIndex}>{cleanMarkdownText(item)}</li>)}</ul>;
        if (block.type === "table") return <MarkdownTable key={index} rows={block.rows ?? []} />;
        return <p key={index}>{cleanMarkdownText(block.text)}</p>;
      })}
    </article>
  );
}

export function MarkdownTable({ rows }: { rows: string[][] }) {
  if (rows.length < 2) return null;
  const [head, ...body] = rows;
  return (
    <table className="report-table">
      <thead><tr>{head.map((cell, index) => <th key={index}>{cleanMarkdownText(cell)}</th>)}</tr></thead>
      <tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cleanMarkdownText(cell)}</td>)}</tr>)}</tbody>
    </table>
  );
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let table: string[][] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "p", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };
  const flushTable = () => {
    if (table.length) {
      const rows = table.filter((row) => !row.every((cell) => /^-+$/.test(cell.replace(/:/g, "").trim())));
      if (rows.length > 1) blocks.push({ type: "table", rows });
      table = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushAll();
      continue;
    }
    if (/^\|.+\|$/.test(line)) {
      flushParagraph();
      flushList();
      table.push(line.split("|").slice(1, -1).map((cell) => cell.trim()));
      continue;
    }
    flushTable();
    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h3", text: line.replace(/^###\s+/, "") });
    } else if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h2", text: line.replace(/^##\s+/, "") });
    } else if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h1", text: line.replace(/^#\s+/, "") });
    } else if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") });
    } else if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^[-*]\s+/, ""));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushAll();
  return blocks.filter((block) => block.type !== "p" || Boolean(block.text));
}

function cleanMarkdownText(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}
