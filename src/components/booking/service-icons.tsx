import {
  ArrowUpDown,
  CarBattery,
  CarFront,
  CircleDashed,
  ClipboardCheck,
  Cog,
  Crosshair,
  Disc3,
  Droplet,
  Engine,
  Gauge,
  Snowflake,
  Sparkles,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DEFAULT_SERVICE_ICON, isServiceIconKey, type ServiceIconKey } from "@/lib/booking-page";

/** Vocabulario curado de íconos de servicio — una sola familia (Lucide). */
export const SERVICE_ICONS: Record<ServiceIconKey, LucideIcon> = {
  wrench: Wrench,
  oil: Droplet,
  tires: CircleDashed,
  brakes: Disc3,
  battery: CarBattery,
  diagnostics: Gauge,
  engine: Engine,
  alignment: Crosshair,
  suspension: ArrowUpDown,
  ac: Snowflake,
  transmission: Cog,
  exhaust: Wind,
  inspection: ClipboardCheck,
  electrical: Zap,
  detailing: Sparkles,
  car: CarFront,
};

export function ServiceIcon({ iconKey, className }: { iconKey: string | null | undefined; className?: string }) {
  const Icon = SERVICE_ICONS[isServiceIconKey(iconKey) ? iconKey : DEFAULT_SERVICE_ICON];
  return <Icon className={className} aria-hidden="true" />;
}
