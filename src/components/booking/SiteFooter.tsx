import Link from "next/link";
import { ShopLogo } from "@/components/booking/page/shared";

interface SiteFooterProps {
  shopName: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  /** "dark": fondo `backgroundColor` (Classic/Bold). "light": fondo claro (Modern/Minimal). */
  tone?: "dark" | "light";
  backgroundColor?: string;
}

export function SiteFooter({ shopName, logoUrl, address, phone, tone = "dark", backgroundColor }: SiteFooterProps) {
  const dark = tone === "dark";

  return (
    <footer
      style={dark ? { backgroundColor } : undefined}
      className={dark ? "border-t border-white/10" : "bg-slate-50 border-t border-slate-200"}
    >
      <div className="max-w-6xl mx-auto px-4 @2xl:px-6 py-10 flex flex-col @2xl:flex-row items-center justify-between gap-6 text-center @2xl:text-left">
        <div className="flex items-center gap-3 min-w-0">
          <ShopLogo logoUrl={logoUrl} name={shopName} size={36} className="object-contain shrink-0" />
          <div className="min-w-0">
            <p className={["bp-heading text-sm", dark ? "text-white" : "text-slate-900"].join(" ")}>{shopName}</p>
            {address && <p className={["text-xs mt-0.5", dark ? "text-slate-500" : "text-slate-500"].join(" ")}>{address}</p>}
          </div>
        </div>

        {phone && (
          <a
            href={`tel:${phone}`}
            className={[
              "text-sm font-medium transition-colors",
              dark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-950",
            ].join(" ")}
          >
            {phone}
          </a>
        )}

        <p className={["text-xs", dark ? "text-slate-600" : "text-slate-500"].join(" ")}>
          © {new Date().getFullYear()} {shopName}
        </p>
      </div>

      <div
        className={[
          "border-t py-3 flex items-center justify-center gap-3",
          dark ? "border-white/10 bg-black/30" : "border-slate-200 bg-white",
        ].join(" ")}
      >
        <a
          href="https://garageos.com"
          target="_blank"
          rel="noopener noreferrer"
          className={[
            "text-[11px] font-medium transition-colors",
            dark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800",
          ].join(" ")}
        >
          Powered by GarageOS
        </a>
        <span className={dark ? "text-slate-700" : "text-slate-300"}>·</span>
        <Link
          href="/admin/login"
          className={[
            "text-[11px] transition-colors",
            dark ? "text-slate-700 hover:text-slate-500" : "text-slate-400 hover:text-slate-600",
          ].join(" ")}
        >
          Staff
        </Link>
      </div>
    </footer>
  );
}
