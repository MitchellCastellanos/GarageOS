"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Eye, Italic, List, ListOrdered, Pencil, Redo2, Undo2 } from "lucide-react";
import type { EmailRichTextDocument, EmailRichTextInline } from "@/lib/email-rich-text";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INBOX_DICT } from "@/lib/admin-locale/inbox";

interface RichEmailEditorProps {
  name?: string;
  shopName: string;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
}

const EMPTY_DOCUMENT: EmailRichTextDocument = { version: 1, blocks: [] };

function sanitizeUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

function serializeInlineNode(node: Node, marks: Pick<EmailRichTextInline, "bold" | "italic" | "href"> = {}): EmailRichTextInline[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ text, ...marks }] : [];
  }
  if (!(node instanceof HTMLElement)) return [];

  const tag = node.tagName.toLowerCase();
  const nextMarks = {
    ...marks,
    bold: marks.bold || tag === "strong" || tag === "b" || node.style.fontWeight === "bold" || Number(node.style.fontWeight) >= 600 || undefined,
    italic: marks.italic || tag === "em" || tag === "i" || node.style.fontStyle === "italic" || undefined,
    href: tag === "a" ? sanitizeUrl(node.getAttribute("href")) : marks.href,
  };

  return Array.from(node.childNodes).flatMap((child) => serializeInlineNode(child, nextMarks));
}

function serializeEditor(root: HTMLElement): EmailRichTextDocument {
  const blocks: EmailRichTextDocument["blocks"] = [];

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const children = serializeInlineNode(node);
      if (children.length) blocks.push({ type: "paragraph", children });
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;

    const tag = node.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      const items = Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .map((child) => Array.from(child.childNodes).flatMap((inline) => serializeInlineNode(inline)));
      if (items.length) blocks.push({ type: tag === "ol" ? "orderedList" : "bulletList", items });
      continue;
    }

    const children = Array.from(node.childNodes).flatMap((child) => serializeInlineNode(child));
    blocks.push({ type: "paragraph", children });
  }

  return { version: 1, blocks };
}

function InlinePreview({ inlines }: { inlines: EmailRichTextInline[] }) {
  return inlines.map((inline, index) => {
    let content: React.ReactNode = inline.text;
    if (inline.bold) content = <strong>{content}</strong>;
    if (inline.italic) content = <em>{content}</em>;
    if (inline.href) content = <a href={inline.href} className="text-blue-600 underline">{content}</a>;
    return <span key={index}>{content}</span>;
  });
}

function EmailPreview({
  richDocument,
  shopName,
  t,
}: {
  richDocument: EmailRichTextDocument;
  shopName: string;
  t: (typeof INBOX_DICT)[keyof typeof INBOX_DICT]["editor"];
}) {
  return (
    <div className="bg-slate-100 p-4 sm:p-6 rounded-b-lg">
      <div className="mx-auto max-w-[560px] overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="bg-blue-700 px-6 sm:px-10 py-7 text-white">
          <p className="m-0 text-xl font-bold">{shopName}</p>
          <p className="mt-1 mb-0 text-sm text-blue-200">{t.previewHeader}</p>
        </div>
        <div className="px-6 sm:px-10 py-8 text-sm leading-6 text-slate-700 min-h-44">
          {richDocument.blocks.length === 0 ? (
            <p className="text-slate-400">{t.emptyPreview}</p>
          ) : richDocument.blocks.map((block, index) => {
            if (block.type === "paragraph") {
              return <p key={index} className="mt-0 mb-3 min-h-5"><InlinePreview inlines={block.children} /></p>;
            }
            const Tag = block.type === "orderedList" ? "ol" : "ul";
            return (
              <Tag key={index} className={`${block.type === "orderedList" ? "list-decimal" : "list-disc"} pl-6 mb-3`}>
                {block.items.map((item, itemIndex) => <li key={itemIndex}><InlinePreview inlines={item} /></li>)}
              </Tag>
            );
          })}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-6 sm:px-10 py-5 text-center">
          <p className="m-0 text-[11px] leading-5 text-slate-400">{t.sentBy(shopName)}</p>
          <p className="mt-2 mb-0 text-[10px] text-slate-300">{t.poweredBy}</p>
        </div>
      </div>
    </div>
  );
}

export function RichEmailEditor({
  name = "bodyRich",
  shopName,
  disabled = false,
  placeholder,
  required = false,
}: RichEmailEditorProps) {
  const locale = useAdminLocale();
  const t = INBOX_DICT[locale].editor;
  const resolvedPlaceholder = placeholder ?? t.defaultPlaceholder;
  const editorRef = useRef<HTMLDivElement>(null);
  const [richDocument, setRichDocument] = useState<EmailRichTextDocument>(EMPTY_DOCUMENT);
  const [plainText, setPlainText] = useState("");
  const [preview, setPreview] = useState(false);

  function sync() {
    if (!editorRef.current) return;
    const nextDocument = serializeEditor(editorRef.current);
    setRichDocument(nextDocument);
    setPlainText(editorRef.current.innerText.trim());
  }

  function command(commandName: string) {
    editorRef.current?.focus();
    window.document.execCommand(commandName);
    sync();
  }

  useEffect(() => {
    sync();
  }, []);

  const toolbarButton = "p-2 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40";

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-500">
      <input type="hidden" name={name} value={JSON.stringify(richDocument)} />
      <textarea name="body" value={plainText} readOnly required={required} className="sr-only" aria-hidden="true" tabIndex={-1} />

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {!preview && (
          <>
            <button type="button" className={toolbarButton} onMouseDown={(e) => e.preventDefault()} onClick={() => command("bold")} disabled={disabled} title={t.bold}><Bold className="h-4 w-4" /></button>
            <button type="button" className={toolbarButton} onMouseDown={(e) => e.preventDefault()} onClick={() => command("italic")} disabled={disabled} title={t.italic}><Italic className="h-4 w-4" /></button>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <button type="button" className={toolbarButton} onMouseDown={(e) => e.preventDefault()} onClick={() => command("insertUnorderedList")} disabled={disabled} title={t.list}><List className="h-4 w-4" /></button>
            <button type="button" className={toolbarButton} onMouseDown={(e) => e.preventDefault()} onClick={() => command("insertOrderedList")} disabled={disabled} title={t.orderedList}><ListOrdered className="h-4 w-4" /></button>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <button type="button" className={toolbarButton} onMouseDown={(e) => e.preventDefault()} onClick={() => command("undo")} disabled={disabled} title={t.undo}><Undo2 className="h-4 w-4" /></button>
            <button type="button" className={toolbarButton} onMouseDown={(e) => e.preventDefault()} onClick={() => command("redo")} disabled={disabled} title={t.redo}><Redo2 className="h-4 w-4" /></button>
          </>
        )}
        <button type="button" onClick={() => { sync(); setPreview((value) => !value); }} className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">
          {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {preview ? t.edit : t.preview}
        </button>
      </div>

      {preview ? (
        <EmailPreview richDocument={richDocument} shopName={shopName} t={t} />
      ) : (
        <div className="relative">
          {!plainText && <span className="pointer-events-none absolute left-4 top-3 text-sm text-slate-400">{resolvedPlaceholder}</span>}
          <div
            ref={editorRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={sync}
            onBlur={sync}
            className="min-h-40 px-4 py-3 text-sm leading-6 text-slate-800 outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-blue-600 [&_a]:underline"
            role="textbox"
            aria-multiline="true"
            aria-label={t.bodyAriaLabel}
          />
        </div>
      )}
    </div>
  );
}
