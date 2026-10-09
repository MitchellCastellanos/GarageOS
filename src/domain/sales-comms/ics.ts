// iCalendar (RFC 5545) builder — pure. UTC instants only (no VTIMEZONE needed), CRLF, 75-octet folding, escaping.
export interface IcsInput {
  uid: string;
  /** Bumps on every reschedule so clients replace the older event. */
  sequence: number;
  method: "REQUEST" | "CANCEL";
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  now?: Date;
}

const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** Folds at 75 octets (not characters), never splitting a UTF-8 sequence. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) { out.push(cur); cur = " "; curBytes = 1; limit = 75; }
    cur += ch; curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function buildIcs(i: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GarageOS//Sales Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.method}`,
    "BEGIN:VEVENT",
    `UID:${i.uid}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${fmt(i.now ?? new Date())}`,
    `DTSTART:${fmt(i.startsAt)}`,
    `DTEND:${fmt(i.endsAt)}`,
    `SUMMARY:${escapeIcsText(i.summary)}`,
    `STATUS:${i.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `ORGANIZER;CN=${escapeIcsParam(i.organizer.name)}:mailto:${i.organizer.email}`,
    `ATTENDEE;CN=${escapeIcsParam(i.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${i.method === "CANCEL" ? "DECLINED" : "NEEDS-ACTION"}:mailto:${i.attendee.email}`,
  ];
  if (i.description) lines.push(`DESCRIPTION:${escapeIcsText(i.description)}`);
  if (i.location) lines.push(`LOCATION:${escapeIcsText(i.location)}`);
  if (i.url) lines.push(`URL:${i.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function escapeIcsParam(s: string): string {
  return `"${s.replace(/["\r\n]/g, "")}"`;
}
