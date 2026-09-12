"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  updateAppointmentBookingSettings,
  updateMechanicBookable,
  updateMechanicWorkingHours,
  resetMechanicWorkingHours,
  updateShopWorkingHours,
} from "@/actions/booking-settings";
import type { WorkingHoursRow } from "@/lib/working-hours";
import { OnlineBookingSettings } from "@/components/settings/OnlineBookingSettings";
import { Calendar, ChevronDown, Loader2 } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT, type SettingsDictionary } from "@/lib/admin-locale/settings";

interface MechanicRow {
  id: string;
  name: string;
  role: string;
  bookable: boolean;
  usesShopHours: boolean;
  workingHours: WorkingHoursRow[];
}

interface AppointmentBookingSettingsProps {
  shop: {
    bookingEnabled: boolean;
    timezone: string;
    bookingSlotMinutes: number;
    bookingLeadTimeHours: number;
    bookingAdvanceDays: number;
    bookingUrl: string | null;
  };
  workingHours: WorkingHoursRow[];
  mechanics: MechanicRow[];
}

export function AppointmentBookingSettings({
  shop,
  workingHours,
  mechanics,
}: AppointmentBookingSettingsProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale];
  const [bookingPending, startBookingTransition] = useTransition();
  const [hoursPending, startHoursTransition] = useTransition();
  const [mechanicPending, startMechanicTransition] = useTransition();

  function handleBookingSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startBookingTransition(async () => {
      const result = await updateAppointmentBookingSettings(formData);
      if (result?.success) {
        toast.success(t.booking.saved);
      } else if (result?.error) {
        const msg = Object.values(result.error).flat()[0];
        toast.error(typeof msg === "string" ? msg : t.booking.saved);
      }
    });
  }

  function handleHoursSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startHoursTransition(async () => {
      const result = await updateShopWorkingHours(formData);
      if (result?.success) toast.success(t.booking.hoursSaved);
      else toast.error(t.booking.hoursSaved);
    });
  }

  function toggleMechanicBookable(userId: string, bookable: boolean) {
    startMechanicTransition(async () => {
      const result = await updateMechanicBookable(userId, bookable);
      if (result?.success) toast.success(bookable ? t.booking.mechanicVisible : t.booking.mechanicHidden);
      else toast.error(result?.error ?? "Error");
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <OnlineBookingSettings shop={shop} />
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-900">{t.booking.rulesTitle}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.booking.rulesSubtitle}</p>
        </div>

        <form onSubmit={handleBookingSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t.booking.slotMinutes}
              </label>
              <input
                name="bookingSlotMinutes"
                type="number"
                min={15}
                step={15}
                defaultValue={shop.bookingSlotMinutes}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t.booking.leadTime}
              </label>
              <input
                name="bookingLeadTimeHours"
                type="number"
                min={1}
                max={168}
                defaultValue={shop.bookingLeadTimeHours}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t.booking.advanceDays}
              </label>
              <input
                name="bookingAdvanceDays"
                type="number"
                min={1}
                max={90}
                defaultValue={shop.bookingAdvanceDays}
                className={inputClass}
              />
            </div>
            <div className="text-xs text-slate-400 flex items-end pb-2">
              {t.booking.timezone}: {shop.timezone}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={bookingPending}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
            >
              {bookingPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.booking.saveBooking}
            </button>
          </div>
        </form>
      </div>

      <form
        onSubmit={handleHoursSubmit}
        className="bg-white rounded-xl border border-slate-200 p-5 space-y-4"
      >
        <div>
          <h2 className="font-semibold text-slate-900">{t.booking.hoursTitle}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.booking.hoursSubtitle}</p>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
          {workingHours.map((row) => (
            <div
              key={row.dayOfWeek}
              className="flex flex-wrap items-center gap-3 p-3 bg-white"
            >
              <span className="w-24 text-sm font-medium text-slate-800">{row.dayLabel}</span>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name={`closed_${row.dayOfWeek}`}
                  defaultChecked={row.isClosed}
                  className="rounded border-slate-300"
                />
                {t.booking.closed}
              </label>
              <input
                type="time"
                name={`open_${row.dayOfWeek}`}
                defaultValue={row.openTime}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
              />
              <span className="text-slate-400">—</span>
              <input
                type="time"
                name={`close_${row.dayOfWeek}`}
                defaultValue={row.closeTime}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={hoursPending}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
          >
            {hoursPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.booking.saveHours}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-900">{t.booking.mechanicsTitle}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.booking.mechanicsSubtitle}</p>
        </div>

        {mechanics.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
            {t.booking.noMechanics}
          </p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {mechanics.map((m) => (
              <div key={m.id}>
                <div className="flex flex-col items-start sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-slate-50">
                  <label className="flex items-center gap-4 flex-1 cursor-pointer">
                    <div>
                      <p className="font-medium text-slate-900">{m.name}</p>
                      <p className="text-xs text-slate-500">
                        {m.role === "OWNER" ? t.booking.owner : t.booking.mechanic}
                        {m.usesShopHours ? ` · ${t.booking.followsShopHours}` : ` · ${t.booking.ownHours}`}
                      </p>
                    </div>
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <MechanicScheduleToggle mechanicId={m.id} label={t.booking.scheduleButton} />
                    <span className="text-xs text-slate-500">{t.booking.receivesWebBookings}</span>
                    <input
                      type="checkbox"
                      defaultChecked={m.bookable}
                      disabled={mechanicPending}
                      onChange={(e) => toggleMechanicBookable(m.id, e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600"
                    />
                  </div>
                </div>
                <MechanicSchedulePanel mechanic={m} t={t} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * El botón vive fuera del panel para no depender de un context: usa el mismo id de
 * elemento <details> renderizado por MechanicSchedulePanel para expandir/contraer.
 */
function MechanicScheduleToggle({ mechanicId, label }: { mechanicId: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById(`mechanic-schedule-${mechanicId}`);
        el?.toggleAttribute("open");
      }}
      className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-teal-700 px-2 py-1.5 rounded-lg hover:bg-teal-50"
      title={label}
    >
      <Calendar className="w-3.5 h-3.5" />
      {label}
      <ChevronDown className="w-3.5 h-3.5" />
    </button>
  );
}

function MechanicSchedulePanel({
  mechanic,
  t,
}: {
  mechanic: MechanicRow;
  t: SettingsDictionary;
}) {
  const [custom, setCustom] = useState(!mechanic.usesShopHours);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      if (!custom) {
        const result = await resetMechanicWorkingHours(mechanic.id);
        if (result?.success) toast.success(t.booking.mechanicFollowsShop(mechanic.name));
        else toast.error(result?.error ?? t.booking.saved);
        return;
      }

      const formData = new FormData(e.currentTarget);
      formData.set("userId", mechanic.id);
      const result = await updateMechanicWorkingHours(formData);
      if (result?.success) toast.success(t.booking.mechanicScheduleSaved(mechanic.name));
      else if (result?.error) {
        const msg = Object.values(result.error).flat()[0];
        toast.error(typeof msg === "string" ? msg : t.booking.saved);
      }
    });
  }

  return (
    <details id={`mechanic-schedule-${mechanic.id}`} className="group">
      <summary className="hidden" />
      <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-3 bg-slate-50/70 border-t border-slate-100">
        <label className="flex items-center gap-2 text-sm text-slate-700 pt-3">
          <input
            type="checkbox"
            checked={custom}
            onChange={(e) => setCustom(e.target.checked)}
            className="rounded border-slate-300 text-teal-600"
          />
          {t.booking.ownHoursCheckbox}
        </label>

        {custom && (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
            {mechanic.workingHours.map((row) => (
              <div key={row.dayOfWeek} className="flex flex-wrap items-center gap-3 p-2.5">
                <span className="w-24 text-sm font-medium text-slate-800">{row.dayLabel}</span>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    name={`closed_${row.dayOfWeek}`}
                    defaultChecked={row.isClosed}
                    className="rounded border-slate-300"
                  />
                  {t.booking.notWorking}
                </label>
                <input
                  type="time"
                  name={`open_${row.dayOfWeek}`}
                  defaultValue={row.openTime}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
                <span className="text-slate-400">—</span>
                <input
                  type="time"
                  name={`close_${row.dayOfWeek}`}
                  defaultValue={row.closeTime}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.booking.saveMechanicSchedule(mechanic.name)}
          </button>
        </div>
      </form>
    </details>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent";
