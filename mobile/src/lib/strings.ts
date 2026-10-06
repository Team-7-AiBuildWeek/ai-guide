/**
 * The website's English wording (lib/i18n/ui.ts), word for word, so the two
 * read as one product. The website's other interface languages are not here
 * yet; the narration language is still chosen per walk.
 */

const EN = {
  "landing.walkCity": "Walk {city}",
  "landing.walkAnywhere": "Walk any city",
  "landing.pitch": "A guide in your ear, built around what you actually want to see.",
  "landing.build": "Build my tour",
  "landing.chooseCity": "Choose any city",
  "landing.paused": "Your tour, paused",
  "landing.carryOn": "Carry on walking",
  "landing.different": "Build a different tour",
  "landing.stopOf": "Stop {n} of {total}",

  "brief.title": "Build my tour",
  "brief.language": "Language",
  "brief.howLong": "How long",
  "brief.detail": "How much detail",
  "brief.pace": "Pace",
  "brief.interests": "What interests you",
  "brief.personalise": "Personalise more",
  "brief.personaliseHint": "Describe the walk in your own words. It makes the better tour.",
  "brief.personaliseSet": "Your own words are set — they outrank the settings above.",
  "brief.ownWords": "Tell me in your own words",
  "brief.ownWordsHint": "Anything here outranks the settings above. It makes the better tour.",
  "brief.clearAll": "Clear all",
  "brief.plan": "Plan the walk",

  "duration.30": "30 minutes",
  "duration.45": "45 minutes",
  "duration.60": "1 hour",
  "duration.90": "1½ hours",
  "duration.120": "2 hours",
  "duration.180": "3 hours",
  "duration.240": "A whole afternoon",
  "detail.highlights": "Highlights",
  "detail.story": "A story",
  "detail.everything": "In depth",
  "pace.relaxed": "Relaxed",
  "pace.steady": "Steady",
  "pace.cover-ground": "Fast",
  "interest.history": "History",
  "interest.architecture": "Architecture",
  "interest.food": "Food & everyday life",
  "interest.art": "Art",
  "interest.hidden": "Hidden corners",
  "interest.nature": "Nature & parks",
  "interest.music": "Music",
  "interest.literature": "Books & writers",
  "interest.sacred": "Faith & sacred places",
  "interest.royal": "Royalty & power",
  "interest.legends": "Legends & folklore",
  "interest.conflict": "Wars & the darker past",

  "points.title": "Where do you start?",
  "points.city": "City",
  "points.change": "Change",
  "points.choose": "Choose",
  "points.whichCity": "Which city?",
  "points.cancel": "Cancel",
  "points.start": "Starting point",
  "points.end": "End point",
  "points.notSet": "Not set",
  "points.useLocation": "Use my location",
  "points.hereNow": "Where I am now",
  "points.locating": "Locating…",
  "points.clear": "Clear",
  "points.searching": "Searching…",
  "points.addEnd": "Choose where to finish (optional)",
  "points.needStart": "Set a starting point",
  "points.loop": "Finishes where it starts",
  "points.bothSet": "Start and finish set",
  "points.create": "Create the tour",

  "gen.title": "Making your personal tour…",
  "gen.wait": "This takes up to a minute. Keep the screen open.",
  "gen.failed": "That didn’t work.",
  "gen.retry": "Try again",
  "gen.changeDetails": "Change the details",
  "gen.cancel": "Cancel",

  "profile.title": "My profile",
  "profile.built": "Walks built",
  "profile.stops": "Stops",
  "profile.distance": "Distance",
  "profile.past": "Past walks",
  "profile.empty": "Nothing yet. The walks you build are kept here, on this phone.",
  "profile.theStops": "The stops",
  "profile.walkAgain": "Walk it again",
  "profile.walkAgainHint": "The same stops, built again for you.",
  "profile.deleteOne": "Delete this walk",
  "profile.today": "Today",
  "profile.yesterday": "Yesterday",
} as const;

export type UiKey = keyof typeof EN;

export function t(key: UiKey | string, vars?: Record<string, string | number>): string {
  let s: string = (EN as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
