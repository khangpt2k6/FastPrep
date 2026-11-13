"""Cases the inbox rules got wrong on a real mailbox, each kept as a test. People's names are made up."""

from __future__ import annotations

from email.message import EmailMessage
from pathlib import Path

from agent_automation.memory.inbox_store import InboxStore
from agent_automation.tools.inbox import RULES, Event, Mail, applications, classify, kind_of, parse_message


def mail(sender: str, subject: str, text: str, name: str = "", bulk: bool = False) -> Mail:
    return Mail(1, "m1", "t1", "2026-11-01T10:00:00+00:00", sender, name, subject, text, bulk)


def read_as(message: Mail, me: str = "") -> tuple[str, str] | None:
    event = classify(message, me)
    return (event.kind, event.company) if event else None


def test_a_recruiter_writing_from_the_companys_own_address_is_not_the_company() -> None:
    message = mail("hrossi@hubspot.com", "HubSpot Recruiter Zoom Interview Confirmation",
                   "Hi Khang,\nThis confirms your recruiter interview for the SWE Co-op role at HubSpot.", "Helen Rossi")
    assert read_as(message) == ("interview", "HubSpot")
    external = mail("mcole@tesla.com", "Your Tesla application", "We are reviewing your application for the internship.", "Mark Cole [Ext]")
    assert read_as(external) == ("applied", "Tesla")


def test_a_company_in_brackets_after_a_persons_name_is_the_company() -> None:
    message = mail("j.doe@msgphx.paycomonline.com", "Response to Employment Application",
                   "<!DOCTYPE html><html><body><p>Hello&nbsp;Khang,</p><p>I received your application for the position of Full-Stack "
                   "Engineering Intern and would like to schedule a call to discuss the position.</p></body></html>", "JANE DOE [Acme Financial Corporation]")
    assert read_as(message) == ("interview", "Acme Financial")


def test_forums_and_digests_are_never_an_application_whatever_they_talk_about() -> None:
    assert read_as(mail("noreply@redditmail.com", '"Amazon SDE OA 2026, looking for recent experiences."', "I applied for the SDE intern role and got the online assessment.", "Reddit")) is None
    assert read_as(mail("no-reply@leetcode.com", "LeetCode Weekly Digest", "Practice for your next coding interview and online assessment.", "LeetCode")) is None
    # Sent to a list, with a subject that is an article's and not an invitation's.
    article = mail("jobs@diversityjobnews.example", "How to Prove Your Soft Skills in a Job Interview", "We would like to invite you to an interview workshop.", "TalentAlly", bulk=True)
    assert read_as(article) is None
    promo = mail("uber@uber.com", "Khang, you have a promo", "Thank you for your interest in driving. Your application to drive is waiting.", "Uber", bulk=True)
    assert read_as(promo) is None
    workshop = mail("volunteer@codepath.org", "You're registered: Behavioral Interview Workshop | Nov. 9", "Your interview workshop is on Monday.", "Volunteer at CodePath")
    assert read_as(workshop) is None


def test_a_list_mail_whose_subject_is_an_applications_still_counts() -> None:
    message = mail("jobs@recruitment.janestreet.com", "Thank you for applying to Jane Street",
                   "Hi Khang,\nUnfortunately we will not be moving forward with your application for the internship.", "Jane Street", bulk=True)
    assert read_as(message) == ("rejected", "Jane Street")


def test_workday_names_the_employer_in_its_address_unless_the_subject_names_another() -> None:
    cisco = mail("cisco@myworkday.com", "Entry-level Talent Recruiting - Cisco Application Status Update",
                 "Thank you for your interest. We have decided not to move forward with your application.", "Workday", bulk=True)
    assert read_as(cisco) == ("rejected", "Cisco")
    dow = mail("newscorp@myworkday.com", "Your application to Summer 2026 Internship – Software Engineering Intern at Dow Jones",
               "Thank you for applying. Unfortunately, the position has been filled.", "Workday", bulk=True)
    assert read_as(dow) == ("rejected", "Dow Jones")


