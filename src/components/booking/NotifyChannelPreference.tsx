"use client";

import { useState } from "react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";

interface NotifyChannelPreferenceProps {
  slug: string;
  token: string;
  hasEmail: boolean;
  initialChannel: "AUTO" | "SMS" | "EMAIL" | "BOTH";
}

/** Le permite al cliente elegir SMS/Email/Ambos para sus próximos avisos, desde su propio link (sin login). */
export function NotifyChannelPreference({ slug, token, hasEmail, initialChannel }: NotifyChannelPreferenceProps) {
  const { t } = useSiteLocale();
  const [channel, setChannel] = useState<"SMS" | "EMAIL" | "BOTH">(initialChannel === "EMAIL" || initialChannel === "BOTH" ? initialChannel : "SMS");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function choose(next: "SMS" | "EMAIL" | "BOTH") {
    if (next !== "SMS" && !hasEmail) {
      setMessage({ type: "error", text: t.manage.notifyPrefNeedsEmail });
      return;
    }
    setChannel(next);
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/book/${slug}/manage/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyChannel: next }),
      });
      if (!res.ok) throw new Error();
      setMessage({ type: "ok", text: t.manage.notifyPrefSaved });
    } catch {
      setMessage({ type: "error", text: t.manage.notifyPrefError });
    } finally {
      setSaving(false);
    }
  }

  const options: { value: "SMS" | "EMAIL" | "BOTH"; label: string }[] = [
    { value: "SMS", label: t.manage.notifyPrefSms },
    { value: "EMAIL", label: t.manage.notifyPrefEmail },
    { value: "BOTH", label: t.manage.notifyPrefBoth },
  ];

  return (
    <div className="mt-6 pt-4 border-t border-slate-100">
      <p className="text-sm font-medium text-slate-700 mb-2">{t.manage.notifyPrefTitle}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={saving}
            onClick={() => choose(opt.value)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors disabled:opacity-50 ${
              channel === opt.value
                ? "bg-teal-600 border-teal-600 text-white"
                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {message && (
        <p className={`text-xs mt-2 ${message.type === "ok" ? "text-teal-700" : "text-amber-700"}`}>{message.text}</p>
      )}
    </div>
  );
}
