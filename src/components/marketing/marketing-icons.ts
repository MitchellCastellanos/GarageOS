import {
  Banknote, Bell, BookOpen, Building2, Calendar, CalendarClock, Camera, CircleDot, ClipboardCheck, CreditCard, FileCheck2,
  Globe, Layers, Lock, Mail, Megaphone, MessageSquareText, PackageSearch, Plug, Receipt, Repeat, ShieldCheck, Smartphone,
  Upload, UserCog, Users, Wrench, FileText, type LucideIcon,
} from "lucide-react";

/** Íconos de las páginas públicas por clave (el contenido bilingüe vive en src/lib/marketing-pages.ts). */
export const MARKETING_ICONS: Record<string, LucideIcon> = {
  banknote: Banknote, bell: Bell, book: BookOpen, building: Building2, calendar: Calendar, calendarClock: CalendarClock,
  camera: Camera, tire: CircleDot, clipboard: ClipboardCheck, card: CreditCard, file: FileCheck2, globe: Globe, chart: Layers,
  lock: Lock, mail: Mail, megaphone: Megaphone, message: MessageSquareText, package: PackageSearch, plug: Plug, receipt: Receipt,
  repeat: Repeat, shield: ShieldCheck, smartphone: Smartphone, upload: Upload, userCog: UserCog, users: Users, wrench: Wrench,
  doc: FileText,
};

export function marketingIcon(key: string): LucideIcon {
  return MARKETING_ICONS[key] ?? FileText;
}