def test_a_carrier_that_names_the_employer_in_its_host_is_spelled_as_the_message_spells_it() -> None:
    video = mail("noreply@morganstanley.tal.net", "Action Required – HireVue Video to Complete",
                 "Dear Khang,\nAs part of your application to Morgan Stanley, please complete your HireVue video interview.", "No-Reply")
    assert read_as(video) == ("assessment", "Morgan Stanley")
    thanks = mail("interviews@bankofamerica.hirevue.com", "Thank you!", "Thank you for completing your HireVue assessment for Bank of America. Your candidacy is under review.")
    assert read_as(thanks) == ("assessment", "Bank of America")


def test_an_invitation_in_the_subject_stays_one_whatever_its_small_print_says() -> None:
    text = ("We are excited to invite you to our Superday. You will not be eligible to interview if you do not fully register. "
            "Failure to join will impact your candidacy.")
    assert kind_of("You're Invited! Morgan Stanley Technology Analyst Program Superday (11/17)", text) == "interview"


def test_a_receipt_that_says_what_may_come_next_is_still_a_receipt() -> None:
    text = ("Thank you for submitting your application for the Software Engineer Intern position at OPSWAT. If your qualifications look like a "
            "good fit for the position, we will reach out via email to schedule a time to get to know you. If you are not selected for this "
            "position, keep an eye on our careers page.")
    assert kind_of("Thank you for applying to OPSWAT", text) == "applied"


def test_refusals_under_a_plain_subject_are_refusals() -> None:
    assert kind_of("Amazon application: Status update", "After careful consideration and review of your application, we have decided to progress with other candidates for this role.") == "rejected"
    assert kind_of("Cloudflare Application Update | Software Engineer Intern", "Unfortunately, we are no longer hiring for this position.") == "rejected"
    assert kind_of("Intuit | Update on Your Application", "Recruitment for the Internship Program has concluded, and all positions have now been filled.", bulk=True) == "rejected"


def test_a_withdrawal_ends_the_application_as_its_own_status() -> None:
    assert kind_of("You've withdrawn your Amazon job application!", "This confirms the withdrawal.") == "withdrawn"
    events = [Event("a", "t1", "2026-10-01", "applied", "Amazon", "", "x@amazon.jobs", "applied", ""), Event("b", "t2", "2026-10-05", "withdrawn", "Amazon", "", "x@amazon.jobs", "withdrawn", "")]
    assert [(item.status, item.mails) for item in applications(events)] == [("withdrawn", 2)]


def test_the_persons_own_name_in_a_subject_is_not_the_company() -> None:
    message = mail("no-reply@ashbyhq.com", "Khang Phan | Gen Digital - Software Engineer Intern - Norton - Update",
                   "Hi Khang,\nThank you for applying. Unfortunately we have decided to move forward with other candidates.", "Gen Digital Hiring Team")
    assert read_as(message) == ("rejected", "Gen Digital")
    assert read_as(mail("no-reply@ashbyhq.com", "Ada Rossi | Gen Digital - Update", "Thank you for applying to the intern role.", "Notifications"), me="Ada Rossi") == ("applied", "Gen Digital")


def test_names_that_are_phrases_and_not_employers_are_passed_over() -> None:
    assert read_as(mail("no-reply@ashbyhq.com", "Application Received - Beacon Software", "We received your application for the Software Engineering Intern role.", "Beacon Software Hiring Team")) == ("applied", "Beacon Software")
    assert read_as(mail("noreply@campuscareers.bofa.com", "Bank of America: Assessment Invitation", "Please complete the online assessment for the Summer Analyst role.")) == ("assessment", "Bank of America")
    assert read_as(mail("workatastartup@ycombinator.com", "Your application for Sixtyfour - Software Engineering Intern", "The founders received your application.", "Y Combinator")) == ("applied", "Sixtyfour")
    assert read_as(mail("no-reply@flyzipline.com", "Thank you for applying to Zipline", "We received your application. See https://www.flyzipline.com/careers for more roles.")) == ("applied", "Zipline")


