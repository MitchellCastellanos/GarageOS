import { Radar, LayoutDashboard, BarChart3, MessagesSquare, Users, Kanban, ListChecks, MonitorPlay, Contact, SlidersHorizontal, Store, Mail, Send, CalendarDays, Settings2, MapPin, Video, UserCog, Route, LocateFixed, Briefcase, Building2, ShieldCheck, type LucideIcon } from "lucide-react";
import { PLATFORM } from "@/lib/routes";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { radarCopy } from "@/lib/admin-locale/lead-radar";
import type { PlatformSalesKind } from "@/domain/sales-crm/access";

export interface PlatformNavContext { kind: PlatformSalesKind; locale: "en" | "fr"; /** National Lead Radar entry: Super Admin, and managers only while review is allowed. Convenience only. */ leadRadar?: boolean; /** Field planner link: FIELD sellers and managers/Super Admin (read-only for non-FIELD). Convenience only; pages re-check. */ fieldPlanner?: boolean }

export interface NavItem { href: string; label: string; icon: LucideIcon; exact?: boolean; also?: string[] }
export interface NavGroup { id: "crm" | "platform" | "admin"; label: string; icon: LucideIcon; items: NavItem[] }
export interface PlatformNav { top: NavItem[]; groups: NavGroup[]; account: NavItem }

/** Navigation is built from the platform role. Hiding is only convenience: every page and action re-checks on the server. */
export function navFor({ kind, locale, fieldPlanner, leadRadar }: PlatformNavContext): PlatformNav {
  const t = crmCopy(locale).nav;
  const c = commsCopy(locale).nav;
  const ic = identityCopy(locale);
  const top: NavItem[] = [{ href: PLATFORM.sales, label: t.home, icon: LayoutDashboard, exact: true }];
  if (leadRadar) top.push({ href: PLATFORM.salesLeadRadar, label: radarCopy(locale).nav, icon: Radar });

  const groups: NavGroup[] = [{
    id: "crm", label: t.crm, icon: Briefcase, items: [
      { href: PLATFORM.salesProspects, label: t.prospects, icon: Contact },
      { href: PLATFORM.salesPipeline, label: t.pipeline, icon: Kanban },
      { href: PLATFORM.salesTasks, label: t.tasks, icon: ListChecks },
      ...(fieldPlanner ? [{ href: PLATFORM.salesField, label: fieldCopy(locale).nav, icon: Route }] : []),
      { href: PLATFORM.salesInbox, label: c.inbox, icon: Mail },
      { href: PLATFORM.salesOutreach, label: c.outreach, icon: Send },
      { href: PLATFORM.salesCalendar, label: c.calendar, icon: CalendarDays },
      { href: PLATFORM.salesDemos, label: t.demos, icon: MonitorPlay, also: [PLATFORM.salesNew] },
    ],
  }];
  if (kind === "SUPER_ADMIN") groups.push({
    id: "platform", label: t.platform, icon: Building2, items: [
      { href: PLATFORM.home, label: t.shops, icon: Store, exact: true, also: ["/platform/shops"] },
      { href: PLATFORM.analytics, label: t.analytics, icon: BarChart3 },
      { href: PLATFORM.messages, label: t.messages, icon: MessagesSquare },
    ],
  });
  const admin: NavItem[] = [];
  if (kind === "SUPER_ADMIN" || kind === "SALES_MANAGER") admin.push({ href: PLATFORM.salesTeam, label: t.team, icon: Users });
  if (kind === "SUPER_ADMIN") admin.push(
    { href: PLATFORM.salesNeeds, label: t.needs, icon: SlidersHorizontal },
    { href: PLATFORM.salesComms, label: c.comms, icon: Settings2 },
    { href: PLATFORM.salesTerritories, label: ic.territories.title, icon: MapPin },
    { href: PLATFORM.salesGeocoding, label: fieldCopy(locale).geocodingAdmin.nav, icon: LocateFixed },
    { href: PLATFORM.salesVideos, label: ic.videos.title, icon: Video },
  );
  if (admin.length) groups.push({ id: "admin", label: t.admin, icon: ShieldCheck, items: admin });
  return { top, groups, account: { href: PLATFORM.salesAccount, label: ic.account.title, icon: UserCog } };
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact && pathname === item.href) return true;
  return [...(item.exact ? [] : [item.href]), ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

/** The group that contains the current page, so it can be expanded automatically. */
export function activeGroupId(nav: PlatformNav, pathname: string): NavGroup["id"] | null {
  return nav.groups.find((g) => g.items.some((i) => isNavItemActive(i, pathname)))?.id ?? null;
}
