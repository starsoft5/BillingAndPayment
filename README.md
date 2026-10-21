# Memberly

A responsive Next.js member directory styled with Tailwind CSS, with client-side forms and REST endpoints backed by Supabase.

## Set up Supabase

1. Create or select a Supabase project. Supabase's hosted database is named `postgres`; `supadb01` can be used as the project name, but Supabase does not let projects rename the hosted database.
2. In the project's SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql). It creates or prepares the lowercase `public.member` table with a bigint identity ID, enables row-level security, and grants data access only to allowlisted admin accounts. It also creates the `public.is_member_admin()` function required by the API. Run it again if the API reports that function is missing.
3. In Supabase Authentication, create an admin user and turn off public sign-ups. Add that user's UUID to the allowlist in the SQL Editor:

   ```sql
   insert into public.member_admins (user_id)
   values ('your-auth-user-uuid');
   ```

4. Copy `.env.local.example` to `.env.local` and set the project URL and anon/publishable key from Project Settings → API. These public client settings are protected by the admin allowlist and RLS policies.
5. Install dependencies and start the app:

   ```sh
   npm install
   npm run dev
   ```

The REST API is available at `GET/POST /api/members` and `PATCH/DELETE /api/members/:id`. The form validates names and email addresses in the browser and the API; email addresses must be unique.

## Database credentials

This app accesses Supabase through its authenticated REST client, not a PostgreSQL connection string. Supabase's hosted database is named `postgres`; `supadb01` can be used as the project name, but Supabase does not let projects rename the hosted database. A PostgreSQL username/password connection string cannot be inferred from an app-level username/password; use the project-specific values in Supabase's database settings if you separately need direct SQL access. Do not commit database passwords or private keys.
