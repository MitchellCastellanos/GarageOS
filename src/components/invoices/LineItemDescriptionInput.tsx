"use client";

import { useEffect, useRef, useState } from "react";
import { searchLineItemSuggestions } from "@/actions/line-items";

interface Suggestion {
  description: string;
  itemType: string;
  unitPrice: { toString(): string } | string | number;
  useCount: number;
}

interface LineItemDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectSuggestion: (suggestion: {
    description: string;
    itemType: "LABOUR" | "PART" | "OTHER";
    unitPrice: number;
  }) => void;
  hasError?: boolean;
  inputClass: string;
}

export function LineItemDescriptionInput({
  value,
  onChange,
  onSelectSuggestion,
  hasError,
  inputClass,
}: LineItemDescriptionInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchLineItemSuggestions(q);
        setSuggestions(results);
        setOpen(results.length > 0);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [value]);

  function pick(s: Suggestion) {
    onSelectSuggestion({
      description: s.description,
      itemType: s.itemType as "LABOUR" | "PART" | "OTHER",
      unitPrice: Number(s.unitPrice),
    });
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Ej: Ball joint, Cambio de aceite…"
        className={inputClass}
        autoComplete="off"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          …
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {suggestions.map((s) => (
            <li key={s.description}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
              >
                <span className="block text-sm font-medium text-slate-900 truncate">
                  {s.description}
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  ${Number(s.unitPrice).toFixed(2)} · usado {s.useCount}×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasError && <span className="sr-only">error</span>}
    </div>
  );
}
