"use client";

// Selector de cliente con búsqueda — reemplaza el <select> plano (sin buscar
// ni ordenar bien) por un combobox: escribe para filtrar por nombre,
// teléfono o email, y elige de la lista filtrada.

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatClientName } from "@/lib/client-name";

interface ClientOption {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface ClientComboboxProps {
  clients: ClientOption[];
  value: string;
  onChange: (clientId: string) => void;
  hasError?: boolean;
}

function normalize(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function ClientCombobox({ clients, value, onChange, hasError }: ClientComboboxProps) {
  const selected = clients.find((c) => c.id === value) ?? null;
  const [query, setQuery] = useState(() => (selected ? formatClientName(selected) : ""));
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected ? formatClientName(selected) : "");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selected]);

  const q = normalize(query.trim());
  const filtered = q
    ? clients.filter((c) => {
        const name = normalize(formatClientName(c));
        return name.includes(q) || normalize(c.phone).includes(q) || normalize(c.email).includes(q);
      })
    : clients;

  function pick(client: ClientOption) {
    onChange(client.id);
    setQuery(formatClientName(client));
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[highlight];
      if (target) pick(target);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(selected ? formatClientName(selected) : "");
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar por nombre, teléfono o email..."
        autoComplete="off"
        className={[
          "w-full px-3 py-2 pr-8 border rounded-lg text-sm",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          hasError ? "border-red-400 bg-red-50" : "border-slate-300",
        ].join(" ")}
      />
      {selected && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          title="Quitar selección"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">Sin resultados</li>
          )}
          {filtered.map((client, index) => (
            <li key={client.id}>
              <button
                type="button"
                onClick={() => pick(client)}
                onMouseEnter={() => setHighlight(index)}
                className={`w-full text-left px-3 py-2 transition-colors ${
                  index === highlight ? "bg-blue-50" : "hover:bg-blue-50"
                }`}
              >
                <span className="block text-sm font-medium text-slate-900 truncate">
                  {formatClientName(client)}
                </span>
                {(client.phone || client.email) && (
                  <span className="block text-xs text-slate-500 mt-0.5 truncate">
                    {[client.phone, client.email].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
