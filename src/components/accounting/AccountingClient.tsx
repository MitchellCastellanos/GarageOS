"use client";

import { useState, useTransition } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { UploadZone } from "./UploadZone";
import {
  uploadDocument,
  getAccountingPageData,
  type EnrichedAccountingDocument,
} from "@/actions/documents";
import { type DocCategory } from "@/lib/validations";
import { formatDate } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { CAJA_DICT } from "@/lib/admin-locale/caja";

interface AccountingClientProps {
  initialDocs: EnrichedAccountingDocument[];
  categories: readonly { value: string; label: string }[];
}

const CATEGORY_ICONS: Record<string, string> = {
  INVOICES: "🧾",
  RECEIPTS: "📋",
  PAYROLL: "💼",
  TAX_DOCUMENTS: "🏛️",
  BANK_STATEMENTS: "🏦",
  OTHER: "📁",
};

export function AccountingClient({ initialDocs, categories }: AccountingClientProps) {
  const locale = useAdminLocale();
  const t = CAJA_DICT[locale].accounting;
  const [activeCategory, setActiveCategory] = useState<DocCategory>(
    categories[0].value as DocCategory
  );
  const [docs, setDocs] = useState(initialDocs);
  const [, startTransition] = useTransition();

  function refreshData() {
    startTransition(async () => {
      const fresh = await getAccountingPageData();
      setDocs(fresh.documents);
    });
  }

  const categoryDocs = docs.filter((d) => d.category === activeCategory);
  const activeLabel = categories.find((c) => c.value === activeCategory)?.label ?? "";

  return (
    <div className="space-y-6">
      <div className="flex gap-1 flex-wrap">
        {categories.map((cat) => {
          const count = docs.filter((d) => d.category === cat.value).length;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => setActiveCategory(cat.value as DocCategory)}
              className={[
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeCategory === cat.value
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              <span>{CATEGORY_ICONS[cat.value] ?? "📄"}</span>
              {cat.label}
              {count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeCategory === cat.value
                      ? "bg-blue-500 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">
            {CATEGORY_ICONS[activeCategory]} {t.uploadHeading(activeLabel)}
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            {t.uploadHintPrefix}
            <strong>{activeLabel}</strong>
            {t.uploadHintSuffix}
          </p>
          <UploadZone
            category={activeCategory}
            onUpload={uploadDocument}
            onSuccess={refreshData}
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">
              {activeLabel}
              <span className="ml-2 text-sm font-normal text-slate-400">
                ({categoryDocs.length})
              </span>
            </h2>
          </div>

          {categoryDocs.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">{t.noDocuments}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {categoryDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="px-5 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 font-medium truncate">
                        {doc.fileName}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(doc.uploadedAt)}</p>
                    </div>
                  </div>

                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0"
                  >
                    {t.viewLink}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
