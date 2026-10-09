// Safe text → HTML and (untrusted) HTML → text. We never store or render inbound HTML: it is flattened to text.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

/** Paragraphs split on blank lines, single newlines → <br>, http(s) URLs → links. Every other character is escaped. */
export function textToHtml(text: string): string {
  const paragraphs = text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      let out = "";
      let last = 0;
      for (const m of p.matchAll(URL_RE)) {
        out += escapeHtml(p.slice(last, m.index));
        const url = m[0];
        out += `<a href="${escapeHtml(url)}" style="color:#1769ff">${escapeHtml(url)}</a>`;
        last = (m.index ?? 0) + url.length;
      }
      out += escapeHtml(p.slice(last));
      return `<p style="margin:0 0 14px 0">${out.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 31 && n < 0x10ffff ? String.fromCodePoint(n) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drops the quoted history ("On … wrote:", "Le … a écrit :", "> ") so the thread view shows the new text first. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const cut = lines.findIndex((l, i) =>
    /^(on .{5,200} wrote:|le .{5,200} a écrit\s?:)\s*$/i.test(l.trim()) ||
    /^-{2,}\s*(original message|message d'origine|message original)\s*-{2,}$/i.test(l.trim()) ||
    (/^>/.test(l) && /^>/.test(lines[i + 1] ?? "")));
  const kept = cut > 0 ? lines.slice(0, cut) : lines;
  return kept.join("\n").trim() || text.trim();
}
