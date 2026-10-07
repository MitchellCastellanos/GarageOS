"use client";

import { createContext, useContext } from "react";

/**
 * Modo demostración del booking (ruta /demo/booking). Sin proveedor (todas las rutas reales) vale null y
 * los componentes se comportan exactamente igual que siempre. Con proveedor: la disponibilidad sale de
 * datos locales, el envío de datos está deshabilitado y los enlaces externos son solo informativos.
 * Nada del modo demo hace requests ni guarda datos.
 */
export interface BookingDemoApi {
  loadDates(serviceId: string): Promise<{ dates: string[]; availableDates: string[] }>;
  loadSlots(date: string, serviceId: string): Promise<{ time: string; mechanicName: string }[]>;
}

export const BookingDemoContext = createContext<BookingDemoApi | null>(null);

export function useBookingDemo(): BookingDemoApi | null {
  return useContext(BookingDemoContext);
}
