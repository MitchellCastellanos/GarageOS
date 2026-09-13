import Image from "next/image";
import Link from "next/link";

interface SiteFooterProps {
  shopName: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  brandColor: string;
}

export function SiteFooter({ shopName, logoUrl, address, phone, brandColor }: SiteFooterProps) {
  return (
    <footer style={{ backgroundColor: brandColor }} className="border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          {logoUrl && (
            <Image
              src={logoUrl}
              alt={shopName}
              width={36}
              height={36}
              className="object-contain"
              unoptimized
            />
          )}
          <div>
            <p className="font-display font-semibold uppercase text-white text-sm">{shopName}</p>
            {address && <p className="text-xs text-slate-500 mt-0.5">{address}</p>}
          </div>
        </div>

        {phone && (
          <a
            href={`tel:${phone}`}
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            {phone}
          </a>
        )}

        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} {shopName}
        </p>
      </div>

      <div className="border-t border-white/10 bg-black/30 py-3 flex items-center justify-center gap-3">
        <a
          href="https://garageos.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          Powered by GarageOS
        </a>
        <span className="text-slate-700">·</span>
        <Link
          href="/admin/login"
          className="text-[11px] text-slate-700 hover:text-slate-500 transition-colors"
        >
          Staff
        </Link>
      </div>
    </footer>
  );
}
