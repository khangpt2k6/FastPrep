"""Where a posting is, from its location text alone: the US places it names, as coordinates and as "City, ST", with no
service asked. The places are the US Census Bureau's 2024 Gazetteer (us_places.tsv.gz, public domain).

Postings write their location every way: "USA - NJ - Camden", "US, CA, Santa Clara, United States of America",
"6625 Excellence Way, Plano, TX, USA", "Cary,North Carolina,United States", "Remote; Austin, TX". A place named
without its state counts only when the name is not shared, or one place of that name is far bigger than the others."""

from __future__ import annotations

import gzip
import re
from dataclasses import dataclass, field
from functools import lru_cache
from importlib import resources

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut",
    "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "PR": "Puerto Rico",
}
BY_NAME = {name.lower(): code for code, name in STATES.items()}
# Names that are both a city and a state: alone, they mean the city.
CITY_FIRST = {"new york": ("New York", "NY"), "washington dc": ("Washington", "DC"), "washington d.c.": ("Washington", "DC")}
# Shorthands postings use for big cities.
ALIASES = {"nyc": ("New York", "NY"), "sf": ("San Francisco", "CA"), "la": ("Los Angeles", "CA"), "dc": ("Washington", "DC"),
           "st pete": ("St. Petersburg", "FL"), "bay area": ("San Francisco", "CA"), "sf bay area": ("San Francisco", "CA"),
           "san francisco bay area": ("San Francisco", "CA"), "silicon valley": ("San Jose", "CA"), "rtp": ("Durham", "NC"),
           "research triangle park": ("Durham", "NC"), "nyc metro": ("New York", "NY"), "greater boston": ("Boston", "MA"),
           "greater seattle": ("Seattle", "WA"), "dfw": ("Dallas", "TX"), "dallas-fort worth": ("Dallas", "TX")}
COUNTRY = re.compile(r"\b(united states of america|united states|u\.s\.a\.?|u\.s\.|usa|us|america)\b", re.IGNORECASE)
REMOTE = re.compile(r"\b(remote|anywhere|work from home|wfh|virtual)\b", re.IGNORECASE)
# One place a posting names is far bigger than the others of that name when its land area is this many times theirs.
BIGGER = 3


@dataclass(frozen=True)
class Place:
    name: str
    state: str
    lat: float
    lon: float

    @property
    def label(self) -> str:
        return f"{self.name}, {self.state}"


@dataclass
class Located:
    """What a location text says: the US places it names, in order, and whether it allows remote work."""

    places: list[Place] = field(default_factory=list)
    remote: bool = False

    @property
    def points(self) -> list[list[float]]:
        return [[place.lat, place.lon] for place in self.places]

    @property
    def label(self) -> str:
        """The places as "City, ST", with Remote first when it is one: what a job card shows. Empty when nothing was placed."""
        parts = (["Remote"] if self.remote else []) + [place.label for place in self.places]
        return "; ".join(parts)


def _key(name: str) -> str:
    name = name.lower().replace("’", "'")
    name = re.sub(r"\bsaint\b", "st", name)
    name = re.sub(r"\bft\b\.?", "fort", name)
    name = re.sub(r"\bmt\b\.?", "mount", name)
    return re.sub(r"[^a-z0-9']+", " ", name.replace(".", "")).strip()


@lru_cache(maxsize=1)
def _table() -> dict[str, list[tuple[str, str, float, float, int]]]:
    raw = resources.files("agent_automation.tools").joinpath("us_places.tsv.gz").read_bytes()
    table: dict[str, list[tuple[str, str, float, float, int]]] = {}
    for line in gzip.decompress(raw).decode("utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        name, state, lat, lon, area = line.split("\t")
        table.setdefault(_key(name), []).append((name, state, float(lat), float(lon), int(area)))
    return table


def find(name: str, state: str = "") -> Place | None:
    """The US place of this name, in this state when one is given. Without a state: the only place of that name, or the
    one far bigger than the others; else None."""
    key = _key(name)
    if not key:
        return None
    if key in ALIASES and not state:
        name, state = ALIASES[key]
        key = _key(name)
    found = _table().get(key, [])
    if state:
        found = [row for row in found if row[1] == state]
    if not found:
        return None
    if len(found) > 1:
        found = sorted(found, key=lambda row: -row[4])
        if found[0][4] < BIGGER * max(found[1][4], 1):
            return None
    name, state, lat, lon, _ = found[0]
    return Place(name, state, lat, lon)


def _code(token: str) -> str:
    """The state a two-letter code token names ("NJ"), or ''. Only upper case counts: "la" or "In" are words."""
    token = token.strip().strip(".")
    return token if len(token) == 2 and token.isupper() and token in STATES else ""


def _one(part: str) -> Place | None:
    """The place one location names: "Camden, NJ", "USA - NJ - Camden", "California - Palo Alto", "USA LA Bossier City"."""
    text = COUNTRY.sub(" ", part)
    if (city := CITY_FIRST.get(re.sub(r"\s+", " ", text.strip(" ,-").lower()))) is not None:
        return find(*city)
    tokens = [t.strip() for t in re.split(r",|\s[-–—]\s|\s[-–—]|[-–—]\s|\(|\)", text) if t.strip()]
    coded, named, state_names, cities = "", "", [], []
    for token in tokens:
        if re.search(r"\d", token):
            continue  # a street, a zip code or a suite
        if code := _code(token):
            coded = coded or code
            continue
        if (name := BY_NAME.get(token.lower())) is not None:
            named = named or name
            state_names.append(token)
            continue
        words = token.split()
        # "LA Bossier City", "Washington DC", "Seattle WA": a state code at one end of the token.
        if len(words) > 1 and _code(words[0]):
            coded = coded or words[0]
            words = words[1:]
        if len(words) > 1 and _code(words[-1]):
            coded = coded or words[-1]
            words = words[:-1]
        if words:
            cities.append(" ".join(words))
    state = coded or named
    # "New York, NY", "Washington, DC": the city has its state's name.
    cities += state_names
    for city in cities:
        if place := find(city, state):
            return place
    if state:
        return None
    for city in cities:
        if place := find(city):
            return place
    return None


def locate(location: str) -> Located:
    """The US places a posting's location names, and whether it says remote."""
    located = Located(remote=bool(REMOTE.search(location or "")))
    seen = set()
    for part in re.split(r"[;|/]|\bor\b|\band\b(?=\s+[A-Z])", location or ""):
        if not part.strip() or REMOTE.fullmatch(part.strip(" ,-()")):
            continue
        place = _one(REMOTE.sub(" ", part))
        if place is not None and place.label not in seen:
            seen.add(place.label)
            located.places.append(place)
        if len(located.places) >= 10:
            break
    return located
