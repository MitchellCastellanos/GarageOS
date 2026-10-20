// Inline SVG icons. Always decorative (aria-hidden): every control that shows one also carries visible or screen-reader text.
import type { ReactNode } from "react";

function Svg({ children, className = "size-4" }: { children: ReactNode; className?: string }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>{children}</svg>;
}
export const PhoneIcon = (p: { className?: string }) => <Svg {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></Svg>;
export const HangUpIcon = (p: { className?: string }) => <Svg {...p}><path d="M3 15.5c5-4.7 13-4.7 18 0l-2.2 2.2a1.5 1.5 0 0 1-2 .1l-1.9-1.5a1.5 1.5 0 0 1-.5-1.4l.2-1.3a11 11 0 0 0-5.2 0l.2 1.3a1.5 1.5 0 0 1-.5 1.4L7.2 17.8a1.5 1.5 0 0 1-2-.1z" /></Svg>;
export const MicIcon = (p: { className?: string }) => <Svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10a7 7 0 0 1-14 0M12 17v5" /></Svg>;
export const MicOffIcon = (p: { className?: string }) => <Svg {...p}><path d="m2 2 20 20M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6M19 10a7 7 0 0 1-1.2 3.9M5 10a7 7 0 0 0 10.6 6M12 17v5" /></Svg>;
export const ExpandIcon = (p: { className?: string }) => <Svg {...p}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Svg>;
export const CompactIcon = (p: { className?: string }) => <Svg {...p}><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></Svg>;
export const MinimizeIcon = (p: { className?: string }) => <Svg {...p}><path d="M5 19h14" /></Svg>;
export const CopyIcon = (p: { className?: string }) => <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Svg>;
export const AlertIcon = (p: { className?: string }) => <Svg {...p}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></Svg>;
export const DotIcon = ({ className = "size-2.5" }: { className?: string }) => <svg aria-hidden="true" focusable="false" viewBox="0 0 10 10" className={`shrink-0 ${className}`}><circle cx="5" cy="5" r="5" fill="currentColor" /></svg>;
export const PauseIcon = (p: { className?: string }) => <Svg {...p}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></Svg>;
