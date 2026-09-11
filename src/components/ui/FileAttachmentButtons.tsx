"use client";

import { useRef, useState } from "react";
import { Paperclip, Camera } from "lucide-react";
import { CameraCaptureModal, usePreferNativeCamera } from "@/components/ui/CameraCaptureModal";

interface FileAttachmentButtonsProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
  uploadLabel?: string;
  cameraLabel?: string;
}

export function FileAttachmentButtons({
  onFilesSelected,
  disabled,
  accept = "application/pdf,image/jpeg,image/png,image/webp",
  multiple = true,
  uploadLabel = "Subir archivo",
  cameraLabel = "Cámara / escáner",
}: FileAttachmentButtonsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const preferNativeCamera = usePreferNativeCamera();

  function handleCameraClick() {
    if (preferNativeCamera) {
      cameraInputRef.current?.click();
    } else {
      setCameraModalOpen(true);
    }
  }

  const btnClass =
    "flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        className={btnClass}
      >
        <Paperclip className="w-4 h-4" />
        {uploadLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={handleCameraClick}
        className={btnClass}
      >
        <Camera className="w-4 h-4" />
        {cameraLabel}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const list = e.target.files;
          if (list?.length) onFilesSelected(Array.from(list));
          e.target.value = "";
        }}
      />

      {preferNativeCamera && (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const list = e.target.files;
            if (list?.length) onFilesSelected(Array.from(list));
            e.target.value = "";
          }}
        />
      )}

      <CameraCaptureModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={(file) => onFilesSelected([file])}
      />
    </>
  );
}
