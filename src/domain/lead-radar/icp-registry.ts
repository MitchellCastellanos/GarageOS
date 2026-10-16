// Discovery ICP registry (pure data). GarageOS Lead Radar targets INDEPENDENT automotive repair businesses only: corporate chains, franchise networks, automotive retail
// chains, parts networks/distributors and dealership groups are permanently outside the discovery ICP. This file is the single, versioned list of those networks.
//
// How to extend (no classifier change needed): add an entry, bump ICP_REGISTRY_VERSION, add a regression case in tests/icp-domain.test.ts.
//  - `aliases`      phrases that are sufficient on their own when they appear in the business NAME (whole words, accent/case/punctuation-insensitive).
//  - `weakAliases`  words that are also ordinary surnames/words ("Midas", "Speedy", "Napa"): they count only when the rest of the name is generic filler
//                   (auto, service, centre, inc…), a store number or the city — never for "Midas Touch Detailing" or "Napa Valley Garage".
//  - `domains`      the franchisor / banner website. A location whose website IS the banner site is a branded location.
// A supplier, certification or affiliation mention ("NAPA parts available", "NAPA Certified", "Bosch Service") is never evidence: the matcher reads only the name and
// the website host, never page content, and a brand that appears only in parentheses or after an affiliation word does not count.
export const ICP_REGISTRY_VERSION = 1;

export const ICP_CATEGORIES = ["FRANCHISE_SERVICE_CHAIN", "RETAIL_CORPORATE", "TIRE_NETWORK", "COLLISION_NETWORK", "GLASS_NETWORK", "PARTS_NETWORK", "DEALERSHIP_GROUP", "DEALERSHIP"] as const;
export type IcpCategory = (typeof ICP_CATEGORIES)[number];

export interface IcpBrand { id: string; category: IcpCategory; aliases: readonly string[]; weakAliases?: readonly string[]; domains?: readonly string[] }
const B = (id: string, category: IcpCategory, aliases: readonly string[], extra: { weak?: readonly string[]; domains?: readonly string[] } = {}): IcpBrand => ({ id, category, aliases, weakAliases: extra.weak, domains: extra.domains });

