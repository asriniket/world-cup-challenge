export type Confederation = "AFC" | "CAF" | "CONCACAF" | "CONMEBOL" | "OFC" | "UEFA";

export type Team = {
  id: string;
  name: string;
  group: string;
  flag: string;
  confederation: Confederation;
  tier: 1 | 2 | 3 | 4;
  power: number;
  attack: number;
  defense: number;
  disciplineRisk: number;
  fifaRank: number;
};

export const teams: Team[] = [
  { id: "mexico", name: "Mexico", group: "A", flag: "mx", confederation: "CONCACAF", tier: 2, power: 72, attack: 68, defense: 70, disciplineRisk: 50, fifaRank: 15 },
  { id: "south-africa", name: "South Africa", group: "A", flag: "za", confederation: "CAF", tier: 4, power: 48, attack: 43, defense: 48, disciplineRisk: 46, fifaRank: 61 },
  { id: "korea-republic", name: "Korea Republic", group: "A", flag: "kr", confederation: "AFC", tier: 3, power: 62, attack: 61, defense: 60, disciplineRisk: 38, fifaRank: 22 },
  { id: "czechia", name: "Czechia", group: "A", flag: "cz", confederation: "UEFA", tier: 3, power: 58, attack: 55, defense: 61, disciplineRisk: 42, fifaRank: 44 },
  { id: "canada", name: "Canada", group: "B", flag: "ca", confederation: "CONCACAF", tier: 3, power: 57, attack: 58, defense: 52, disciplineRisk: 43, fifaRank: 31 },
  { id: "bosnia", name: "Bosnia and Herzegovina", group: "B", flag: "ba", confederation: "UEFA", tier: 4, power: 51, attack: 50, defense: 49, disciplineRisk: 49, fifaRank: 40 },
  { id: "qatar", name: "Qatar", group: "B", flag: "qa", confederation: "AFC", tier: 4, power: 43, attack: 42, defense: 42, disciplineRisk: 40, fifaRank: 52 },
  { id: "switzerland", name: "Switzerland", group: "B", flag: "ch", confederation: "UEFA", tier: 2, power: 71, attack: 66, defense: 73, disciplineRisk: 34, fifaRank: 14 },
  { id: "brazil", name: "Brazil", group: "C", flag: "br", confederation: "CONMEBOL", tier: 1, power: 90, attack: 92, defense: 84, disciplineRisk: 45, fifaRank: 6 },
  { id: "morocco", name: "Morocco", group: "C", flag: "ma", confederation: "CAF", tier: 2, power: 75, attack: 70, defense: 78, disciplineRisk: 38, fifaRank: 11 },
  { id: "haiti", name: "Haiti", group: "C", flag: "ht", confederation: "CONCACAF", tier: 4, power: 39, attack: 38, defense: 36, disciplineRisk: 54, fifaRank: 84 },
  { id: "scotland", name: "Scotland", group: "C", flag: "gb-sct", confederation: "UEFA", tier: 3, power: 56, attack: 53, defense: 56, disciplineRisk: 52, fifaRank: 39 },
  { id: "united-states", name: "United States", group: "D", flag: "us", confederation: "CONCACAF", tier: 2, power: 74, attack: 75, defense: 68, disciplineRisk: 41, fifaRank: 16 },
  { id: "paraguay", name: "Paraguay", group: "D", flag: "py", confederation: "CONMEBOL", tier: 3, power: 57, attack: 51, defense: 61, disciplineRisk: 57, fifaRank: 48 },
  { id: "australia", name: "Australia", group: "D", flag: "au", confederation: "AFC", tier: 3, power: 59, attack: 55, defense: 59, disciplineRisk: 47, fifaRank: 27 },
  { id: "turkiye", name: "Türkiye", group: "D", flag: "tr", confederation: "UEFA", tier: 2, power: 68, attack: 71, defense: 62, disciplineRisk: 55, fifaRank: 25 },
  { id: "cote-divoire", name: "Côte d'Ivoire", group: "E", flag: "ci", confederation: "CAF", tier: 3, power: 61, attack: 63, defense: 57, disciplineRisk: 48, fifaRank: 34 },
  { id: "ecuador", name: "Ecuador", group: "E", flag: "ec", confederation: "CONMEBOL", tier: 3, power: 64, attack: 59, defense: 67, disciplineRisk: 45, fifaRank: 24 },
  { id: "germany", name: "Germany", group: "E", flag: "de", confederation: "UEFA", tier: 1, power: 84, attack: 83, defense: 80, disciplineRisk: 34, fifaRank: 9 },
  { id: "curacao", name: "Curaçao", group: "E", flag: "cw", confederation: "CONCACAF", tier: 4, power: 36, attack: 35, defense: 35, disciplineRisk: 44, fifaRank: 82 },
  { id: "netherlands", name: "Netherlands", group: "F", flag: "nl", confederation: "UEFA", tier: 1, power: 83, attack: 80, defense: 82, disciplineRisk: 35, fifaRank: 7 },
  { id: "japan", name: "Japan", group: "F", flag: "jp", confederation: "AFC", tier: 2, power: 73, attack: 72, defense: 68, disciplineRisk: 28, fifaRank: 17 },
  { id: "sweden", name: "Sweden", group: "F", flag: "se", confederation: "UEFA", tier: 3, power: 60, attack: 58, defense: 61, disciplineRisk: 37, fifaRank: 28 },
  { id: "tunisia", name: "Tunisia", group: "F", flag: "tn", confederation: "CAF", tier: 4, power: 50, attack: 45, defense: 54, disciplineRisk: 51, fifaRank: 35 },
  { id: "iran", name: "IR Iran", group: "G", flag: "ir", confederation: "AFC", tier: 3, power: 60, attack: 58, defense: 57, disciplineRisk: 50, fifaRank: 20 },
  { id: "new-zealand", name: "New Zealand", group: "G", flag: "nz", confederation: "OFC", tier: 4, power: 37, attack: 34, defense: 39, disciplineRisk: 35, fifaRank: 85 },
  { id: "belgium", name: "Belgium", group: "G", flag: "be", confederation: "UEFA", tier: 2, power: 77, attack: 78, defense: 71, disciplineRisk: 36, fifaRank: 8 },
  { id: "egypt", name: "Egypt", group: "G", flag: "eg", confederation: "CAF", tier: 3, power: 62, attack: 64, defense: 56, disciplineRisk: 44, fifaRank: 30 },
  { id: "saudi-arabia", name: "Saudi Arabia", group: "H", flag: "sa", confederation: "AFC", tier: 4, power: 47, attack: 44, defense: 46, disciplineRisk: 48, fifaRank: 59 },
  { id: "uruguay", name: "Uruguay", group: "H", flag: "uy", confederation: "CONMEBOL", tier: 2, power: 78, attack: 76, defense: 76, disciplineRisk: 58, fifaRank: 12 },
  { id: "spain", name: "Spain", group: "H", flag: "es", confederation: "UEFA", tier: 1, power: 88, attack: 86, defense: 85, disciplineRisk: 30, fifaRank: 2 },
  { id: "cabo-verde", name: "Cabo Verde", group: "H", flag: "cv", confederation: "CAF", tier: 4, power: 41, attack: 39, defense: 42, disciplineRisk: 43, fifaRank: 68 },
  { id: "france", name: "France", group: "I", flag: "fr", confederation: "UEFA", tier: 1, power: 92, attack: 91, defense: 86, disciplineRisk: 33, fifaRank: 3 },
  { id: "senegal", name: "Senegal", group: "I", flag: "sn", confederation: "CAF", tier: 2, power: 72, attack: 68, defense: 72, disciplineRisk: 42, fifaRank: 18 },
  { id: "iraq", name: "Iraq", group: "I", flag: "iq", confederation: "AFC", tier: 4, power: 45, attack: 43, defense: 44, disciplineRisk: 56, fifaRank: 63 },
  { id: "norway", name: "Norway", group: "I", flag: "no", confederation: "UEFA", tier: 2, power: 70, attack: 78, defense: 62, disciplineRisk: 31, fifaRank: 23 },
  { id: "argentina", name: "Argentina", group: "J", flag: "ar", confederation: "CONMEBOL", tier: 1, power: 91, attack: 89, defense: 85, disciplineRisk: 40, fifaRank: 1 },
  { id: "algeria", name: "Algeria", group: "J", flag: "dz", confederation: "CAF", tier: 3, power: 61, attack: 60, defense: 57, disciplineRisk: 50, fifaRank: 33 },
  { id: "austria", name: "Austria", group: "J", flag: "at", confederation: "UEFA", tier: 3, power: 65, attack: 63, defense: 64, disciplineRisk: 39, fifaRank: 21 },
  { id: "jordan", name: "Jordan", group: "J", flag: "jo", confederation: "AFC", tier: 4, power: 40, attack: 39, defense: 40, disciplineRisk: 47, fifaRank: 70 },
  { id: "portugal", name: "Portugal", group: "K", flag: "pt", confederation: "UEFA", tier: 1, power: 86, attack: 87, defense: 80, disciplineRisk: 38, fifaRank: 5 },
  { id: "congo-dr", name: "Congo DR", group: "K", flag: "cd", confederation: "CAF", tier: 4, power: 48, attack: 47, defense: 46, disciplineRisk: 53, fifaRank: 55 },
  { id: "uzbekistan", name: "Uzbekistan", group: "K", flag: "uz", confederation: "AFC", tier: 4, power: 44, attack: 42, defense: 45, disciplineRisk: 39, fifaRank: 58 },
  { id: "colombia", name: "Colombia", group: "K", flag: "co", confederation: "CONMEBOL", tier: 2, power: 76, attack: 77, defense: 70, disciplineRisk: 52, fifaRank: 13 },
  { id: "ghana", name: "Ghana", group: "L", flag: "gh", confederation: "CAF", tier: 3, power: 59, attack: 58, defense: 55, disciplineRisk: 49, fifaRank: 37 },
  { id: "panama", name: "Panama", group: "L", flag: "pa", confederation: "CONCACAF", tier: 4, power: 46, attack: 43, defense: 45, disciplineRisk: 55, fifaRank: 53 },
  { id: "england", name: "England", group: "L", flag: "gb-eng", confederation: "UEFA", tier: 1, power: 89, attack: 88, defense: 84, disciplineRisk: 32, fifaRank: 4 },
  { id: "croatia", name: "Croatia", group: "L", flag: "hr", confederation: "UEFA", tier: 2, power: 74, attack: 70, defense: 73, disciplineRisk: 36, fifaRank: 10 },
];
