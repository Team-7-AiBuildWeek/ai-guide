"""A small, hand-checked Bratislava old town fixture.

Used by the tests and the README's offline walkthrough so neither depends on Wikidata
being reachable. Facts are short and conservative; `walk seed-city` replaces them with
sourced Wikipedia/Wikidata material for real runs.
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.ingest.store import upsert_fact
from app.models import City, LexiconEntry, Poi
from app.pipeline.content import refresh_facts_hash

CITY = dict(slug="bratislava", name="Bratislava", country_code="SK", local_language="sk",
            min_lat=48.10, min_lng=17.05, max_lat=48.18, max_lng=17.16, centroid_lat=48.1440, centroid_lng=17.1070,
            status="active")

POIS = [
    # name, local name, lat, lng, popularity, tags, facts
    ("St. Martin's Cathedral", "Dóm svätého Martina", 48.14205, 17.10458, 95, ["church", "history", "architecture"],
     "St. Martin's Cathedral is a Gothic cathedral in Bratislava's old town. Between 1563 and 1830 it was the "
     "coronation church of the Kingdom of Hungary. Its tower is topped by a gilded replica of the Hungarian crown."),
    ("Michael's Gate", "Michalská brána", 48.14474, 17.10662, 90, ["history", "architecture", "monument"],
     "Michael's Gate is the only preserved gate of Bratislava's medieval town fortifications. A statue of "
     "St. Michael stands on top of its tower, which houses an exhibition of historic weapons."),
    ("Old Town Hall", "Stará radnica", 48.14365, 17.10893, 80, ["history", "museum", "architecture"],
     "The Old Town Hall stands on the Main Square. It houses the Bratislava City Museum, founded in 1868 and one "
     "of the oldest museums in Slovakia."),
    ("Main Square", "Hlavné námestie", 48.14344, 17.10861, 85, ["history"],
     "The Main Square is the centre of Bratislava's old town. Its Maximilian Fountain, also called Roland's "
     "Fountain, dates from 1572."),
    ("Primate's Palace", "Primaciálny palác", 48.14402, 17.10966, 75, ["palace", "history", "art", "architecture"],
     "The Primate's Palace is a neoclassical palace built between 1778 and 1781 for Archbishop József Batthyány. "
     "The Peace of Pressburg was signed in its Hall of Mirrors in 1805."),
    ("Bratislava Castle", "Bratislavský hrad", 48.14226, 17.10001, 100, ["castle", "history", "architecture"],
     "Bratislava Castle is a rectangular building with four corner towers on a hill above the Danube. It burned "
     "in 1811 and stood in ruins until its reconstruction in the 1950s and 1960s."),
    ("Blue Church", "Modrý kostol", 48.14360, 17.11620, 70, ["church", "architecture", "art"],
     "The Church of St. Elizabeth, known as the Blue Church, is an Art Nouveau church designed by Ödön Lechner. "
     "It was built between 1907 and 1913."),
    ("Slovak National Theatre", "Slovenské národné divadlo", 48.14240, 17.11030, 60, ["theatre", "architecture", "art"],
     "The historic building of the Slovak National Theatre opened in 1886 on today's Hviezdoslav Square. It was "
     "designed by the Viennese architects Fellner and Helmer."),
]

# From the web app's lexicon (lib/providers/tts/lexicon.ts). Starting guesses, unverified.
LEXICON_EN = {
    "Michalská brána": "ˈmixalskaː ˈbraːna",
    "Hlavné námestie": "ˈɦlaʋneː ˈnaːmestje",
    "Primaciálny palác": "ˈprimat͡sjaːlni ˈpalaːt͡s",
    "Stará radnica": "ˈstaraː ˈradɲit͡sa",
    "Modrý kostol": "ˈmɔdriː ˈkɔstɔl",
    "Bratislavský hrad": "ˈbracislaʊ̯skiː ˈɦrat",
    "Petržalka": "ˈpetr̩ʒalka",
}


def seed_demo(session: Session) -> City:
    session.execute(insert(City).values(**CITY).on_conflict_do_nothing(index_elements=["slug"]))
    city = session.scalars(select(City).where(City.slug == CITY["slug"])).one()
    for i, (name, local, lat, lng, popularity, tags, text) in enumerate(POIS):
        qid = f"DEMO{i + 1}"
        session.execute(insert(Poi).values(
            city_id=city.id, name=name, local_name=local, lat=lat, lng=lng, popularity_score=popularity,
            tags=tags, wikidata_qid=qid, category=tags[0],
        ).on_conflict_do_nothing(index_elements=["wikidata_qid"]))
        poi = session.scalars(select(Poi).where(Poi.wikidata_qid == qid)).one()
        upsert_fact(session, poi.id, source_type="manual", source_url=f"demo://bratislava/{qid}",
                    license="CC0-1.0", language="en", content=text)
        refresh_facts_hash(session, poi)
    for surface, ipa in LEXICON_EN.items():
        session.execute(insert(LexiconEntry).values(
            locale="en-US", surface_form=surface, alphabet="ipa", phoneme=ipa,
            notes="from webapp lexicon.ts; needs a native speaker",
        ).on_conflict_do_nothing(index_elements=["locale", "surface_form"]))
    session.flush()
    return city