export const ICP_BRANDS: readonly IcpBrand[] = [
  // Parts networks / distributors (retail stores and branded service locations)
  B("NAPA", "PARTS_NETWORK", ["napa auto parts", "napa autopro", "napa auto pro", "napa pieces d auto", "napa pieces auto", "napa canada", "napa store"], { weak: ["napa"], domains: ["napaautopro.com", "napacanada.com", "napaonline.com", "napa.ca"] }),
  B("BUMPER_TO_BUMPER", "PARTS_NETWORK", ["bumper to bumper", "bumper 2 bumper", "bumper2bumper"], { domains: ["bumper2bumper.com", "bumpertobumper.ca"] }),
  B("PARTSOURCE", "PARTS_NETWORK", ["partsource"], { domains: ["partsource.ca"] }),
  B("CARQUEST", "PARTS_NETWORK", ["carquest"], { domains: ["carquest.ca", "carquest.com"] }),
  B("LORDCO", "PARTS_NETWORK", ["lordco"], { domains: ["lordco.com"] }),
  B("AUTOZONE", "PARTS_NETWORK", ["autozone"], { domains: ["autozone.com", "autozone.ca"] }),
  B("OREILLY", "PARTS_NETWORK", ["o reilly auto parts", "oreilly auto parts"], { domains: ["oreillyauto.com"] }),
  B("ADVANCE_AUTO_PARTS", "PARTS_NETWORK", ["advance auto parts"], { domains: ["advanceautoparts.com"] }),
  B("UAP", "PARTS_NETWORK", ["uap inc", "uni select", "uniselect"], { domains: ["uapinc.com", "uniselect.com"] }),
  B("LKQ", "PARTS_NETWORK", ["lkq"], { domains: ["lkqcorp.com"] }),
  B("FLEETPRIDE", "PARTS_NETWORK", ["fleetpride"], { domains: ["fleetpride.com"] }),
  // Tire networks
  B("OK_TIRE", "TIRE_NETWORK", ["ok tire", "ok pneus"], { domains: ["oktire.com", "oktire.ca", "okpneus.com"] }),
  B("FOUNTAIN_TIRE", "TIRE_NETWORK", ["fountain tire"], { domains: ["fountaintire.com"] }),
  B("KAL_TIRE", "TIRE_NETWORK", ["kal tire", "kaltire"], { domains: ["kaltire.com", "kaltire.ca"] }),
  B("TIRECRAFT", "TIRE_NETWORK", ["tirecraft", "tire craft"], { domains: ["tirecraft.com", "tirecraft.ca"] }),
  B("INTEGRA_TIRE", "TIRE_NETWORK", ["integra tire", "integratire"], { domains: ["integratire.com", "integratire.ca"] }),
  B("ACTIVE_GREEN_ROSS", "TIRE_NETWORK", ["active green ross", "active green and ross"], { domains: ["agrtire.com"] }),
  B("MR_TIRE", "TIRE_NETWORK", ["mr tire"], { domains: ["mrtire.ca"] }),
  B("DISCOUNT_TIRE", "TIRE_NETWORK", ["big o tires", "les schwab", "tire discounters"], { domains: ["discounttire.com", "bigotires.com", "schwab.com"] }),
  B("FIRESTONE", "TIRE_NETWORK", ["firestone complete auto care", "firestone auto care"], { weak: ["firestone"], domains: ["firestonecomplete.ca", "firestone.com"] }),
  B("GOODYEAR", "TIRE_NETWORK", ["goodyear auto service", "goodyear auto care", "goodyear tire"], { weak: ["goodyear"], domains: ["goodyear.ca"] }),
  // Retail / corporate
  B("CANADIAN_TIRE", "RETAIL_CORPORATE", ["canadian tire", "pneus canadian tire", "pneu canadian tire"], { domains: ["canadiantire.ca"] }),
  B("WALMART", "RETAIL_CORPORATE", ["walmart", "wal mart"], { domains: ["walmart.ca", "walmart.com"] }),
  B("COSTCO", "RETAIL_CORPORATE", ["costco"], { domains: ["costco.ca", "costco.com"] }),
  // Franchise service chains
  B("MIDAS", "FRANCHISE_SERVICE_CHAIN", ["midas auto service", "midas auto systems"], { weak: ["midas"], domains: ["midas.com", "midas.ca"] }),
  B("SPEEDY", "FRANCHISE_SERVICE_CHAIN", ["speedy auto service", "speedy glass", "speedy collision"], { weak: ["speedy"], domains: ["speedy.ca", "speedyautoservice.com"] }),
  B("MR_LUBE", "FRANCHISE_SERVICE_CHAIN", ["mr lube"], { domains: ["mrlube.com", "mrlube.ca"] }),
  B("JIFFY_LUBE", "FRANCHISE_SERVICE_CHAIN", ["jiffy lube"], { domains: ["jiffylube.com", "jiffylube.ca"] }),
  B("VALVOLINE", "FRANCHISE_SERVICE_CHAIN", ["valvoline instant oil change", "valvoline express care", "valvoline"], { domains: ["valvoline.com", "valvolineexpresscare.com"] }),
  B("GREAT_CANADIAN_OIL_CHANGE", "FRANCHISE_SERVICE_CHAIN", ["great canadian oil change"], { domains: ["greatcanadianoilchange.com"] }),
  B("SPEEDEE_OIL", "FRANCHISE_SERVICE_CHAIN", ["speedee oil"]),
  B("KROWN", "FRANCHISE_SERVICE_CHAIN", ["krown rust control", "krown"], { domains: ["krown.com"] }),
  B("ZIEBART", "FRANCHISE_SERVICE_CHAIN", ["ziebart"], { domains: ["ziebart.com"] }),
  B("MONRO", "FRANCHISE_SERVICE_CHAIN", ["monro muffler", "monro auto", "monro tire", "monro service"], { weak: ["monro"], domains: ["monro.com"] }),
  B("MEINEKE", "FRANCHISE_SERVICE_CHAIN", ["meineke"], { domains: ["meineke.com", "meineke.ca"] }),
  B("PEP_BOYS", "FRANCHISE_SERVICE_CHAIN", ["pep boys"], { domains: ["pepboys.com"] }),
  B("AAMCO", "FRANCHISE_SERVICE_CHAIN", ["aamco"], { domains: ["aamco.com"] }),
  B("MISTER_TRANSMISSION", "FRANCHISE_SERVICE_CHAIN", ["mister transmission"], { domains: ["mistertransmission.ca", "mistertransmission.com"] }),
  B("COTTMAN", "FRANCHISE_SERVICE_CHAIN", ["cottman transmission"], { domains: ["cottman.com"] }),
  B("PRECISION_TUNE", "FRANCHISE_SERVICE_CHAIN", ["precision tune"], { domains: ["precisiontune.com"] }),
  B("BOSCH_CAR_SERVICE", "FRANCHISE_SERVICE_CHAIN", ["bosch car service"], { domains: ["boschcarservice.com", "bosch.ca"] }),
  // Collision networks
  B("CARSTAR", "COLLISION_NETWORK", ["carstar"], { domains: ["carstar.ca", "carstar.com"] }),
  B("FIX_AUTO", "COLLISION_NETWORK", ["fix auto"], { domains: ["fixauto.com", "fixauto.ca"] }),
  B("BOYD", "COLLISION_NETWORK", ["boyd autobody", "boyd auto body", "boyd group"], { domains: ["boydgroup.com", "boyd.ca"] }),
  B("GERBER", "COLLISION_NETWORK", ["gerber collision", "gerber auto glass"], { domains: ["gerber.ca", "gerbercollision.ca"] }),
  B("CRASH_CHAMPIONS", "COLLISION_NETWORK", ["crash champions"], { domains: ["crashchampions.com"] }),
  B("COLLISION_KING", "COLLISION_NETWORK", ["collision king"]),
  // Glass networks
  B("UNIGLASS", "GLASS_NETWORK", ["uniglass"], { domains: ["uniglass.ca"] }),
  B("LEBEAU", "GLASS_NETWORK", ["lebeau vitres", "lebeau"], { domains: ["lebeau.ca"] }),
  B("VITRO_PLUS", "GLASS_NETWORK", ["vitro plus", "vitroplus"], { domains: ["vitroplus.ca"] }),
  B("NOVUS", "GLASS_NETWORK", ["novus glass", "novus auto glass"], { domains: ["novusglass.ca"] }),
  B("BELRON", "GLASS_NETWORK", ["belron"], { domains: ["belron.com"] }),
  // Dealership groups
  B("AUTOCANADA", "DEALERSHIP_GROUP", ["autocanada"], { domains: ["autocanada.com"] }),
  B("DILAWRI", "DEALERSHIP_GROUP", ["dilawri"], { domains: ["dilawri.com"] }),
  B("APPLEWOOD", "DEALERSHIP_GROUP", ["applewood auto", "applewood nissan", "applewood honda"], { domains: ["applewood.ca"] }),
  B("PFAFF", "DEALERSHIP_GROUP", ["pfaff auto", "pfaff porsche", "pfaff audi"], { domains: ["pfaffauto.com"] }),
  B("JIM_PATTISON", "DEALERSHIP_GROUP", ["jim pattison"], { domains: ["jimpattison.com"] }),
  B("FIRST_TRUCK_CENTRE", "DEALERSHIP_GROUP", ["first truck centre", "first truck center"], { domains: ["firsttruck.ca"] }),
  B("GO_AUTO", "DEALERSHIP_GROUP", ["go auto group"], { domains: ["goauto.ca"] }),
];

