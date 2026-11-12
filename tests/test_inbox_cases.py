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
    external = mail("mcole@tesla.com", "Still interested in joining Tesla?", "We are reviewing your application for the internship.", "Mark Cole [Ext]")
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
    # The same rules again change nothing.
    store.add([5], [Event("m5", "t", "2026-10-01", "applied", "Stripe", "", "a@b.c", "s", "")], "2026-11-12T00:00:00+00:00")
    store.keep_rules(RULES)
    assert [event.company for event in store.events()] == ["Stripe"]
    store.close()