def test_a_companys_short_and_long_names_are_one_application_and_roles_in_one_thread_are_not() -> None:
    def event(n: int, kind: str, company: str, role: str, thread: str) -> Event:
        return Event(f"m{n}", thread, f"2026-10-{n:02d}", kind, company, role, "a@b.c", kind, "")

    found = applications([event(1, "applied", "IMC Trading", "", "t1"), event(2, "assessment", "IMC", "", "t2")])
    assert [(item.company, item.status, item.mails) for item in found] == [("IMC", "assessment", 2)]
    # Gmail puts receipts with one subject in one thread: each role is still its own application.
    same_thread = applications([event(1, "applied", "Microsoft", "AI/ML Intern", "t9"), event(2, "applied", "Microsoft", "Security Intern", "t9")])
    assert sorted(item.role for item in same_thread) == ["AI/ML Intern", "Security Intern"]


def test_an_invitation_after_a_refusal_is_another_application_and_a_refusal_closes_the_open_one() -> None:
    def event(n: int, kind: str, role: str = "") -> Event:
        return Event(f"m{n}", f"t{n}", f"2026-10-{n:02d}", kind, "Morgan Stanley", role, "a@b.c", kind, "")

    found = applications([event(1, "applied", "Analyst (Alpharetta)"), event(2, "rejected", "Analyst (Alpharetta)"), event(3, "interview")])
    assert sorted((item.status, item.role) for item in found) == [("interview", ""), ("rejected", "Analyst (Alpharetta)")]
    closing = applications([event(1, "applied", "Analyst (Alpharetta)"), event(2, "rejected", "Analyst (Alpharetta)"), event(3, "applied", "Analyst (New York)"), event(4, "rejected")])
    assert sorted((item.status, item.role) for item in closing) == [("rejected", "Analyst (Alpharetta)"), ("rejected", "Analyst (New York)")]


def test_a_calendar_booking_for_a_first_call_is_an_interview_and_gmail_is_asked_for_it() -> None:
    from agent_automation.tools.inbox import QUERY

    booking = mail("b.egan@fedcon.com", "Appointment booked: FEDCON Meet & Greet - Ai Marketing (Khang Phan) @ Mon Nov 16, 2026 4pm - 4:30pm (EST)",
                   "Thank you for your interest in the AI Marketing Intern role. We'd love to connect for a brief 10-15 minute meet and greet.", "Brad Egan")
    assert read_as(booking, me="Khang Phan") == ("interview", "FEDCON")
    assert '"appointment booked"' in QUERY and '"meet and greet"' in QUERY


def test_the_subject_shown_is_the_message_that_decided_the_status() -> None:
    invite = Event("m1", "t1", "2026-10-01", "interview", "ServiceNow", "", "a@b.c", "your application with ServiceNow - let's chat!", "")
    receipt = Event("m2", "t2", "2026-10-03", "applied", "ServiceNow", "", "a@b.c", "ServiceNow - Thank you for your application", "")
    (found,) = applications([invite, receipt])
    assert (found.status, found.subject, found.updated_at) == ("interview", "your application with ServiceNow - let's chat!", "2026-10-03")


def at(day: int, minute: int = 0) -> str:
    return f"2026-07-{day:02d}T10:{minute:02d}:00+00:00"


def happened(n: int, when: str, kind: str, company: str, role: str = "", sender: str = "a@b.c", subject: str = "", snippet: str = "") -> Event:
    return Event(f"m{n}", f"t{n}", when, kind, company, role, sender, subject or kind, snippet)


def test_a_receipt_under_a_subject_about_getting_ready_is_a_receipt() -> None:
    receipt = mail("no-reply@optiver.us", "Prepare for your interview with Optiver",
                   "Hi Khang,\nExciting news! Your application has been received. We'd like to share some information to help prepare you for the interview process.")
    assert read_as(receipt) == ("applied", "Optiver")
    # It names no role; the invitation that comes with it does, and the two are one application dated by the receipt.
    found = applications([happened(1, at(5, 0), "applied", "Optiver"), happened(2, at(5, 3), "assessment", "Optiver", "Quantitative Intern (Summer 2027)")])
    assert [(item.status, item.role, item.applied_at, item.mails) for item in found] == [("assessment", "Quantitative Intern (Summer 2027)", at(5, 0), 2)]


