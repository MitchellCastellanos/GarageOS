"use client";

import { useState } from "react";
import { countSmsSegments } from "@/domain/sms";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INBOX_DICT } from "@/lib/admin-locale/inbox";

/** Textarea de SMS con contador de segmentos en vivo (lo que cuenta contra el cupo). */
export function SmsBodyField({ disabled, resetKey }: { disabled?: boolean; resetKey?: number }) {
  const locale = useAdminLocale();
  const t = INBOX_DICT[locale].sms;
  const [body, setBody] = useState("");
  const [lastReset, setLastReset] = useState(resetKey);
  if (resetKey !== lastReset) {
    setLastReset(resetKey);
    setBody("");
  }
  const info = countSmsSegments(body);

  return (
    <div>
      <textarea
        name="body"
        required
        rows={4}
        maxLength={1600}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={disabled}
        placeholder={t.bodyPlaceholder}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-y"
      />
      <p className="text-xs text-slate-500 mt-1">
        {body.length} · {t.segments(info.segments, info.encoding === "UCS2")}
      </p>
    </div>
  );
}
