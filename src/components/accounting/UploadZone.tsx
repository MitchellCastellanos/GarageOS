"use client";

// UploadZone — drag & drop con react-dropzone
//
// react-dropzone provee el hook useDropzone() que maneja:
// - Drag over / drag leave (feedback visual)
// - File picker nativo al hacer click
// - Validación de tipo y tamaño antes de subir
//
// Al soltar archivos, construimos un FormData y llamamos el Server Action.
// El resultado se muestra como toast inline (sin librería extra).

import { useDropzone } from "react-dropzone";
import { useState, useCallback, useTransition } from "react";
import { UploadCloud, CheckCircle, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import type { DocCategory } from "@/lib/validations";

interface UploadZoneProps {
  category: DocCategory;
  onUpload: (formData: FormData) => Promise<{ error?: string; success?: boolean; fileName?: string }>;
  onSuccess: () => void;
}

interface UploadStatus {
  id: string;
  name: string;
  state: "uploading" | "done" | "error";
  message?: string;
}

export function UploadZone({ category, onUpload, onSuccess }: UploadZoneProps) {
  const [isPending, startTransition] = useTransition();
  const [statuses, setStatuses] = useState<UploadStatus[]>([]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      // Iniciar estado "subiendo" para cada archivo
      const newStatuses: UploadStatus[] = acceptedFiles.map((f) => ({
        id: `${f.name}-${Date.now()}`,
        name: f.name,
        state: "uploading",
      }));

      setStatuses((prev) => [...prev, ...newStatuses]);

      // Subir cada archivo secuencialmente
      startTransition(async () => {
        for (let i = 0; i < acceptedFiles.length; i++) {
          const file = acceptedFiles[i];
          const statusId = newStatuses[i].id;
          const formData = new FormData();
          formData.append("file", file);
          formData.append("category", category);

          const result = await onUpload(formData);

          setStatuses((prev) =>
            prev.map((s) =>
              s.id === statusId
                ? {
                    ...s,
                    state: result.success ? "done" : "error",
                    message: result.error,
                  }
                : s
            )
          );

          if (result.success) {
            toast.success(`${file.name} subido a Drive`);
            onSuccess();
          } else {
            toast.error(result.error ?? "Error al subir el archivo");
          }
        }
      });
    },
    [category, onUpload, onSuccess]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".jpg", ".jpeg", ".png", ".webp"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxSize: 20 * 1024 * 1024, // 20 MB
    disabled: isPending,
  });

  function removeStatus(id: string) {
    setStatuses((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={[
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-blue-400 bg-blue-50"
            : isPending
            ? "border-slate-200 bg-slate-50 cursor-not-allowed"
            : "border-slate-200 hover:border-blue-300 hover:bg-slate-50",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <UploadCloud
          className={`w-10 h-10 mx-auto mb-3 ${isDragActive ? "text-blue-500" : "text-slate-300"}`}
        />
        {isDragActive ? (
          <p className="text-blue-600 font-medium">Suelta los archivos aquí</p>
        ) : (
          <>
            <p className="text-slate-600 font-medium text-sm">
              Arrastra archivos aquí o{" "}
              <span className="text-blue-600">haz clic para seleccionar</span>
            </p>
            <p className="text-slate-400 text-xs mt-1">
              PDF, imágenes, Word, Excel · Máximo 20 MB por archivo
            </p>
          </>
        )}
      </div>

      {/* Upload status list */}
      {statuses.length > 0 && (
        <div className="space-y-2">
          {statuses.map((s) => (
            <div
              key={s.id}
              className={[
                "flex items-center gap-3 px-4 py-3 rounded-lg border text-sm",
                s.state === "done"
                  ? "bg-emerald-50 border-emerald-200"
                  : s.state === "error"
                  ? "bg-red-50 border-red-200"
                  : "bg-blue-50 border-blue-200",
              ].join(" ")}
            >
              {s.state === "uploading" && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              {s.state === "done" && (
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              )}
              {s.state === "error" && (
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{s.name}</p>
                {s.state === "uploading" && (
                  <p className="text-xs text-blue-600">Subiendo a Drive...</p>
                )}
                {s.state === "done" && (
                  <p className="text-xs text-emerald-600">Subido y enviado a la contadora ✓</p>
                )}
                {s.state === "error" && (
                  <p className="text-xs text-red-600">{s.message ?? "Error al subir"}</p>
                )}
              </div>

              {s.state !== "uploading" && (
                <button
                  type="button"
                  onClick={() => removeStatus(s.id)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