def test_a_reminder_of_a_test_not_taken_is_an_assessment_of_the_role_under_either_spelling() -> None:
    reminder = mail("no-reply@optiver.us", "Take the Next Step in your Optiver Application",
                    "We are writing you with regard to your application for the Quantitative Internship position at Optiver.\nAs the first step, we have "
                    "asked you to take a test. Our records indicate that you have not yet completed your assessment.")
    event = classify(reminder)
    assert event is not None and (event.kind, event.role) == ("assessment", "Quantitative Internship")
    found = applications([happened(1, at(5), "applied", "Optiver", "Quantitative Intern (Summer 2027)"), happened(2, at(20), "assessment", "Optiver", "Quantitative Internship")])
    assert [(item.status, item.role, item.mails) for item in found] == [("assessment", "Quantitative Intern (Summer 2027)", 2)]
    twilio = applications([happened(1, at(1), "interview", "Twilio", "Developer Advocacy Intern"), happened(2, at(9), "rejected", "Twilio", "Developer Advocacy Internship")])
    assert [(item.status, item.mails) for item in twilio] == [("rejected", 2)]


def test_a_role_that_is_the_start_of_another_is_the_same_application() -> None:
    long, short = "Fall 2026/Spring 2027 - Software Engineering Intern - 90413045 - Washington - 167096", "Fall 2026/Spring 2027 - Software Engineering Intern - 90413045 - Washington"
    found = applications([happened(1, at(1), "applied", "Amtrak", long), happened(2, at(14), "rejected", "Amtrak", short)])
    assert [(item.status, item.role, item.mails) for item in found] == [("rejected", long, 2)]
    # One word is the start of too much, and two roles that part ways are two applications.
    apart = applications([happened(1, at(1), "applied", "Akuna", "Software Engineer Intern - C++"), happened(2, at(2), "applied", "Akuna", "Software Engineer Intern - Python"),
                          happened(3, at(3), "applied", "Akuna", "Intern")])
    assert len(apart) == 3


def test_refusals_said_softly_are_refusals() -> None:
    shaw = ("Thanks for your interest in the D. E. Shaw group. We've reviewed your application and were impressed. At the moment, we don't have a match "
            "for your particular skill set and our current needs, but we'll keep your resume on hand if the right position opens up at a later time.")
    assert kind_of("From the D. E. Shaw group", shaw) == "rejected"
    assert kind_of("Application Update from", "We sincerely appreciate your interest in the Software Engineering Intern role. This position has just been filled.") == "rejected"
    assert kind_of("Your application for Software Engineer Intern", "Our team reviewed your background and, unfortunately, we won’t be moving forward.") == "rejected"
    assert kind_of("We've got an update on your application", "Thanks for your interest in our position.\nUnfortunately, you haven't\nbeen selected to move forward.") == "rejected"
    assert kind_of("Thank you for your interest in Cboe.", "Thank you for applying for our Software Engineer Intern role. Unfortunately, we are no longer taking applications.") == "rejected"
    assert kind_of("Update from Attentive", "Thank you for your application to the AI Intern role. We've made the decision to not move forward at this time.") == "rejected"


def test_a_tests_own_rules_refuse_nothing() -> None:
    text = ("We're excited that you've applied for our FutureFocus Technology Program and are pleased to move forward with your application.\n"
            "You will soon receive the Optiver Online Assessment.\nUnfortunately, we're unable to offer retakes regardless of circumstance.")
    assert kind_of("Optiver | FutureFocus Program", text) == "assessment"


