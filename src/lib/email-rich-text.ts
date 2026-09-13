import { z } from "zod";

const MAX_RICH_BODY_JSON = 100_000;

const linkSchema = z
  .string()
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:", "mailto:"].includes(url.protocol);
    } catch {
      return false;
    }
  }, "Enlace no permitido");

export const emailRichTextInlineSchema = z.object({
  text: z.string().max(20_000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  href: linkSchema.optional(),
});

export const emailRichTextBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    children: z.array(emailRichTextInlineSchema).max(500),
  }),
  z.object({
    type: z.enum(["bulletList", "orderedList"]),
    items: z.array(z.array(emailRichTextInlineSchema).max(200)).max(200),
  }),
]);

export const emailRichTextDocumentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(emailRichTextBlockSchema).max(500),
});

export type EmailRichTextInline = z.infer<typeof emailRichTextInlineSchema>;
export type EmailRichTextBlock = z.infer<typeof emailRichTextBlockSchema>;
export type EmailRichTextDocument = z.infer<typeof emailRichTextDocumentSchema>;

export function parseEmailRichText(value: FormDataEntryValue | string | null | undefined): EmailRichTextDocument | null {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_RICH_BODY_JSON) return null;

  try {
    const parsed = emailRichTextDocumentSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function inlineText(inlines: EmailRichTextInline[]): string {
  return inlines.map((inline) => inline.text).join("");
}

export function emailRichTextToPlainText(document: EmailRichTextDocument): string {
  return document.blocks
    .map((block) => {
      if (block.type === "paragraph") return inlineText(block.children);
      return block.items
        .map((item, index) => `${block.type === "orderedList" ? `${index + 1}.` : "•"} ${inlineText(item)}`)
        .join("\n");
    })
    .join("\n\n")
    .trim();
}
