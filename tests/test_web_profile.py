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


def test_background_answers_are_given_as_the_person_set_them():
    data = empty_profile()
    data["background"] |= {"security_clearance": "Prefer not to disclose", "foreign_government_ties": "No", "criminal_conviction": "No"}
    answers = profile_answers(data)
    assert answers["security_clearance"] == "Prefer not to disclose"
    assert answers["foreign_government_ties"] == "No" and answers["criminal_conviction"] == "No"
    assert "let_go_or_asked_to_resign" not in answers

    data["background"] |= {"security_clearance": "None", "let_go_or_resigned": "No"}
    answers = profile_answers(data)
    assert answers["security_clearance"].startswith("None (") and answers["let_go_or_asked_to_resign"] == "No"
    assert profile_answers({"background": "nope"}) == {}


def test_veteran_and_disability_answers_say_what_the_lists_offer():
    from agent_automation.memory.web_profile import empty_profile, profile_answers

    data = empty_profile()
    data["eeo"] |= {"veteran": "No", "disability": "Prefer not to say"}
    answers = profile_answers(data)
    assert answers["veteran_status"] == "No, I am not a protected veteran"
    assert answers["disability_status"].startswith("Prefer not to say")


def test_linkedin_adds_only_what_the_profile_does_not_have():
    from agent_automation.memory.web_profile import add_from_linkedin

    current = empty_profile()
    current["personal"] |= {"first_name": "Jane", "email": "jane@example.com"}
    current["education"] = [{"school": "State University", "degree": "B.S.", "field": "CS", "gpa": "3.9", "start": "2024-08", "end": "2028-05"}]
    current["experience"] = [{"company": "Acme", "title": "Intern", "location": "", "start": "2025-05", "end": "2025-08", "description": "- mine"}]
    current["skills"] = ["Python"]
    current["background"] = {"criminal_conviction": "No"}
    read = {
        "personal": {"first_name": "Janet", "last_name": "Doe", "email": "", "linkedin": "https://www.linkedin.com/in/janedoe", "nickname": "x"},
        "education": [{"school": "state university", "degree": "BS"}, {"school": "Coursera", "degree": "Certificate"}, {"school": ""}],
        "experience": [
            {"company": "ACME", "title": "intern", "description": "- theirs"},
            {"company": "Acme", "title": "Teaching Assistant"},
            {"company": "Acme", "title": "Teaching Assistant"},
        ],
        "skills": ["python", "Go", " ", "Go"],
    }
    merged, said = add_from_linkedin(current, read)
    assert merged["personal"]["first_name"] == "Jane" and merged["personal"]["last_name"] == "Doe"
    assert merged["personal"]["linkedin"] == "https://www.linkedin.com/in/janedoe" and "nickname" not in merged["personal"]
    assert [e["school"] for e in merged["education"]] == ["State University", "Coursera"]
    assert [(e["company"], e["title"]) for e in merged["experience"]] == [("Acme", "Intern"), ("Acme", "Teaching Assistant")]
    assert merged["experience"][0]["description"] == "- mine" and merged["skills"] == ["Python", "Go"]
    assert merged["background"] == {"criminal_conviction": "No"} and merged["eeo"] == current["eeo"]
    assert said == "added 1 role, 1 school, 1 skill, 2 contact fields"

    again, said = add_from_linkedin(merged, read)
    assert again == merged and said == "nothing new, your profile already has it"
    filled, said = add_from_linkedin({}, {"personal": "nope", "skills": None, "experience": [{"company": "Acme", "title": "Intern"}]})
    assert filled["experience"] == [{"company": "Acme", "title": "Intern"}] and said == "added 1 role"
