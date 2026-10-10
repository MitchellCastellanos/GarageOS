import type { Metadata } from "next";
import { HomeView } from "@/components/marketing/HomeView";
import { pageMetadata } from "@/lib/seo/metadata";

// The published video list is cached for 5 minutes; this keeps the (otherwise static) page in step with it.
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  path: "/",
  title: "Auto shop management software",
  description:
    "Run the whole job in one place — from booking and estimates to customer approval, invoicing and the next service reminder. Built for independent garages, by people who get it.",
});

export default function HomePage() {
  return <HomeView />;
}
