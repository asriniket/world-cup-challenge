const aliases: Record<string, string> = {
  argentina: "argentina",
  australia: "australia",
  austria: "austria",
  belgium: "belgium",
  "bosnia and herzegovina": "bosnia",
  "bosnia herzegovina": "bosnia",
  bosnia: "bosnia",
  brazil: "brazil",
  canada: "canada",
  "cabo verde": "cabo-verde",
  "cape verde": "cabo-verde",
  colombia: "colombia",
  "congo dr": "congo-dr",
  "democratic republic of the congo": "congo-dr",
  "dr congo": "congo-dr",
  "cote divoire": "cote-divoire",
  "cote d ivoire": "cote-divoire",
  "cote d'ivoire": "cote-divoire",
  "côte divoire": "cote-divoire",
  "côte d'ivoire": "cote-divoire",
  "ivory coast": "cote-divoire",
  croatia: "croatia",
  curacao: "curacao",
  curaçao: "curacao",
  czechia: "czechia",
  "czech republic": "czechia",
  ecuador: "ecuador",
  egypt: "egypt",
  england: "england",
  france: "france",
  germany: "germany",
  ghana: "ghana",
  haiti: "haiti",
  iran: "iran",
  "ir iran": "iran",
  iraq: "iraq",
  japan: "japan",
  jordan: "jordan",
  "korea republic": "korea-republic",
  "south korea": "korea-republic",
  mexico: "mexico",
  morocco: "morocco",
  netherlands: "netherlands",
  "new zealand": "new-zealand",
  norway: "norway",
  panama: "panama",
  paraguay: "paraguay",
  portugal: "portugal",
  qatar: "qatar",
  "saudi arabia": "saudi-arabia",
  scotland: "scotland",
  senegal: "senegal",
  "south africa": "south-africa",
  spain: "spain",
  sweden: "sweden",
  switzerland: "switzerland",
  tunisia: "tunisia",
  turkiye: "turkiye",
  turkey: "turkiye",
  türkiye: "turkiye",
  "united states": "united-states",
  usa: "united-states",
  "u.s.": "united-states",
  uruguay: "uruguay",
  uzbekistan: "uzbekistan",
};

export function normalizeTeamName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function teamIdFromName(name?: string | null) {
  if (!name) return undefined;
  return aliases[normalizeTeamName(name)];
}
