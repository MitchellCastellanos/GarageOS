"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { updateServiceCatalog } from "@/actions/booking-settings";

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
}

interface EditableRow extends ServiceCatalogRow {
  /** Solo para el `key` de React — un servicio nuevo todavía no tiene id real en la BD. */
  rowKey: string;
}

interface ServiceCatalogSettingsProps {
  services: ServiceCatalogRow[];
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
    rowKey: `new-${newRowCounter}`,
  };
}

export function ServiceCatalogSettings({ services }: ServiceCatalogSettingsProps) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    services.map((s) => ({ ...s, rowKey: s.id }))
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (rows.length === 0) {
      toast.error("Agrega al menos un servicio");
      return;
    }
    for (const row of rows) {
      if (!row.labelFr.trim() || !row.labelEn.trim() || !row.labelEs.trim()) {
        toast.error("Completa el nombre del servicio en los 3 idiomas");
        return;
      }
    }

    const payload = rows.map(({ labelFr, labelEn, labelEs, durationMinutes, isActive }) => ({
      labelFr: labelFr.trim(),
      labelEn: labelEn.trim(),
      labelEs: labelEs.trim(),
      durationMinutes,
      isActive,
    }));

    const formData = new FormData();
    formData.set("services", JSON.stringify(payload));

    startTransition(async () => {
      const result = await updateServiceCatalog(formData);
      if (result?.success) toast.success("Servicios guardados");
      else {
        const msg = result?.error ? Object.values(result.error).flat()[0] : "Error al guardar";
        toast.error(typeof msg === "string" ? msg : "Error al guardar");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-slate-200 p-5 space-y-4"
    >
      <div>
        <h2 className="font-semibold text-slate-900">Servicios del calendario público</h2>
        <p className="text-sm text-slate-500 mt-1">
          Estos son los servicios que el cliente elige en <strong>/book/…</strong> — cada uno con
          su nombre en francés, inglés y español (el sitio se lo muestra en el idioma que el
          visitante tenga elegido) y su duración, que es la que bloquea el horario del mecánico.
          Agrega, edita o quita servicios; desmarca &ldquo;activo&rdquo; para ocultar uno sin borrarlo.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.rowKey} className="border border-slate-200 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={row.isActive}
                  onChange={(e) => updateRow(row.rowKey, { isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-teal-600"
                />
                Activo
              </label>
              <button
                type="button"
                onClick={() => removeRow(row.rowKey)}
                className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg"
                title="Quitar servicio"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Francés (FR)</label>
                <input
                  value={row.labelFr}
                  onChange={(e) => updateRow(row.rowKey, { labelFr: e.target.value })}
                  placeholder="Ex: Changement d'huile"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Inglés (EN)</label>
                <input
                  value={row.labelEn}
                  onChange={(e) => updateRow(row.rowKey, { labelEn: e.target.value })}
                  placeholder="Ex: Oil change"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Español (ES)</label>
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
              <span className="text-xs text-slate-400">min · {formatHours(row.durationMinutes)}</span>
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
        Agregar servicio
      </button>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          Guardar servicios
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent";
