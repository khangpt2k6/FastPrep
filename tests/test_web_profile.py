from agent_automation.web_profile import empty_profile, profile_answers


def test_empty_profile_gives_no_answers():
    assert profile_answers(empty_profile()) == {}
    assert profile_answers({}) == {}


def test_profile_answers_flattens_every_section():
    data = empty_profile()
    data["personal"] |= {"first_name": "Jane", "last_name": "Doe", "email": "jane@example.com", "city": "Tampa", "state": "FL", "zip": "33612"}
    data["education"] = [{"school": "State U", "degree": "B.S.", "field": "Computer Science", "gpa": "3.9", "start": "2024-08", "end": "Present"}]
    data["experience"] = [
        {"company": "Old Co", "title": "Intern", "location": "", "start": "2024-05", "end": "2024-08", "description": ""},
        {"company": "Now Co", "title": "Engineer", "location": "Remote", "start": "2025-01", "end": "Present", "description": "- built things"},
    ]
    data["skills"] = ["Python", " Go "]
    data["authorization"] |= {"countries": ["United States"], "needs_sponsorship": "Yes", "visa_type": "F-1"}
    data["eeo"] |= {"gender": "Prefer not to say", "sexual_orientation": ["Prefer not to say"]}
    data["extra"]["custom"] = [{"question": "Why us?", "answer": "Mission."}, {"question": "", "answer": "ignored"}]

    answers = profile_answers(data)

    assert answers["full_name"] == "Jane Doe"
    assert answers["location"] == "Tampa, FL"
    assert answers["address"] == "Tampa, FL 33612"
    assert answers["education"] == "B.S. Computer Science, State U, 2024-08 to Present, GPA 3.9"
    assert answers["current_company"] == "Now Co"
    assert "Engineer at Now Co, Remote (2025-01 to Present)\n- built things" in answers["work_experience"]
    assert answers["skills"] == "Python, Go"
    assert answers["countries_to_work_in"] == "United States"
    assert answers["requires_visa_sponsorship"] == "Yes"
    assert answers["gender"] == "Prefer not to say"
    assert answers["Why us?"] == "Mission."
    assert "" not in answers.values()
    assert "phone" not in answers


def test_profile_answers_survives_bad_shapes():
    assert profile_answers({"personal": "nope", "education": "nope", "experience": [1, None], "skills": None}) == {}