/** Manufacturer / OEM dealer-network sites: a location that uses one is a dealership. */
export const DEALER_NETWORK_DOMAINS: readonly string[] = [
  "toyota.ca", "ford.ca", "gm.ca", "chevrolet.ca", "honda.ca", "hyundaicanada.com", "nissan.ca", "mazda.ca", "subaru.ca", "vw.ca", "dodge.ca", "ramtrucks.ca", "jeep.ca", "buick.ca", "gmc.ca",
  "cadillac.ca", "lexus.ca", "bmw.ca", "mercedes-benz.ca", "kia.ca", "audi.ca", "volvocars.com", "acura.ca", "infiniti.ca", "mitsubishi-motors.ca", "chrysler.ca", "lincoln.ca", "genesis.com",
];

/** Taxonomy codes for dealerships (platform category). With no repair wording in the name they are dealerships, not repair shops. */
export const DEALER_CODES: readonly string[] = ["auto_dealer", "used_auto_dealer", "commercial_vehicle_dealer", "truck_dealer", "car_dealer", "new_car_dealer", "used_car_dealer"];

/** Explicit dealership wording in a name. A bare "dealer" is NOT enough ("AMSOIL Dealer", "Ceramic Pro Dealer" resell products) and neither is "auto sales" (an independent used-car lot with a repair bay is a human question, not an exclusion). */
export const DEALER_NAME = /\b(dealership|dealerships|concessionnaire|concessionnaires|auto dealer|car dealer|truck dealer)\b/;

/** Vehicle makes whose franchised dealers sell and service them. Used ONLY by the dealer-name pattern below (never on its own). "Ram", "Mini" and "Genesis" are left out: they are also ordinary words and given names. */
export const DEALER_MAKES: readonly string[] = [
  "toyota", "honda", "ford", "chevrolet", "chevy", "gmc", "buick", "cadillac", "nissan", "hyundai", "kia", "mazda", "subaru", "volkswagen", "vw", "audi", "bmw", "mercedes benz", "mercedes", "volvo",
  "jeep", "dodge", "chrysler", "fiat", "lexus", "acura", "infiniti", "mitsubishi", "porsche", "lincoln", "jaguar", "land rover", "tesla", "kenworth", "peterbilt", "freightliner", "western star", "international trucks",
];
/** Words a dealer's sales/service/body/parts department appends to the make ("CH Nissan - Body Shop", "Southview Acura Parts", "Lacombe Ford Ltd"). */
export const DEALER_DEPARTMENT_WORDS: readonly string[] = ["ltd", "limited", "inc", "motors", "motor", "auto group", "autogroup", "group", "body shop", "collision centre", "collision center", "collision", "service", "services", "service centre", "service center", "parts", "sales", "pre owned", "preowned", "certified"];
