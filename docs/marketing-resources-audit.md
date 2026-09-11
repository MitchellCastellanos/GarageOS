# Public resources and navigation audit

## Content coverage

- `/blog`: three complete articles, each with its own URL and a related practical guide.
- `/guides`: four complete guides covering shop/team setup, booking availability, client/vehicle records and estimate-to-invoice workflow.
- `/help`: links to all four guides and ten expandable questions, including booking, roles, delivery and payment troubleshooting.
- `/demo`: a four-step illustrative walkthrough replacing the unavailable-video placeholder.
- `/integrations`: distinguishes implemented connections requiring configuration (Resend, Twilio and Google Drive) from unavailable payment processing and external calendar sync.
- `/changelog`: factual product/resource overview without invented release dates or launch claims.
- `/features`: clarifies estimate decisions, payment recording, message delivery and service/parts lines.
- `/contact`: adds useful support-request context and a Help Center link; preserves the existing contact address.
- `/about`, `/privacy`, `/terms`: existing populated content retained. Contact/privacy references in legal pages now link to their destinations.
- Social icons have no configured destination in the repository. No social URLs were invented.

Editorial content remains English, matching the existing public subpages. The existing EN/FR navbar and footer dictionary remains in use.

## Navigation

The shared marketing header uses real links to `/`, `/#product`, `/#features` and `/#pricing`. These work from the homepage, resource listings and nested articles. Section offsets account for the sticky header. The footer brand also links home.

Resources opens by click or keyboard and closes on Escape, outside pointer interaction, focus leaving the dropdown, or choosing a destination. Mobile navigation closes when a destination is selected. Shop-branded booking navigation and authenticated workspace navigation retain their own destinations.

## Validation

- Production build passed, including all seven generated article/guide routes.
- ESLint passed for changed TypeScript/TSX files.
- Existing domain tests: 3 passed.
- Browser smoke check: 19 public routes returned 200; footer page destinations returned 200; unknown article returned 404.
- Verified desktop and mobile home-section navigation, shared logo link, Resources keyboard interaction and FAQ expansion.
- No browser page errors or horizontal overflow in the checked desktop/mobile views. Reviewed full-page mobile Blog and desktop Help Center screenshots.
- Global typecheck remains blocked by existing errors in `AppointmentForm.tsx`, `InvoiceForm.tsx` and `src/lib/email.ts`. These files were not modified. The existing Next configuration skips type validation during build, so build success does not imply a clean global typecheck.
