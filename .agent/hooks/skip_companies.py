"""before_apply hook: skip a company the person never wants to apply to.

The companies are `skip_companies` in preferences.md. A company matches when its name contains a listed one, in any case:
"Acme" skips "Acme Robotics". Exit 2 skips the job, with the reason on standard error.
"""

import json
import sys

event = json.load(sys.stdin)
company = str(event.get("job", {}).get("company", "")).casefold()
for name in event.get("preferences", {}).get("skip_companies") or []:
    if str(name).strip() and str(name).casefold().strip() in company:
        print(f"{event['job']['company']} is in skip_companies in preferences.md", file=sys.stderr)
        sys.exit(2)
