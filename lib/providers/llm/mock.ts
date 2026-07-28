/**
 * Mock LLM. No key, no network, deterministic.
 *
 * The scripts are real enough to click through and to test the player with —
 * six genuine Bratislava old-town stops with plausible coordinates. They are
 * not the finished content; that comes from a real model later.
 */

import type { LLMProvider } from "./index";
import type { Stop, TourPlan, TourRequest } from "@/lib/providers/types";

type Seed = Omit<Stop, "scriptShort" | "scriptFull"> & { short: string; full: string };

const SEEDS: Seed[] = [
  {
    id: "michalska-brana",
    name: "Michalská brána",
    lat: 48.1447,
    lng: 17.1063,
    walkingCueToHere: "Walk up Michalská with the tower ahead of you. Stop under the arch.",
    short:
      "You are standing under the last of four medieval gates. The other three are gone. This one survived because it was useful — the tower kept working as a lookout long after the walls came down.",
    full:
      "You are standing under the last of four medieval gates into the old town. The other three were pulled down when the walls came down; this one survived because it kept being useful. Look up: the tower is taller than it needs to be for a gate, because it doubled as a lookout. The statue at the top is Saint Michael, sword drawn, standing on a dragon. Under your feet there is a brass compass set into the road, marking the distance to a list of cities, which is the sort of thing a town does when it wants you to know it is connected to the world. Take a moment before you walk through. This is the narrow point everyone entering the town had to pass, which meant it was the point where the town could decide who came in.",
  },
  {
    id: "hlavne-namestie",
    name: "Hlavné námestie",
    lat: 48.1431,
    lng: 17.1082,
    walkingCueToHere: "Carry on down Michalská and Ventúrska. The street opens into the main square.",
    short:
      "The main square. Look for the cannonball in the town hall wall — left there from Napoleon's artillery in 1809, and left there deliberately.",
    full:
      "The main square, and the town hall on your left with a tower you can climb. Find the cannonball lodged in the wall. It was fired by Napoleon's artillery in 1809, and it was left in place on purpose — a town that gets shelled and then leaves the evidence up is making a point. The square has been the market, the courtroom and the execution ground at various times, which was normal: the places where a town did business and the places where it did violence were the same places. The fountain in the middle is Roland's fountain, and Roland is the figure who signals that this is a free royal town with the right to hold markets and hang people.",
  },
  {
    id: "primacialny-palac",
    name: "Primaciálny palác",
    lat: 48.1428,
    lng: 17.109,
    walkingCueToHere: "Leave the square through the passage in the corner. The pink palace is straight ahead.",
    short:
      "The pink palace. The Peace of Pressburg was signed in the hall upstairs in 1805, six weeks after Austerlitz, and it redrew the map of central Europe.",
    full:
      "The pink palace, and the room upstairs is called the Hall of Mirrors. In December 1805, six weeks after Napoleon destroyed the Austrian and Russian armies at Austerlitz, the Peace of Pressburg was signed in that hall. Austria lost Venice and the Tyrol in an afternoon. The palace also holds a set of English tapestries that nobody knew about until 1903, when workers doing repairs found them under wallpaper. They tell the story of Hero and Leander, they were woven in the early 1600s, and they had been hidden so thoroughly that no record of them survived. Look at the top of the building: that iron hat is a cardinal's hat, cast in iron, and it belongs to the archbishop who built the place.",
  },
  {
    id: "stara-radnica",
    name: "Stará radnica",
    lat: 48.1435,
    lng: 17.1079,
    walkingCueToHere: "Come back through the passage into the square and stand facing the tower.",
    short:
      "The old town hall is not one building. It is three houses joined together over four hundred years, and you can see the joins.",
    full:
      "The old town hall is not one building, and once you know that you cannot stop seeing it. It is three medieval houses that the town bought one at a time and knocked together over about four centuries. The joins are visible in the roofline and in the windows, which do not line up because they were never meant to. The tower is the oldest part. Inside the courtyard the arcades are Renaissance, added when the town had money and wanted to look like it. The town used this building to run itself for six hundred years, which is a long institutional memory for a place this size, and the awkward assembled shape of it is the honest record of a town solving one problem at a time.",
  },
  {
    id: "modry-kostol",
    name: "Modrý kostol",
    lat: 48.1441,
    lng: 17.1152,
    walkingCueToHere: "Head east along Laurinská and Bezručova. It is about eight minutes. You will see the blue.",
    short:
      "A church that is entirely blue — walls, roof tiles, railings. It was finished in 1913 and it looks like nothing else in the city.",
    full:
      "A church that is entirely blue: the walls, the roof tiles, the railings, the mosaic. It was finished in 1913, designed by Ödön Lechner, who spent his career trying to invent a Hungarian national architecture out of folk ornament and glazed ceramic. This is the last thing he built. The blue is not paint — it is glazed Zsolnay tiles from Pécs, which is why it has not faded in a century. Go inside if it is open. The interior carries the same colour and the same curved, soft shapes, and the effect is closer to a cake than a cathedral, which the architect was told at the time. He did it anyway. Standing here it is worth remembering it went up in the last full year before the war that ended the empire it was meant to celebrate.",
  },
  {
    id: "bratislavsky-hrad",
    name: "Bratislavský hrad",
    lat: 48.1421,
    lng: 17.1002,
    walkingCueToHere: "Walk west and uphill. It is a climb of about fifteen minutes. Take your time.",
    short:
      "The castle burned down in 1811 and stood as a ruin for a hundred and forty years. What you are looking at is a rebuild.",
    full:
      "The castle burned in 1811 — soldiers garrisoned there, a fire that got away from them — and then it stood as a roofless ruin for a hundred and forty years. People painted it as a ruin. It became the thing on the hill that had always been a ruin. The rebuild only started in the 1950s, and the argument about whether to do it at all lasted years. What you are looking at is therefore a reconstruction, which some people hold against it. Walk to the terrace on the south side. From there you can see the Danube, the bridge, the tower blocks of Petržalka across the water, and on a clear day into Austria and Hungary. Three countries from one wall. That view is the reason there has been a fort on this rock since the Bronze Age.",
  },
];

/** Interests and duration change which stops appear — the same shape as the real thing. */
function selectStops(req: TourRequest): Seed[] {
  const target = req.durationMinutes <= 30 ? 3 : req.durationMinutes <= 45 ? 4 : req.durationMinutes <= 60 ? 5 : 6;
  return SEEDS.slice(0, target);
}

export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";

  async generateTourPlan(input: TourRequest): Promise<TourPlan> {
    const chosen = selectStops(input);
    return {
      title: "Bratislava old town on foot",
      summary: `A ${input.durationMinutes}-minute walk through the old town, ${chosen.length} stops. Put the phone in your pocket and follow the voice.`,
      stops: chosen.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        walkingCueToHere: s.walkingCueToHere,
        scriptShort: s.short,
        scriptFull: s.full,
      })),
    };
  }
}
