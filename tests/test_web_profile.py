from agent_automation.memory.web_profile import empty_profile, profile_answers


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


def test_writing_text_says_the_preferences_and_one_answer_per_question():
    from agent_automation.memory.web_profile import writing_text

    preferences = {"tone": "Warm", "length": "Short", "highlight": "AI agents", "avoid": "", "notes": "", "sample": "", "learn": True}
    memory = [
        {"question": "Why do you want to work here?", "answer": "Old learned", "source": "learned", "pinned": False, "updated_at": "2026-11-01T00:00:00Z"},
        {"question": "Why do you want to work here?", "answer": "Newer learned", "source": "learned", "pinned": False, "updated_at": "2026-11-05T00:00:00Z"},
        {"question": "why do you want to work HERE", "answer": "Mine", "source": "user", "pinned": False, "updated_at": "2026-10-01T00:00:00Z"},
        {"question": "Tell us about a project", "answer": "Arena", "source": "learned", "pinned": True, "updated_at": "2026-09-01T00:00:00Z"},
        {"question": "", "answer": "ignored", "source": "user", "pinned": False, "updated_at": ""},
    ]
    text = writing_text(preferences, memory)
    assert "- tone: Warm" in text and "- length: one or two sentences" in text and "- emphasize: AI agents" in text
    assert "never say" not in text
    assert "A: Mine" in text and "Old learned" not in text and "Newer learned" not in text
    assert "A (pinned): Arena" in text
    assert text.index("Tell us about a project") < text.index("A: Mine")
    assert writing_text({}, []) == ""


def test_finish_form_written_answers_are_read_safely():
    from agent_automation.agent.apply import written_answers

    assert written_answers({"written_answers": [{"question": " Why us? ", "answer": " Mission. "}, {"question": "", "answer": "x"}, "bad"]}) == (("Why us?", "Mission."),)
    assert written_answers({}) == ()
    assert written_answers({"written_answers": "nope"}) == ()


def test_veteran_and_disability_answers_say_what_the_lists_offer():
    from agent_automation.memory.web_profile import empty_profile, profile_answers

    data = empty_profile()
    data["eeo"] |= {"veteran": "No", "disability": "Prefer not to say"}
    answers = profile_answers(data)
    assert answers["veteran_status"] == "No, I am not a protected veteran"
    assert answers["disability_status"].startswith("Prefer not to say")
