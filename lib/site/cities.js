/** Cities and their narrated routes, shared by the site pages.
    Photos are Wikimedia Commons landmark shots. */
// Shared city & route catalogue for the Narro web app pages.
// Static by design — the pages read it directly so they work on any
// static host as well as behind server.js.
export const CITIES = [
  {
    slug: "rome",
    name: "Rome",
    country: "Italy",
    tagline: "Baroque fountains, buried stadiums, and streets that argue back",
    image: "/narro/colosseum.jpeg",
    hours: 14,
    routes: [
      { id: "rome-baroque", name: "Baroque Loop", stops: 12, minutes: 120, blurb: "Trevi, the Pantheon's shadow streets, and the fountain that ate an aqueduct.", free: true },
      { id: "rome-forum", name: "Forum at Dusk", stops: 9, minutes: 90, blurb: "The republic's rubble, told as a courtroom drama.", free: false },
      { id: "rome-trastevere", name: "Trastevere After Dark", stops: 10, minutes: 100, blurb: "Cobblestones, cloisters, and the neighbourhood that never joined Rome.", free: false }
    ]
  },
  {
    slug: "lisbon",
    name: "Lisbon",
    country: "Portugal",
    tagline: "Seven hills, one earthquake, and the saudade in between",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Bel%C3%A9m_Tower_in_Lisbon%2C_Portugal.jpg/960px-Bel%C3%A9m_Tower_in_Lisbon%2C_Portugal.jpg",
    hours: 8,
    routes: [
      { id: "lisbon-alfama", name: "Alfama Staircases", stops: 11, minutes: 110, blurb: "The maze the earthquake spared, and the fado it started.", free: true },
      { id: "lisbon-belem", name: "Belém & the Sea", stops: 8, minutes: 80, blurb: "Where the caravels left — and what came back.", free: false }
    ]
  },
  {
    slug: "tokyo",
    name: "Tokyo",
    country: "Japan",
    tagline: "A city rebuilt twice, narrated one lantern at a time",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Sensoji_2023.jpg/960px-Sensoji_2023.jpg",
    hours: 19,
    routes: [
      { id: "tokyo-yanaka", name: "Yanaka Backstreets", stops: 12, minutes: 115, blurb: "The Tokyo that survived — temples, cats, and wooden houses.", free: true },
      { id: "tokyo-shinjuku", name: "Shinjuku Neon Walk", stops: 10, minutes: 95, blurb: "Golden Gai's two-metre bars and the station that swallows cities.", free: false },
      { id: "tokyo-asakusa", name: "Asakusa Old Town", stops: 9, minutes: 85, blurb: "Incense, rice crackers, and the temple that outlived the firebombs.", free: false }
    ]
  },
  {
    slug: "mexico-city",
    name: "Mexico City",
    country: "Mexico",
    tagline: "A capital on a lake that isn't there anymore",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Bellas_Artes_01.jpg/960px-Bellas_Artes_01.jpg",
    hours: 11,
    routes: [
      { id: "cdmx-centro", name: "Centro Histórico", stops: 12, minutes: 120, blurb: "Aztec stones under baroque facades, and the square that sinks.", free: true },
      { id: "cdmx-coyoacan", name: "Coyoacán & Frida", stops: 8, minutes: 90, blurb: "Blue walls, market food, and the revolution next door.", free: false }
    ]
  },
  {
    slug: "paris",
    name: "Paris",
    country: "France",
    tagline: "Every doorway has an opinion",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg/960px-Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg",
    hours: 16,
    routes: [
      { id: "paris-marais", name: "Marais Courtyards", stops: 11, minutes: 105, blurb: "Aristocrats, ateliers, and the square built for duels.", free: true },
      { id: "paris-seine", name: "Seine at Golden Hour", stops: 9, minutes: 85, blurb: "Bridges in order of scandal.", free: false }
    ]
  },
  {
    slug: "prague",
    name: "Prague",
    country: "Czechia",
    tagline: "Alchemy, defenestrations, and astronomically good beer",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Prague_07-2016_view_from_Lesser_Town_Tower_of_Charles_Bridge_img3.jpg/960px-Prague_07-2016_view_from_Lesser_Town_Tower_of_Charles_Bridge_img3.jpg",
    hours: 9,
    routes: [
      { id: "prague-oldtown", name: "Old Town & the Clock", stops: 10, minutes: 95, blurb: "The astronomer, the mob, and the skeleton that rings the hour.", free: true },
      { id: "prague-castle", name: "Castle Hill Stories", stops: 9, minutes: 100, blurb: "A fortress, a cathedral, and two men thrown out of a window.", free: false }
    ]
  },
  {
    slug: "barcelona",
    name: "Barcelona",
    country: "Spain",
    tagline: "A grid with a grudge and a cathedral that grows",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/SF_maig_2_cropped.jpg/960px-SF_maig_2_cropped.jpg",
    hours: 12,
    routes: [
      { id: "bcn-gothic", name: "Gothic Quarter", stops: 11, minutes: 100, blurb: "Roman walls, civil war shrapnel, and alleys that predate maps.", free: true },
      { id: "bcn-gaudi", name: "Gaudí's Long Game", stops: 8, minutes: 110, blurb: "From lampposts to the basilica that outlived its architect.", free: false }
    ]
  },
  {
    slug: "vienna",
    name: "Vienna",
    country: "Austria",
    tagline: "Empire, espresso, and the waltz of the Ringstrasse",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Wien_-_Schloss_Sch%C3%B6nbrunn.JPG/960px-Wien_-_Schloss_Sch%C3%B6nbrunn.JPG",
    hours: 10,
    routes: [
      { id: "vienna-ring", name: "Ringstrasse Sweep", stops: 10, minutes: 95, blurb: "The boulevard an emperor built to show off — and who paid.", free: true },
      { id: "vienna-cafes", name: "Coffeehouse Circuit", stops: 7, minutes: 75, blurb: "Freud's table, Trotsky's chess, and the pastry wars.", free: false }
    ]
  },
  {
    slug: "istanbul",
    name: "Istanbul",
    country: "Türkiye",
    tagline: "Two continents, three empires, one bridge queue",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Hagia_Sophia_%28228968325%29.jpeg/960px-Hagia_Sophia_%28228968325%29.jpeg",
    hours: 13,
    routes: [
      { id: "ist-sultanahmet", name: "Sultanahmet Domes", stops: 10, minutes: 110, blurb: "Byzantium to Constantinople to now, dome by dome.", free: true },
      { id: "ist-galata", name: "Galata & the Bosphorus", stops: 9, minutes: 90, blurb: "Genoese towers, fish sandwiches, and the strait that runs the show.", free: false }
    ]
  },
  {
    slug: "kyoto",
    name: "Kyoto",
    country: "Japan",
    tagline: "A thousand years of capital, whispered through bamboo",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Golden_Pavilion_Kinkaku-ji_water_mirror_2024.jpg/960px-Golden_Pavilion_Kinkaku-ji_water_mirror_2024.jpg",
    hours: 11,
    routes: [
      { id: "kyoto-higashiyama", name: "Higashiyama Lanes", stops: 11, minutes: 105, blurb: "Teahouses, temple bells, and the philosopher's shortcut.", free: true },
      { id: "kyoto-arashiyama", name: "Arashiyama Bamboo", stops: 7, minutes: 70, blurb: "The grove, the monkeys, and the bridge the moon crosses.", free: false }
    ]
  },
  {
    slug: "new-york",
    name: "New York",
    country: "United States",
    tagline: "A grid that never shuts up — finally, a guide that keeps pace",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Front_view_of_Statue_of_Liberty_%28cropped%29.jpg/960px-Front_view_of_Statue_of_Liberty_%28cropped%29.jpg",
    hours: 15,
    routes: [
      { id: "nyc-downtown", name: "Downtown Layers", stops: 12, minutes: 115, blurb: "Dutch walls under skyscrapers and the street called Wall.", free: true },
      { id: "nyc-brooklyn", name: "Brooklyn Bridge & Heights", stops: 8, minutes: 85, blurb: "The bridge that killed its builder and the promenade that saved a borough.", free: false }
    ]
  },
  {
    slug: "marrakech",
    name: "Marrakech",
    country: "Morocco",
    tagline: "A medina with no straight lines and no dull ones either",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Djemaa_el_Fna.jpg/960px-Djemaa_el_Fna.jpg",
    hours: 7,
    routes: [
      { id: "mrk-medina", name: "Medina & the Souks", stops: 10, minutes: 100, blurb: "Dyers, storytellers, and the square that becomes a theatre at dusk.", free: true }
    ]
  }
];

export function findCity(slug) {
  return CITIES.find(function (c) { return c.slug === slug; }) || null;
}

export function findRoute(routeId) {
  for (var i = 0; i < CITIES.length; i++) {
    var city = CITIES[i];
    var route = city.routes.find(function (r) { return r.id === routeId; });
    if (route) return { city: city, route: route };
  }
  return null;
}
