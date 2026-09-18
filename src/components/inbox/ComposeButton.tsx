"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mail, Plus, X } from "lucide-react";
import { composeMessageAction } from "@/actions/inbox";
import { FileAttachmentButtons } from "@/components/ui/FileAttachmentButtons";
import { RichEmailEditor } from "@/components/inbox/RichEmailEditor";
import { adminPath } from "@/lib/routes";

const MAX_ATTACHMENTS = 8;

interface SenderOption {
  id: string;
  address: string;
  displayName: string | null;
}

interface ComposeButtonProps {
  shopName: string;
  senderOptions: SenderOption[];
  defaultSenderId: string | null;
}

export function ComposeButton({ shopName, senderOptions, defaultSenderId }: ComposeButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();

  function addFiles(incoming: File[]) {
    const merged = [...files, ...incoming].slice(0, MAX_ATTACHMENTS);
    if (files.length + incoming.length > MAX_ATTACHMENTS) toast.error(`Máximo ${MAX_ATTACHMENTS} adjuntos`);
    setFiles(merged);
  }

  function removeFile(index: number) { setFiles((prev) => prev.filter((_, i) => i !== index)); }
  function closeDialog() { setOpen(false); setFiles([]); }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    files.forEach((f) => formData.append("attachments", f));

    startTransition(async () => {
      const result = await composeMessageAction(formData);
      if (result?.error) { toast.error(result.error); return; }
      toast.success("Mensaje enviado");
      closeDialog();
      if (result?.threadId) router.push(adminPath(`/inbox/${result.threadId}`));
      else router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
        <Plus className="w-4 h-4" /> Nuevo mensaje
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Nuevo mensaje</h2>
                <p className="text-xs text-slate-500 mt-1">El editor muestra el contenido dentro del branding que recibirá el cliente.</p>
              </div>
              <button type="button" onClick={closeDialog} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-3">
              {senderOptions.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Enviar desde</label>
                  <select
                    name="senderIdentityId"
                    defaultValue={defaultSenderId ?? senderOptions[0].id}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    {senderOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.displayName ? `${option.displayName} — ` : ""}
                        {option.address}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <input name="to" required placeholder="Para (separa varios con coma)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <input name="cc" placeholder="CC (opcional)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <input name="bcc" placeholder="CCO (opcional)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <input name="subject" required placeholder="Asunto" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <RichEmailEditor shopName={shopName} disabled={pending} required />

              <div className="flex flex-wrap gap-2"><FileAttachmentButtons disabled={pending} onFilesSelected={addFiles} /></div>
              {files.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {files.map((file, i) => (
                    <li key={`${file.name}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="truncate text-slate-700">{file.name}</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 ml-2"><X className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button type="button" disabled={pending} onClick={closeDialog} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
              <button type="submit" disabled={pending} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}{pending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
