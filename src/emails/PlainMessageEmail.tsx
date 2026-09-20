import { Link, Text } from "@react-email/components";
import React from "react";
import { ShopEmailLayout } from "@/emails/layout/ShopEmailLayout";
import type { EmailRichTextDocument, EmailRichTextInline } from "@/lib/email-rich-text";

export interface PlainMessageEmailProps {
  shopName: string;
  bodyText: string;
  bodyRich?: EmailRichTextDocument | null;
  headerSubtitle?: string;
  signatureName?: string | null;
  signatureTitle?: string | null;
  footerText: string;
  poweredByText?: string;
  showPoweredBy?: boolean;
  unsubscribeUrl?: string | null;
  lang?: string;
}

function RichInline({ inlines }: { inlines: EmailRichTextInline[] }) {
  return (
    <>
      {inlines.map((inline, index) => {
        let content: React.ReactNode = inline.text;
        if (inline.bold) content = <strong>{content}</strong>;
        if (inline.italic) content = <em>{content}</em>;
        if (inline.href) {
          content = (
            <Link href={inline.href} style={{ color: "#1d4ed8", textDecoration: "underline" }}>
              {content}
            </Link>
          );
        }
        return <React.Fragment key={index}>{content}</React.Fragment>;
      })}
    </>
  );
}

function RichBody({ document }: { document: EmailRichTextDocument }) {
  return (
    <>
      {document.blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <Text key={index} style={{ margin: "0 0 8px 0", fontSize: "14px", lineHeight: "1.6", color: "#334155" }}>
              <RichInline inlines={block.children} />
            </Text>
          );
        }

        const ordered = block.type === "orderedList";
        return (
          <div key={index} style={{ margin: "0 0 12px 0" }}>
            {block.items.map((item, itemIndex) => (
              <Text key={itemIndex} style={{ margin: "0 0 4px 0", paddingLeft: "12px", fontSize: "14px", lineHeight: "1.6", color: "#334155" }}>
                {ordered ? `${itemIndex + 1}. ` : "• "}<RichInline inlines={item} />
              </Text>
            ))}
          </div>
        );
      })}
    </>
  );
}

/**
 * Template compartido para correo humano de texto libre (Inbox, Contact Us). El
 * contenido rico del Inbox llega como un documento validado; nunca se inyecta HTML
 * arbitrario del navegador en el correo.
 */
export function PlainMessageEmail({
  shopName,
  bodyText,
  bodyRich,
  headerSubtitle = "Message",
  signatureName,
  signatureTitle,
  footerText,
  poweredByText,
  showPoweredBy = true,
  unsubscribeUrl,
  lang = "en",
}: PlainMessageEmailProps) {
  return (
    <ShopEmailLayout
      lang={lang}
      previewText={bodyText.slice(0, 120)}
      shopName={shopName}
      headerSubtitle={headerSubtitle}
      footerText={footerText}
      poweredByText={poweredByText}
      showPoweredBy={showPoweredBy}
      unsubscribeUrl={unsubscribeUrl}
    >
      {bodyRich ? (
        <RichBody document={bodyRich} />
      ) : (
        bodyText.split("\n").map((line, i) => (
          <Text key={i} style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#334155" }}>
            {line || " "}
          </Text>
        ))
      )}
      {(signatureName || signatureTitle) && (
        <Text style={{ marginTop: "24px", fontSize: "14px", color: "#0f172a" }}>
          {signatureName}
          {signatureName && signatureTitle ? <br /> : null}
          {signatureTitle}
        </Text>
      )}
    </ShopEmailLayout>
  );
}
