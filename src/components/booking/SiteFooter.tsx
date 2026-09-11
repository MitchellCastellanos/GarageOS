import Image from "next/image";
import Link from "next/link";

interface SiteFooterProps {
  shopName: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
}

export function SiteFooter({ shopName, logoUrl, address, phone }: SiteFooterProps) {
  return (
    <footer className="bg-brand-black border-t border-white/10">
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

      <div className="border-t border-white/5 py-3 text-center">
        <Link
          href="/admin/login"
          className="text-[11px] text-slate-800 hover:text-slate-500 transition-colors"
        >
          Staff
        </Link>
      </div>
    </footer>
  );
}
