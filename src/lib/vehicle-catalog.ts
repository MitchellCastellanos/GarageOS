/**
 * Marcas y modelos más comunes en el mercado canadiense/québécois.
 * No pretende ser exhaustivo — cubre lo que un taller de barrio ve la
 * mayoría del tiempo. Los nombres de modelo no se traducen (son nombres
 * propios), por eso este catálogo es independiente del idioma del sitio.
 */
export const VEHICLE_MAKES = [
  "Toyota",
  "Honda",
  "Ford",
  "Chevrolet",
  "Nissan",
  "Hyundai",
  "Kia",
  "Mazda",
  "Subaru",
  "Volkswagen",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Jeep",
  "Ram",
  "GMC",
  "Dodge",
  "Chrysler",
  "Volvo",
  "Lexus",
  "Acura",
  "Infiniti",
  "Mitsubishi",
  "Buick",
  "Cadillac",
  "Lincoln",
  "Mini",
  "Tesla",
  "Genesis",
  "Fiat",
] as const;

export const VEHICLE_MODELS: Record<string, string[]> = {
  Toyota: ["Corolla", "Camry", "RAV4", "Highlander", "Tacoma", "Tundra", "Sienna", "Prius", "4Runner"],
  Honda: ["Civic", "Accord", "CR-V", "Pilot", "HR-V", "Odyssey", "Ridgeline", "Fit"],
  Ford: ["F-150", "Escape", "Explorer", "Edge", "Mustang", "Focus", "Fusion", "Ranger", "Bronco"],
  Chevrolet: ["Silverado", "Equinox", "Malibu", "Cruze", "Traverse", "Tahoe", "Colorado", "Camaro"],
  Nissan: ["Sentra", "Altima", "Rogue", "Murano", "Pathfinder", "Frontier", "Versa", "Maxima"],
  Hyundai: ["Elantra", "Sonata", "Tucson", "Santa Fe", "Kona", "Accent", "Venue", "Palisade"],
  Kia: ["Forte", "Optima", "Sportage", "Sorento", "Soul", "Rio", "Telluride", "Seltos"],
  Mazda: ["Mazda3", "Mazda6", "CX-5", "CX-30", "CX-9", "MX-5"],
  Subaru: ["Impreza", "Outback", "Forester", "Crosstrek", "Legacy", "Ascent", "WRX"],
  Volkswagen: ["Jetta", "Golf", "Tiguan", "Atlas", "Passat", "Beetle"],
  BMW: ["Série 3", "Série 5", "X1", "X3", "X5", "Série 1"],
  "Mercedes-Benz": ["Classe C", "Classe E", "GLC", "GLE", "Classe A"],
  Audi: ["A3", "A4", "Q3", "Q5", "A6"],
  Jeep: ["Wrangler", "Grand Cherokee", "Cherokee", "Compass", "Renegade", "Gladiator"],
  Ram: ["1500", "2500", "ProMaster"],
  GMC: ["Sierra", "Terrain", "Acadia", "Yukon", "Canyon"],
  Dodge: ["Charger", "Challenger", "Durango", "Journey", "Grand Caravan"],
  Chrysler: ["300", "Pacifica", "Voyager"],
  Volvo: ["XC60", "XC90", "S60", "XC40"],
  Lexus: ["RX", "ES", "NX", "IS", "GX"],
  Acura: ["MDX", "RDX", "TLX", "ILX"],
  Infiniti: ["QX50", "QX60", "Q50"],
  Mitsubishi: ["Outlander", "RVR", "Eclipse Cross", "Mirage"],
  Buick: ["Encore", "Enclave", "Envision"],
  Cadillac: ["Escalade", "XT5", "CT5", "XT4"],
  Lincoln: ["Navigator", "Nautilus", "Corsair", "Aviator"],
  Mini: ["Cooper", "Countryman", "Clubman"],
  Tesla: ["Model 3", "Model Y", "Model S", "Model X"],
  Genesis: ["G70", "G80", "GV70", "GV80"],
  Fiat: ["500", "500X"],
};

export const VEHICLE_YEARS: number[] = (() => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear + 1; y >= 1980; y--) years.push(y);
  return years;
})();

/** Sentinel usado en los selects de marca/modelo/servicio para revelar el campo de texto libre. */
export const OTHER_VALUE = "other";
