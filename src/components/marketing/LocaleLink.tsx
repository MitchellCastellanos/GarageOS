"use client";

import { useContext } from "react";
import Link from "next/link";
import { MarketingLocaleContext } from "@/components/marketing/MarketingLocaleProvider";
import { localizeHref } from "@/lib/seo/routes";

type LinkProps = React.ComponentProps<typeof Link>;

/**
 * `next/link` que apunta a la página equivalente en el idioma actual cuando existe (en /fr/** los enlaces internos
 * conducen a páginas francesas); si no existe, conserva el destino original. Sin proveedor funciona como `Link`.
 */
export function LocaleLink({ href, ...props }: LinkProps) {
  const ctx = useContext(MarketingLocaleContext);
  const target = typeof href === "string" && ctx ? localizeHref(href, ctx.locale) : href;
  return <Link href={target} {...props} />;
}
