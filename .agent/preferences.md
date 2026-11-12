---
# How the candidate wants to come across. Copy this file to ~/.agent-automation/preferences.md and change it there, or
# set it on the dashboard: the agent writes the dashboard's choices into that file. A key set there wins over this one.
style: plain            # a file in styles/writing/: plain, warm or formal
tone: ""                # in a few words, e.g. "confident and friendly"
length: ""              # Short, Medium or Detailed, for open questions on forms
highlight: []           # what to bring forward when it fits, e.g. ["shipped products", "teaching"]
avoid: []               # what never to mention
sample: ""              # a paragraph the candidate wrote, for the model to match their voice
skip_companies: []      # never applied to: the before_apply hook skips them
cover_letter:
  enabled: true
  template: classic     # a file in styles/cover-letters/
---
Anything else the agent should keep in mind about how the candidate presents themselves goes here, in plain words.
