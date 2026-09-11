/**
 * GarageOS product mark: a rounded blue square with a stylized gauge/"G"
 * glyph — ties the brand to a dashboard without being literally a car part.
 */
export function GarageOSLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="32" height="32" rx="9" fill="var(--brand-blue)" />
      <path
        d="M20.8 11.2A6.4 6.4 0 1 0 16 22.4h3.2"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M20.8 18v-3.4h-3.4"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
