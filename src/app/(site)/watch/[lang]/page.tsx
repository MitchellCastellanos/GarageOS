import { WatchPage, watchMetadata } from "@/lib/watch-page";

export const generateMetadata = (p: Parameters<typeof watchMetadata>[0]) => watchMetadata(p, "commercial");
export default function Page(p: Parameters<typeof WatchPage>[0]) { return WatchPage(p, "commercial"); }