def test_signing_up_to_hear_of_openings_is_no_application() -> None:
    message = mail("no-reply@ashbyhq.com", "Thank you for your interest in Whatnot!",
                   "Hi Khang,\nThanks so much for submitting your information to our Early Talent Community - Software Engineering at Whatnot!\n"
                   "As a reminder, this is not an application, just a way for you to show early interest in Whatnot!", "Whatnot Hiring Team")
    assert read_as(message) is None
    # A refusal that ends by pointing at the talent community is still a refusal.
    assert kind_of("Your Okta Application - Software Engineer Intern", "We have decided to move forward with another candidate. Stay informed by joining our Talent Community.") == "rejected"


def test_a_refusal_whose_template_left_the_employer_out_closes_the_application_with_that_role() -> None:
    role = "Software Engineering Intern, DataOps Engineering / Data Engineering"
    blank = mail("careers@luminatedata.com", "Application Update from",
                 f"Hi Khang,\nWe sincerely appreciate your interest in the {role} role at and the time you invested in applying. This position has just been filled.")
    event = classify(blank)
    assert event is not None and (event.kind, event.company, event.role) == ("rejected", "Luminatedata", role)
    receipt = happened(1, at(1), "applied", "PMC", role, "no-reply@us.greenhouse-mail.io", f"Thanks for applying to {role}")
    found = applications([receipt, Event("m2", "t2", at(9), event.kind, event.company, event.role, event.sender, event.subject, event.snippet)])
    assert [(item.company, item.status, item.applied_at, item.mails) for item in found] == [("PMC", "rejected", at(1), 2)]
    # An employer the mail does name keeps its own row, whatever role it shares.
    named = applications([receipt, happened(2, at(9), "rejected", "Luminate Data", role, "careers@luminatedata.com", "Update from Luminate Data")])
    assert sorted(item.company for item in named) == ["Luminate Data", "PMC"]


def test_a_title_keeps_what_follows_its_comma_and_what_stands_in_its_brackets() -> None:
    intuit = mail("do_not_reply@intuit.com", "Application Received! Thanks for applying to the Intern, Software Engineering Role at Intuit", "We received your application.")
    twilio = mail("careers@twilio.com", "Thank you for applying to Twilio!",
                  "Hello Khang,\nThank you for your interest in the Software Engineer Intern (22nd June - 11th September, remote-US) position(s) at Twilio!")
    tesla = mail("noreply@tesla.com", "Thank you, we've received your Tesla application",
                 "Thank you for submitting your application for the Internship, Software Engineer, Vehicle Engineering (Fall 2026) , 267767 position.")
    roles = [event.role for event in (classify(intuit), classify(twilio), classify(tesla)) if event is not None]
    assert roles == ["Intern, Software Engineering", "Software Engineer Intern (22nd June - 11th September, remote-US)",
                     "Internship, Software Engineer, Vehicle Engineering (Fall 2026), 267767"]


def test_the_receipt_dates_the_application_and_without_one_the_date_is_not_known() -> None:
    found = applications([happened(1, at(1), "assessment", "Ramp"), happened(2, at(2), "applied", "Ramp"), happened(3, at(9), "rejected", "Ramp"),
                          happened(4, at(20), "rejected", "Cloudflare")])
    dated = {item.company: (item.applied_at, item.applied_known) for item in found}
    assert dated == {"Ramp": (at(2), True), "Cloudflare": (at(20), False)}


def test_a_receipt_after_a_refusal_is_a_new_application_for_the_same_role() -> None:
    found = applications([happened(1, at(1), "applied", "Optiver", "Software Engineer Intern"), happened(2, at(2), "rejected", "Optiver", "Software Engineer Intern"),
                          happened(3, at(20), "applied", "Optiver", "Software Engineer Intern")])
    assert sorted((item.status, item.applied_at) for item in found) == [("applied", at(20)), ("rejected", at(1))]


