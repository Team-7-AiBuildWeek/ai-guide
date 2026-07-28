/**
 * Pronunciation lexicon.
 *
 * Slovak place names mangled by an English-trained TTS voice is the fastest
 * way to make this app feel cheap, so substitutions are applied to every
 * string before it reaches any vendor.
 *
 * Two mechanisms, because vendors differ:
 *  - `PHONETIC` respells the word for voices that only take plain text.
 *  - `SSML_PHONEME` gives IPA for voices that accept SSML.
 *
 * These are starting guesses. They need a native speaker's ear before launch.
 */

export const PHONETIC: Record<string, string> = {
  "Michalská brána": "Mihalskaa braana",
  Michalská: "Mihalskaa",
  "Hlavné námestie": "Hlavnair naamestye",
  "Primaciálny palác": "Primatsiaalny palaats",
  "Stará radnica": "Staraa radnitsa",
  "Modrý kostol": "Modree kostol",
  "Bratislavský hrad": "Bratislavskee hrad",
  Bratislava: "Bratislava",
  Ventúrska: "Ventoorska",
  Laurinská: "Laurinskaa",
  Petržalka: "Petrzhalka",
  Pressburg: "Pressburg",
  Zsolnay: "Zholnoy",
  Pécs: "Paych",
  "Ödön Lechner": "Erdern Lehkner",
};

export const SSML_PHONEME: Record<string, string> = {
  "Michalská brána": "ˈmixalskaː ˈbraːna",
  "Hlavné námestie": "ˈɦlaʋneː ˈnaːmestje",
  "Primaciálny palác": "ˈprimat͡sjaːlni ˈpalaːt͡s",
  "Stará radnica": "ˈstaraː ˈradɲit͡sa",
  "Modrý kostol": "ˈmɔdriː ˈkɔstɔl",
  "Bratislavský hrad": "ˈbracislaʊ̯skiː ˈɦrat",
  Petržalka: "ˈpetr̩ʒalka",
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest keys first, so "Michalská brána" wins over "Michalská". */
function orderedKeys(map: Record<string, string>): string[] {
  return Object.keys(map).sort((a, b) => b.length - a.length);
}

/** Respell known names for a plain-text voice. */
export function applyLexicon(text: string, map: Record<string, string> = PHONETIC): string {
  let out = text;
  for (const key of orderedKeys(map)) {
    out = out.replace(new RegExp(escapeRegExp(key), "g"), map[key]);
  }
  return out;
}

/** Wrap known names in <phoneme> tags for a voice that speaks SSML. */
export function toSSML(text: string, map: Record<string, string> = SSML_PHONEME): string {
  let out = escapeXml(text);
  for (const key of orderedKeys(map)) {
    const ipa = map[key];
    out = out.replace(
      new RegExp(escapeRegExp(escapeXml(key)), "g"),
      `<phoneme alphabet="ipa" ph="${ipa}">${escapeXml(key)}</phoneme>`,
    );
  }
  return `<speak>${out}</speak>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
