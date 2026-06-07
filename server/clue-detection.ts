export interface TargetClue {
  keyword: string;
  strongVariants: string[];
  weakVariants?: string[];
}

export const TARGET_CLUES: TargetClue[] = [
  {
    keyword: "Déchets plastiques",
    strongVariants: ["déchets plastiques", "dechets plastiques", "pollution plastique", "ordures plastiques", "déchets en plastique", "dechets en plastique"],
    weakVariants: ["déchets", "dechets", "plastique"],
  },
  {
    keyword: "ADN",
    strongVariants: ["adn", "acide désoxyribonucléique", "acide desoxyribonucleique", "double hélice", "double helice", "hélice adn", "helice adn", "génétique", "genetique"],
  },
  {
    keyword: "Traité plastique",
    strongVariants: ["traité plastique", "traite plastique", "traité sur le plastique", "traite sur le plastique", "accord plastique", "convention plastique", "plastic treaty", "plastique treaty"],
  },
  {
    keyword: "Végétation",
    strongVariants: ["végétation", "vegetation", "végétaux", "vegetaux", "algues", "algue", "plantes marines", "végétaux marins", "vegetaux marins", "verdure"],
    weakVariants: ["plantes", "plante"],
  },
  {
    keyword: "Homme",
    strongVariants: ["penseur", "rodin", "sculpture homme", "figure masculine", "personnage masculin"],
    weakVariants: ["homme"],
  },
  {
    keyword: "Femme",
    strongVariants: ["figure féminine", "figure feminine", "personnage féminin", "personnage feminin", "sculpture femme", "terre-mère", "terre mere", "mère nature", "mere nature"],
    weakVariants: ["femme"],
  },
];

export function normalizeClueText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text: string, variant: string): boolean {
  const normalizedVariant = normalizeClueText(variant);
  return (` ${text} `).includes(` ${normalizedVariant} `);
}

function weakVariantIsSupported(text: string, variant: string, clueKeyword: string): boolean {
  if (!containsPhrase(text, variant)) return false;

  const clueSpecificContext: Record<string, string[]> = {
    "Déchets plastiques": ["dechet", "dechets", "ordure", "ordures", "bouteille", "bouteilles", "jouet", "jouets", "tas", "plein de plastique", "plastique autour", "plastique partout"],
    "Végétation": ["sur la tete", "sur le visage", "autour du visage", "qui pousse", "verdure"],
    "Homme": ["je vois un homme", "personnage", "figure", "assis", "penseur", "sculpture"],
    "Femme": ["je vois une femme", "visage", "tete", "figure", "personnage", "sculpture"],
  };
  return (clueSpecificContext[clueKeyword] || []).some((cue) => containsPhrase(text, cue));
}

export function detectClues(text: string, alreadyFound: string[]): string[] {
  const normalizedText = normalizeClueText(text);
  const found: string[] = [];

  for (const clue of TARGET_CLUES) {
    if (alreadyFound.includes(clue.keyword)) continue;

    const strongMatch = clue.strongVariants.some((variant) => containsPhrase(normalizedText, variant));
    const weakMatch = clue.weakVariants?.some((variant) => weakVariantIsSupported(normalizedText, variant, clue.keyword)) ?? false;
    if (strongMatch || weakMatch) found.push(clue.keyword);
  }

  return found;
}