def test_a_carrier_is_never_the_employer() -> None:
    assert read_as(mail("noreply@candidates.workablemail.com", "Thanks for applying to Caddi", "Your application for the Software Engineer Intern role was received.", "Workable")) == ("applied", "Caddi")
    assert read_as(mail("onboarding@resend.dev", "Interview Invitation – Software Engineer at CaresLink | Monday, March 9, 2026 at 10:00 AM", "Your interview is booked.")) == ("interview", "CaresLink")
    assert read_as(mail("no-reply@codesignal.com", "Ramp invited you to take Ramp 2025 Coding Assessment", "Complete the coding assessment for the intern role.", "CodeSignal")) == ("assessment", "Ramp")
    sent = mail("jobs-noreply@linkedin.com", "Khang, your application was sent to Built By The Trades", "Your application was sent to Built By The Trades.", "LinkedIn", bulk=True)
    assert read_as(sent) == ("applied", "Built By The Trades")
    brand = mail("publicisgroupe+autoreply@talent.icims.eu", "Thank You for Applying to Epsilon!", "We received your application for the Software Engineer Intern role.", "PUBLICISGROUPE", bulk=True)
    assert read_as(brand) == ("applied", "Epsilon")
    recruiter = mail("system@hirebridgemail.com", "Your interview with Advantive",
                     "Your interview for the AI & Systems Intern position with us is confirmed. Interviewer(s):Holly Dean\n(c) 2025 Advantive.", "Holly Dean")
    assert read_as(recruiter) == ("interview", "Advantive")


def test_an_address_adds_to_a_name_what_the_message_leaves_out() -> None:
    offer = mail("ada@joinprox.com", "Prox Internship Offer – Congratulations Khang!", "We are excited to offer you the internship.", "Ada Rossi")
    assert read_as(offer) == ("offer", "Prox")
    sony = mail("sonyglobal@myworkday.com", "News regarding your application.", "Thank you for applying to Sony. Unfortunately, the team has decided not to move forward.", "", bulk=True)
    assert read_as(sony) == ("rejected", "Sony")


def test_one_employer_under_its_initials_its_name_and_its_address_is_one() -> None:
    found = applications([happened(1, at(1), "interview", "Hudson River Trading"), happened(2, at(2), "interview", "Hudsontrading"), happened(3, at(9), "rejected", "HRT")])
    assert [(item.status, item.mails) for item in found] == [("rejected", 3)]


def test_an_interview_held_in_a_tests_tool_is_an_interview() -> None:
    assert kind_of("Invitation: HRT Interview - CoderPad & Zoom @ Mon Dec 1, 2025 11am", "Join the interview for the internship role.") == "interview"
    assert kind_of("Online Assessment before your interview", "Please complete the assessment for the internship role.") == "assessment"


def test_a_message_sent_to_a_list_says_so_in_its_headers() -> None:
    def raw(listed: bool) -> bytes:
        message = EmailMessage()
        message["From"], message["Subject"], message["Date"] = "News <news@example.com>", "Hello", "Sun, 01 Nov 2026 10:00:00 +0000"
        if listed:
            message["List-Unsubscribe"] = "<mailto:leave@example.com>"
        message.set_content("Hello")
        return message.as_bytes()

    listed, direct = parse_message(raw(True), 1), parse_message(raw(False), 2)
    assert listed is not None and direct is not None
    assert (listed.bulk, direct.bulk) == (True, False)


def test_what_older_rules_kept_is_dropped_so_the_mailbox_is_read_again(tmp_path: Path) -> None:
    store = InboxStore(tmp_path / "inbox.db")
    store.keep_rules(RULES - 1)
    store.add([5], [Event("m5", "t", "2026-10-01", "interview", "Reddit", "", "noreply@redditmail.com", "s", "")], "2026-11-12T00:00:00+00:00")
    assert store.known(3, [5]) == set()  # a first validity: nothing is known yet
    store.add([5], [], "2026-11-12T00:00:00+00:00")
    assert store.known(3, [5]) == {5}
    store.keep_rules(RULES)
    assert store.events() == [] and store.known(3, [5]) == set()
    # The same rules again change nothing, and neither does an agent still running older ones.
    store.add([5], [Event("m5", "t", "2026-10-01", "applied", "Stripe", "", "a@b.c", "s", "")], "2026-11-12T00:00:00+00:00")
    store.keep_rules(RULES)
    store.keep_rules(RULES - 1)
    assert [event.company for event in store.events()] == ["Stripe"]
    store.close()
