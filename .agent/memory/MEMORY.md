# Memory

What the candidate answered before, kept so the same question gets the same answer. Memory is personal: it lives only
in ~/.agent-automation/memory/, never in the repository. This file there is the index, one line per answer:

    - [Why do you want to work here?](why-do-you-want-to-work-here.md) - Acme Robotics

Each answer is its own file, with a front matter:

    ---
    question: Why do you want to work here?
    source: user         # user (the candidate's own answer) or learned (written by the agent on a form)
    pinned: false        # a pinned answer is used as written, every time
    company: Acme Robotics
    job_title: Backend Engineer
    updated: 2026-11-12
    ---
    The answer, as it was given.
