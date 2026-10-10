import type { Metadata } from "next";
import { DemoBookingExperience } from "@/components/booking/demo/DemoBookingExperience";

export const metadata: Metadata = {
  title: "Garage Laurent — Démo de réservation (atelier fictif)",
  description: "Réplica de démostration de la página de reservas de Garage Laurent, un taller ficticio de GarageOS.",
  robots: { index: false, follow: false },
};

export default function DemoBookingPage() {
  return <DemoBookingExperience />;
}
