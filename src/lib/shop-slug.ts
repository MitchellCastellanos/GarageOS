import { bookingPublicUrl } from "@/config/app";

export function getPublicBookingUrl(slug: string): string {
  return bookingPublicUrl(slug);
}
