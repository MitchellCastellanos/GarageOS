"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { updateServiceCatalog } from "@/actions/booking-settings";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT, type SettingsDictionary } from "@/lib/admin-locale/settings";
import { ServiceIcon } from "@/components/booking/service-icons";
import {
  MAX_FEATURED_SERVICES,
  SERVICE_ICON_KEYS,
  resolveServiceIconKey,
  type ServiceIconKey,
} from "@/lib/booking-page";
import { cn } from "@/lib/utils";

/** "150" (min) → "2.5 h". Solo para el ojo — el valor real que se guarda siempre son minutos. */
function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours} h`;
  return `${hours.toFixed(2).replace(/0$/, "").replace(/\.$/, "")} h`;
}

interface ServiceCatalogRow {
  id: string;
  labelFr: string;
  labelEn: string;
  labelEs: string;
  durationMinutes: number;
  isActive: boolean;
  iconKey: string | null;
  isFeatured: boolean;
}

interface EditableRow extends Omit<ServiceCatalogRow, "iconKey"> {
  /** Siempre resuelto (el elegido o el inferido del nombre) para que el selector muestre algo. */
  iconKey: ServiceIconKey;
  /** Solo para el `key` de React — un servicio nuevo todavía no tiene id real en la BD. */
  rowKey: string;
}

interface ServiceCatalogSettingsProps {
  services: ServiceCatalogRow[];
  /** Se llama después de un guardado exitoso — usado por el asistente de arranque para avanzar de paso. */
  onSaved?: () => void;
}

let newRowCounter = 0;

function blankRow(): EditableRow {
  newRowCounter += 1;
  return {
    id: "",
    labelFr: "",
    labelEn: "",
    labelEs: "",
    durationMinutes: 60,
    isActive: true,
    iconKey: "wrench",
    isFeatured: false,
    rowKey: `new-${newRowCounter}`,
  };
}

export function ServiceCatalogSettings({ services, onSaved }: ServiceCatalogSettingsProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale];
  const [rows, setRows] = useState<EditableRow[]>(() =>
    services.map((s) => ({
      ...s,
      iconKey: resolveServiceIconKey(s.iconKey, [s.labelFr, s.labelEn, s.labelEs]),
      rowKey: s.id,
    }))
  );
  const [pending, startTransition] = useTransition();

  function updateRow(rowKey: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function removeRow(rowKey: string) {
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  }

  /** El orden de la lista es el sortOrder: define el orden en la página pública y en el formulario. */
  function moveRow(index: number, delta: -1 | 1) {
    setRows((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const featuredCount = rows.filter((r) => r.isActive && r.isFeatured).length;
  const featuredFull = featuredCount >= MAX_FEATURED_SERVICES;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (rows.length === 0) {
      toast.error(t.services.needOneService);
      return;
    }
    for (const row of rows) {
      if (!row.labelFr.trim() || !row.labelEn.trim() || !row.labelEs.trim()) {
        toast.error(t.services.needAllLanguages);
        return;
      }
    }

    if (featuredCount > MAX_FEATURED_SERVICES) {
      toast.error(t.services.featuredLimit(MAX_FEATURED_SERVICES));
      return;
    }

    const payload = rows.map(({ labelFr, labelEn, labelEs, durationMinutes, isActive, iconKey, isFeatured }) => ({
      labelFr: labelFr.trim(),
      labelEn: labelEn.trim(),
      labelEs: labelEs.trim(),
      durationMinutes,
      isActive,
      iconKey,
      isFeatured,
    }));

    const formData = new FormData();
    formData.set("services", JSON.stringify(payload));

    startTransition(async () => {
      const result = await updateServiceCatalog(formData);
      if (result?.success) {
        toast.success(t.services.saved);
        onSaved?.();
      } else {
        const msg = result?.error ? Object.values(result.error).flat()[0] : t.services.saved;
        toast.error(typeof msg === "string" ? msg : t.services.saved);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-slate-200 p-5 space-y-4"
    >
      <div>
        <h2 className="font-semibold text-slate-900">{t.services.title}</h2>
        <p className="text-sm text-slate-500 mt-1">{t.services.subtitle}</p>
        <p className="text-xs text-slate-400 mt-1">{t.services.featuredHint(MAX_FEATURED_SERVICES)}</p>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={row.rowKey} className="border border-slate-200 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <IconPicker
                  value={row.iconKey}
                  onChange={(iconKey) => updateRow(row.rowKey, { iconKey })}
                  t={t}
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.isActive}
                    onChange={(e) => updateRow(row.rowKey, { isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600"
                  />
                  {t.services.active}
                </label>
                <button
                  type="button"
                  onClick={() => updateRow(row.rowKey, { isFeatured: !row.isFeatured })}
                  disabled={!row.isFeatured && featuredFull}
                  aria-pressed={row.isFeatured}
                  title={!row.isFeatured && featuredFull ? t.services.featuredLimit(MAX_FEATURED_SERVICES) : undefined}
                  className={cn(
                    "flex items-center gap-1.5 text-sm px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    row.isFeatured
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Star className={cn("w-3.5 h-3.5", row.isFeatured && "fill-amber-400 text-amber-500")} />
                  {t.services.featured}
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveRow(index, -1)}
                  disabled={index === 0}
                  className="text-slate-500 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-30"
                  title={t.services.moveUp}
                  aria-label={t.services.moveUp}
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(index, 1)}
                  disabled={index === rows.length - 1}
                  className="text-slate-500 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-30"
                  title={t.services.moveDown}
                  aria-label={t.services.moveDown}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(row.rowKey)}
                  className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg"
                  title={t.services.remove}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t.services.french}</label>
                <input
                  value={row.labelFr}
                  onChange={(e) => updateRow(row.rowKey, { labelFr: e.target.value })}
                  placeholder="Ex: Changement d'huile"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t.services.english}</label>
                <input
                  value={row.labelEn}
                  onChange={(e) => updateRow(row.rowKey, { labelEn: e.target.value })}
                  placeholder="Ex: Oil change"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t.services.spanish}</label>
                <input
                  value={row.labelEs}
                  onChange={(e) => updateRow(row.rowKey, { labelEs: e.target.value })}
                  placeholder="Ej: Cambio de aceite"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={row.durationMinutes}
                onChange={(e) => updateRow(row.rowKey, { durationMinutes: e.target.valueAsNumber })}
                required
                className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right"
              />
              <span className="text-xs text-slate-400">
                {t.services.duration} · {formatHours(row.durationMinutes)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 text-sm text-teal-700 hover:bg-teal-50 px-3 py-2 rounded-lg border border-dashed border-teal-300"
      >
        <Plus className="w-4 h-4" />
        {t.services.addService}
      </button>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {t.services.saveServices}
        </button>
      </div>
    </form>
  );
}

/** Selector de ícono con vocabulario curado — nunca subida de imágenes por servicio. */
function IconPicker({
  value,
  onChange,
  t,
}: {
  value: ServiceIconKey;
  onChange: (value: ServiceIconKey) => void;
  t: SettingsDictionary;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${t.services.chooseIcon}: ${t.services.iconLabels[value]}`}
        title={t.services.iconLabels[value]}
        className="flex items-center gap-1 border border-slate-200 hover:border-slate-300 rounded-lg px-2 py-1.5 text-slate-700"
      >
        <ServiceIcon iconKey={value} className="w-4 h-4" />
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t.services.chooseIcon}
          className="absolute z-20 left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-4 gap-1"
        >
          {SERVICE_ICON_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={key === value}
              title={t.services.iconLabels[key]}
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md p-2 text-[10px] leading-tight text-center",
                key === value ? "bg-teal-50 text-teal-800 ring-1 ring-teal-300" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <ServiceIcon iconKey={key} className="w-5 h-5" />
              <span className="line-clamp-1 w-full">{t.services.iconLabels[key]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent";
