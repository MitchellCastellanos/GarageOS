import { Oswald } from "next/font/google";

// Una sola instancia de la fuente, compartida por los dos layouts raíz (EN y FR).
export const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});
