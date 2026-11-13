from agent_automation.tools.places import find, locate


def test_locations_written_every_way_give_the_same_city_and_state():
    cases = {
        "USA - NJ - Camden": "Camden, NJ",
        "6625 Excellence Way, Plano, TX, USA": "Plano, TX",
        "Cary,North Carolina,United States": "Cary, NC",
        "Washington DC - 1800 M Street, NW, United States of America": "Washington, DC",
        "USA LA Bossier City, United States of America": "Bossier City, LA",
        "US, MA - Framingham, United States of America": "Framingham, MA",
        "New York, NY": "New York, NY",
        "NYC": "New York, NY",
        "Saint Petersburg, FL": "St. Petersburg, FL",
        "Tampa": "Tampa, FL",
        "Kansas City, MO": "Kansas City, MO",
    }
    for text, label in cases.items():
        assert locate(text).label == label, text


def test_several_places_remote_and_nothing_placeable():
    both = locate("California - Palo Alto, United States of America; California - San Francisco")
    assert both.label == "Palo Alto, CA; San Francisco, CA" and len(both.points) == 2
    assert locate("Remote; Austin, TX").label == "Remote; Austin, TX"
    remote = locate("Remote (United States)")
    assert remote.remote and remote.places == [] and remote.label == "Remote"
    for nowhere in ("United States", "Bangalore", "", "2 Locations"):
        assert locate(nowhere).places == [], nowhere


def test_a_name_many_states_share_needs_its_state():
    assert locate("Waynesboro").places == []
    assert locate("Waynesboro, VA").label == "Waynesboro, VA"
    # San Francisco's Census point is offshore; big cities use their downtown.
    lat, lon = find("San Francisco", "CA").lat, find("San Francisco", "CA").lon
    assert abs(lat - 37.77) < 0.05 and abs(lon + 122.42) < 0.05
