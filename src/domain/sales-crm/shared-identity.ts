// Identifiers that do NOT identify one business (pure). A website domain, a phone number or a brand name shared by many unrelated places is a *brand/directory*
// relationship, never proof of identity: matching on them linked "Dad's Auto Repair Shop" (website yp.ca/bus/…) to an unrelated Québec body shop, and a NAPA AUTOPRO
// franchise in Edmonton to a different NAPA AUTOPRO franchisee in Québec (same napaautopro.com). The duplicate classifier ignores these identifiers.

/** Directories, aggregators, map/search/review/listing sites and website-builder platforms where many unrelated businesses share one host. */
export const DIRECTORY_DOMAINS = [
  "yp.ca", "yellowpages.ca", "yellowpages.com", "pagesjaunes.ca", "canpages.ca", "411.ca", "cylex.ca", "cylex-canada.ca", "hotfrog.ca", "n49.ca", "goldbook.ca", "opendi.ca", "brownbook.net",
  "yelp.com", "yelp.ca", "bbb.org", "mapquest.com", "foursquare.com", "tripadvisor.com", "tripadvisor.ca", "waze.com", "bing.com", "google.com", "google.ca", "goo.gl", "g.page", "maps.app.goo.gl",
  "apple.com", "facebook.com", "fb.com", "fb.me", "instagram.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "youtu.be", "pinterest.com", "linktr.ee", "linktree.com",
  "kijiji.ca", "autotrader.ca", "cargurus.ca", "carfax.ca", "carpages.ca", "yellowbook.com", "manta.com", "chamberofcommerce.com", "canada411.ca", "wheree.com", "ca.yelp.com",
  "business.site", "wixsite.com", "wix.com", "square.site", "squarespace.com", "godaddysites.com", "weebly.com", "webnode.com", "jimdosite.com", "sites.google.com", "carrd.co", "mystrikingly.com",
] as const;

/** Franchisors / banners / national or regional chains whose corporate or store-locator domain is shared by independent locations. */
export const BANNER_DOMAINS = [
  "napaautopro.com", "napacanada.com", "napaonline.com", "oktire.com", "oktire.ca", "okpneus.com", "canadiantire.ca", "fountaintire.com", "kaltire.com", "kaltire.ca", "midas.com", "midas.ca",
  "speedy.ca", "speedyautoservice.com", "carstar.ca", "carstar.com", "fixauto.com", "fixauto.ca", "mrlube.com", "mrlube.ca", "jiffylube.com", "jiffylube.ca", "greatcanadianoilchange.com",
  "monro.com", "meineke.com", "meineke.ca", "uniglass.ca", "lebeau.ca", "vitroplus.ca", "novusglass.ca", "belron.com", "gerber.ca", "gerbercollision.ca", "boydgroup.com", "boyd.ca",
  "goodyear.ca", "firestonecomplete.ca", "firestone.com", "michelin.ca", "pneusexpert.com", "tirecraft.com", "tirecraft.ca", "integratire.com", "integratire.ca", "pneuslarose.com", "toyotires.ca",
  "mrtire.ca", "pepboys.com", "valvoline.com", "valvolineexpresscare.com", "mightyautoparts.com", "partsource.ca", "carquest.ca", "carquest.com", "uapinc.com", "unipro.ca", "bumper2bumper.com",
  "autopro.ca", "ac-delco.ca", "acdelco.com", "bosch.ca", "boschcarservice.com", "ici-pneus.ca", "icipneus.ca", "ma-voiture.ca", "kia.ca", "toyota.ca", "ford.ca", "gm.ca", "chevrolet.ca",
  "honda.ca", "hyundaicanada.com", "nissan.ca", "mazda.ca", "subaru.ca", "vw.ca", "dodge.ca", "ramtrucks.ca", "jeep.ca", "buick.ca", "gmc.ca", "cadillac.ca", "lexus.ca", "bmw.ca", "mercedes-benz.ca",
] as const;

const matches = (host: string, list: readonly string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

/** True when the host is a directory/aggregator/site-builder platform or a franchise/banner domain: it can never identify one business. */
export function isSharedIdentityDomain(domain: string | null | undefined): boolean {
  const h = (domain ?? "").toLowerCase().replace(/^www\./, "");
  return !!h && (matches(h, DIRECTORY_DOMAINS) || matches(h, BANNER_DOMAINS));
}

/** North-American toll-free prefixes: one call-centre number serves many locations. 10 digits, no leading 1 (the shape produced by `phoneDigits`). */
export function isTollFreeDigits(digits: string | null | undefined): boolean {
  return !!digits && /^(800|833|844|855|866|877|888)\d{7}$/.test(digits);
}

/** Banner / franchise names ("NAPA AUTOPRO", "OK Tire", "Canadian Tire"…): many unrelated independent locations carry the same name, so name + city + one other
 *  loosely-shared identifier is NOT enough to say two records are the same place (an exact physical address still is). Matches accent-stripped, lower-cased names. */
export const BANNER_NAME = /\b(napa( ?auto ?pro)?|ok ?tire|ok pneus|canadian tire|pneus? ?canadian ?tire|fountain tire|kal ?tire|midas|speedy|monro|meineke|carstar|fix auto|jiffy lube|mr\.? lube|valvoline|great canadian oil change|uniglass|lebeau|vitro ?plus|novus|tirecraft|integra tire|ici pneus?|mr\.? tire|pep boys|firestone|goodyear|boyd autobody|gerber|bosch car service|mister transmission|aamco|cottman|precision tune)\b/;
export const isBannerName = (nameNormalized: string | null | undefined) => BANNER_NAME.test((nameNormalized ?? "").toLowerCase());
