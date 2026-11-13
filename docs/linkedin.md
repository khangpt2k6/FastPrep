# LinkedIn

The Profile page has a LinkedIn card with two things: bringing your LinkedIn profile into the dashboard as a file, and linking your LinkedIn account with LinkedIn's own sign-in.

The agent does not use Easy Apply and never signs in or applies "with LinkedIn" on a form. LinkedIn gives its jobs, full profiles and applications only to its partners, and automating the site in a browser breaks its terms and gets accounts restricted. A LinkedIn posting that links to the company's own form (Greenhouse, Lever, Workday and the others in [sites.md](sites.md)) is applied to there.

## Import your profile

1. On LinkedIn open your own profile, choose **More**, then **Save to PDF**.
2. On the dashboard open **Profile**, and in the LinkedIn card press **Upload PDF**.
3. The agent, running on your computer, reads the file and adds to your profile what it does not have yet.

What you already wrote stays as it is. Only an empty contact field is filled, and only a school, a role or a skill that is not listed yet is added, after the ones that are. A school or a company spelled differently on LinkedIn ("USF" and "University of South Florida") comes in as a second entry: remove it in the profile wizard.

The file is never treated as your resume. No form is sent it, and your search stays as it is. It is removed from storage once the agent has read it.

This needs the `linkedin` command kind in `supabase/schema.sql`. On a database from before it, the card says that importing needs the latest schema: run the file again in the Supabase SQL editor.

## Connect LinkedIn

This links your LinkedIn account to the dashboard account through Supabase Auth. LinkedIn shares your name, email and photo, and nothing else: no experience, no education, no jobs. The card then shows the account as connected. It changes nothing in what the agent does.

It works only after you set it up once, with your own LinkedIn app:

1. At https://www.linkedin.com/developers/apps create an app. LinkedIn asks for a LinkedIn Page to attach it to.
2. In the app's **Products** tab request **Sign In with LinkedIn using OpenID Connect**.
3. In the app's **Auth** tab add this redirect URL, with your Supabase project's reference in it: `https://<project ref>.supabase.co/auth/v1/callback`. Copy the Client ID and the Client Secret.
4. In Supabase open **Authentication**, **Providers**, **LinkedIn (OIDC)**. Turn it on and paste the Client ID and the Client Secret.
5. In Supabase **Authentication** settings turn on **Allow manual linking**.
6. In Supabase **Authentication**, **URL Configuration**, make sure the dashboard's address is the Site URL or is in the redirect list.

Until then, pressing **Connect** says what is missing. **Disconnect** on the card removes the link. To take the access away on LinkedIn's side as well, remove the app under LinkedIn's Settings, Data privacy, Permitted services.
