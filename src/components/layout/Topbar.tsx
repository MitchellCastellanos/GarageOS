"use client";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

import { signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";

interface TopbarProps {
  userName?: string | null;
}

export function Topbar({ userName }: TopbarProps) {
  return (
    <header className="no-print h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <User className="w-4 h-4" />
          <span>{userName ?? "Usuario"}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: ADMIN.login })}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Salir
        </button>
      </div>
    </header>
  );
}
