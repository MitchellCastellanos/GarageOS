"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileText, ExternalLink, FolderOpen } from "lucide-react";
import { UploadZone } from "./UploadZone";
import {
  uploadDocument,
  getAccountingPageData,
  type EnrichedAccountingDocument,
} from "@/actions/documents";
import { type DocCategory } from "@/lib/validations";
import {
  ACCOUNTING_DOC_FILTERS,
  type AccountingDocFilter,
} from "@/lib/accounting-documents";
import { ADMIN } from "@/lib/routes";
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

function filterDocs(
  docs: EnrichedAccountingDocument[],
  filter: AccountingDocFilter
): EnrichedAccountingDocument[] {
  switch (filter) {
    case "AUTO_EXPORTED":
      return docs.filter((d) => d.source === "auto_paid_invoice");
    case "MANUAL":
      return docs.filter((d) => d.source === "manual");
    default:
      return docs;
  }
}

export function AccountingClient({ initialDocs, categories }: AccountingClientProps) {
  const locale = useAdminLocale();
  const t = CAJA_DICT[locale].accounting;
  const [activeCategory, setActiveCategory] = useState<DocCategory>(
    categories[0].value as DocCategory
  );
  const [docFilter, setDocFilter] = useState<AccountingDocFilter>("ALL");
  const [docs, setDocs] = useState(initialDocs);
  const [, startTransition] = useTransition();

  function refreshData() {
    startTransition(async () => {
      const fresh = await getAccountingPageData();
      setDocs(fresh.documents);
    });
  }

  const categoryDocs = docs.filter((d) => d.category === activeCategory);
  const filteredDocs = filterDocs(categoryDocs, docFilter);
  const activeLabel = categories.find((c) => c.value === activeCategory)?.label ?? "";
  const showDocFilters = activeCategory === "INVOICES";
  const activeDocFilterMeta = ACCOUNTING_DOC_FILTERS.find((f) => f.value === docFilter);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-5 flex items-start gap-4">
        <FolderOpen className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-white text-sm font-medium">{t.driveFolderTitle}</p>
          <p className="text-slate-400 text-xs mt-0.5">{t.driveFolderSubtitle}</p>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {categories.map((cat) => {
          const count = docs.filter((d) => d.category === cat.value).length;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => {
                setActiveCategory(cat.value as DocCategory);
                setDocFilter("ALL");
              }}
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

      {showDocFilters && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            {t.docFilterLabel}
          </p>
          <div className="flex gap-1 flex-wrap">
            {ACCOUNTING_DOC_FILTERS.map((filter) => {
              const count = filterDocs(categoryDocs, filter.value).length;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setDocFilter(filter.value)}
                  className={[
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    docFilter === filter.value
                      ? "bg-violet-600 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {filter.label}
                  {count > 0 && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        docFilter === filter.value
                          ? "bg-violet-500 text-white"
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
          {activeDocFilterMeta && (
            <p className="text-xs text-slate-500">{activeDocFilterMeta.description}</p>
          )}
        </div>
      )}

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
                ({filteredDocs.length})
              </span>
            </h2>
          </div>

          {filteredDocs.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">{t.noDocuments}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredDocs.map((doc) => (
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
                      <p className="text-xs text-slate-400">
                        {formatDate(doc.uploadedAt)}
                        {doc.linkedInvoiceNumber && (
                          <>
                            {" "}
                            ·{" "}
                            <Link
                              href={`${ADMIN.invoices}/${doc.linkedInvoiceId}`}
                              className="text-blue-600 hover:underline"
                            >
                              {doc.linkedInvoiceNumber}
                            </Link>
                          </>
                        )}
                      </p>
                      {doc.source === "auto_paid_invoice" && (
                        <p className="text-xs text-emerald-700 mt-0.5">{t.autoExported}</p>
                      )}
                      {doc.source === "manual" && (
                        <p className="text-xs text-slate-500 mt-0.5">{t.manualUpload}</p>
                      )}
                    </div>
                  </div>

                  {doc.driveFileId && (
                    <a
                      href={`https://drive.google.com/file/d/${doc.driveFileId}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0"
                    >
                      {t.driveLink}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
