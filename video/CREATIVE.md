# Creative production notes

**Idea**: show one connected shop, honestly. Real Garage Laurent screens do the persuading; motion only directs attention (push-ins to the schedule, the findings, the estimate lines, the payment record). Dark navy canvas, brand blue accents, restrained ease-out motion, 12-frame cross-fades between scenes.

**Structure (60 s, 30 fps; seconds editable in `src/config/timing.ts`)**

| # | Scene | Time | Why |
| --- | --- | --- | --- |
| 1 | Hook | 0–6.5 | Five pain areas (appointments, estimates, work orders, invoices, customers) converge into the real dashboard: "one connected system" before any feature. |
| 2 | Appointments & booking | 6.5–16 | Dashboard → agenda → the shop-branded booking page on desktop and phone: the customer-facing payoff. |
| 3 | Inspections & estimates | 16–29 | Two pairs (inspection admin + customer report; estimate editor + customer estimate). Shown as separate sample visits, never as one job. |
| 4 | Work orders & invoicing | 29–43 | Work order → invoice PDF + invoice email → payment record, ending on the shop's own record of payment. |
| 5 | Retention | 43–53 | Portal → maintenance reminder → campaign editor. |
| 6 | Closing | 53–60 | Screens collapse into the logo; headline, CTA and garage-os.ca stay ~3.5 s; sample-shop disclosure. |

**Teaser (15 s)**: hook 3 s, booking 3.5 s, inspection/estimate 3 s, invoice 2.5 s, CTA 3 s. One hero composition per beat, larger type, faster entrances; its own narration (`teaserNarration`).

**Bilingual**: FR is written for Québec, not translated word for word; layouts were checked with the longer FR headlines. Both locales use their own captures. Copy and narration sit side by side in `src/locales`.

**Out of scope here**: final voice, music, any generated cinematic footage, tracking and email delivery.
