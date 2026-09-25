"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
  getMyStaffNotifications,
  markAllStaffNotificationsReadAction,
  markStaffNotificationReadAction,
  type StaffNotificationRow,
} from "@/actions/staff-notifications";
import { formatDate } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { NOTIFICATION_BELL_DICT } from "@/lib/admin-locale/notifications-bell";

interface NotificationBellProps {
  userId: string;
  initialNotifications: StaffNotificationRow[];
  initialUnreadCount: number;
}

export function NotificationBell({ userId, initialNotifications, initialUnreadCount }: NotificationBellProps) {
  const locale = useAdminLocale();
  const t = NOTIFICATION_BELL_DICT[locale];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  // Tiempo real: cada usuario tiene su propio canal — ver src/lib/staff-notify-realtime.ts.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    import("pusher-js").then(({ default: Pusher }) => {
      if (cancelled) return;
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! });
      const channelName = `staff-notifications-${userId}`;
      const channel = pusher.subscribe(channelName);
      const handler = (notification: StaffNotificationRow) => {
        setNotifications((prev) => (prev.some((n) => n.id === notification.id) ? prev : [notification, ...prev].slice(0, 30)));
        setUnreadCount((c) => c + 1);
      };
      channel.bind("notification", handler);
      unsub = () => {
        channel.unbind("notification", handler);
        pusher.unsubscribe(channelName);
        pusher.disconnect();
      };
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [userId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Sin Pusher configurado (o si se perdió algún evento), refresca al abrir.
      startTransition(async () => {
        const fresh = await getMyStaffNotifications();
        setNotifications(fresh.notifications);
        setUnreadCount(fresh.unreadCount);
      });
    }
  }

  function handleItemClick(notification: StaffNotificationRow) {
    setOpen(false);
    if (!notification.readAt) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      startTransition(async () => {
        await markStaffNotificationReadAction(notification.id);
      });
    }
    if (notification.href) router.push(notification.href);
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    startTransition(async () => {
      await markAllStaffNotificationsReadAction();
    });
  }

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={t.ariaLabel}
        aria-expanded={open}
        className="relative p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-lg border border-slate-200 shadow-lg z-30 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-900">{t.title}</span>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs text-teal-700 hover:underline">
                {t.markAllRead}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-sm text-slate-400 text-center">{t.empty}</p>
            ) : (
              notifications.map((n) => {
                const content = (
                  <div className={`px-3 py-2.5 hover:bg-slate-50 ${!n.readAt ? "bg-teal-50/60" : ""}`}>
                    <div className="flex items-start gap-2">
                      {!n.readAt && <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-teal-600 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className={`text-sm ${!n.readAt ? "font-semibold text-slate-900" : "text-slate-700"}`}>{n.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{formatDate(n.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                );
                return n.href ? (
                  <button key={n.id} type="button" onClick={() => handleItemClick(n)} className="block w-full text-left">
                    {content}
                  </button>
                ) : (
                  <div key={n.id} onClick={() => handleItemClick(n)} role="button" tabIndex={0}>
                    {content}
                  </div>
                );
              })
            )}
          </div>
          {notifications.length > 0 && (
            <Link
              href="/admin/settings?tab=notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-slate-500 hover:text-slate-800 py-2 border-t border-slate-100"
            >
              {t.viewAll}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
