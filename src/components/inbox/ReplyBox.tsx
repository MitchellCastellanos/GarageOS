"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, X } from "lucide-react";
import { replyToThreadAction, archiveThreadAction } from "@/actions/inbox";
import { FileAttachmentButtons } from "@/components/ui/FileAttachmentButtons";
import { RichEmailEditor } from "@/components/inbox/RichEmailEditor";

const MAX_ATTACHMENTS = 8;

interface ReplyBoxProps {
  threadId: string;
  defaultTo: string;
  defaultSubject: string;
  shopName: string;
}

export function ReplyBox({ threadId, defaultTo, defaultSubject, shopName }: ReplyBoxProps) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [archiving, startArchiveTransition] = useTransition();

  function addFiles(incoming: File[]) {
    const merged = [...files, ...incoming].slice(0, MAX_ATTACHMENTS);
    if (files.length + incoming.length > MAX_ATTACHMENTS) toast.error(`Máximo ${MAX_ATTACHMENTS} adjuntos`);
    setFiles(merged);
  }
  function removeFile(index: number) { setFiles((prev) => prev.filter((_, i) => i !== index)); }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    files.forEach((f) => formData.append("attachments", f));

    startTransition(async () => {
      const result = await replyToThreadAction(threadId, formData);
      if (result?.error) { toast.error(result.error); return; }
      toast.success("Respuesta enviada");
      setFiles([]);
      form.reset();
      setEditorKey((key) => key + 1);
      router.refresh();
    });
  }

  function handleArchive() {
    startArchiveTransition(async () => {
      await archiveThreadAction(threadId);
      toast.success("Conversación archivada");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Responder</h3>
        <button type="button" onClick={handleArchive} disabled={archiving} className="text-xs text-slate-500 hover:text-slate-700">Archivar conversación</button>
      </div>

      <input type="hidden" name="to" value={defaultTo} />
      <div className="text-xs text-slate-500">
        Para: <span className="font-medium text-slate-700">{defaultTo}</span>{" "}
        {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-blue-600 hover:underline ml-1">+ CC/CCO</button>}
      </div>

      {showCc && <div className="grid grid-cols-2 gap-2"><input name="cc" placeholder="CC" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" /><input name="bcc" placeholder="CCO" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>}
      <input name="subject" defaultValue={defaultSubject} placeholder="Asunto" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      <RichEmailEditor key={editorKey} shopName={shopName} disabled={pending} placeholder="Escribe tu respuesta…" required />

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

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{pending ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </form>
  );
}
