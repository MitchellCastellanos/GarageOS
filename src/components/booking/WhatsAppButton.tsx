"use client";

import { motion } from "framer-motion";
import { useSiteLocale } from "@/components/booking/LocaleProvider";

interface WhatsAppButtonProps {
  phone: string | null;
}

/** Normaliza a dígitos y agrega el código de país (+1, Canadá/Québec) si falta. */
function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

export function WhatsAppButton({ phone }: WhatsAppButtonProps) {
  const { t } = useSiteLocale();
  if (!phone) return null;

  const href = `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(t.whatsapp.message)}`;

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.whatsapp.label}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.6 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-5 right-5 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] shadow-lg shadow-black/30"
    >
      <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.33 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.05c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11a16.3 16.3 0 0 1-1.63-.6c-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.17-1.55-1.17-2.96 0-1.4.74-2.09 1-2.38.27-.28.58-.35.78-.35h.55c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.15.32-.3.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.24.66-.15.27.1 1.7.8 1.99 1 .3.15.49.23.56.35.08.13.08.72-.16 1.4Z" />
      </svg>
    </motion.a>
  );
}
