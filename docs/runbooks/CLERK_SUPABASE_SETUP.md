# Clerk × Supabase Third-Party Auth — manual setup

This is one-time, per-environment, manual configuration in two dashboards. Code in this repo assumes both are done.

## 1. Clerk Dashboard

1. Open the Clerk Dashboard for the target instance (dev / prod).
2. **Organizations** → enable Organizations, set "personal accounts" to disabled (B2B-only product).
3. **JWT Templates** → New template named exactly `supabase`:
   - Token lifetime: 60s (Supabase recommends short).
   - Custom claims:
     ```json
     {
       "role": "authenticated",
       "org_id": "{{org.id}}",
       "org_slug": "{{org.slug}}",
       "user_id": "{{user.id}}",
       "user_email": "{{user.primary_email_address}}"
     }
     ```
   - Save.
4. **Integrations** → enable the **Supabase** Third-Party Auth integration. Clerk shows your Supabase domain to paste in the next step.

## 2. Supabase Dashboard

1. **Authentication → Sign In / Providers → Third-Party Auth** → add provider, paste the Clerk Frontend API URL (form `https://<your-clerk-frontend-api>.clerk.accounts.dev`). Save.
2. **Database → Extensions** → enable `vector` (if not already enabled by our migration on first apply).
3. Apply the migration: `bunx supabase db push` (requires `supabase` CLI logged in to the right project).

## 3. Verify

In any server component:

```ts
import { createServerSupabaseClient } from "@ai-cfo/supabase/server";

const supabase = createServerSupabaseClient();
const { data, error } = await supabase.from("organizations").select("id, name");
// `data` is filtered by RLS to only the rows where org_id matches the JWT's org_id claim.
```

If the user is signed out OR has no active organization, `getToken()` returns `null` → Supabase queries return zero rows (RLS denies anonymous).

## Troubleshooting

- **`new row violates row-level security policy`**: the JWT lacks `org_id` (user has no active org, or template wasn't applied). Have the user open `<OrganizationSwitcher>` and pick / create an org.
- **`requesting_org_id()` returns NULL**: the Supabase Third-Party Auth provider is mis-configured — the request reached PostgREST anonymously. Re-paste the Clerk Frontend API URL in Supabase.
- **JWT template not applied**: `useAuth().getToken({ template: "supabase" })` is the explicit form. If you bypass the integration, fall back to passing `{ template: "supabase" }`.

## Production cutover checklist

- [ ] Separate Clerk instance for prod (not the dev instance).
- [ ] Separate Supabase project for prod.
- [ ] Both `.env` and `.env.local` updated.
- [ ] Migration applied via `supabase db push --linked` against the prod project.
- [ ] Smoke-test: create an organization in prod, verify a row insert into `organizations` carries the right `org_id` and reads back under RLS.
