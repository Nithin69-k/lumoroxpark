# Deploying LumoroX Park to Vercel

The app is a TanStack Start (SSR) project. The build emits Vercel's native
Build Output API bundle at `.vercel/output`, so no adapter or framework preset
is needed.

## 1. Import the repository

Vercel → **Add New → Project → Import Git Repository**.

`vercel.json` in the repo already sets everything Vercel needs:

| Setting          | Value                 |
| ---------------- | --------------------- |
| Framework preset | Other (`null`)        |
| Install command  | `npm install`         |
| Build command    | `npm run build`       |
| Output directory | `.vercel/output`      |
| Node version     | 22.x (from `engines`) |

Do not override these in the dashboard.

## 2. Add environment variables

Copy every key from `.env.example` into **Settings → Environment Variables**
for the **Production** (and **Preview**, if used) environment.

`VITE_*` variables are compiled into the browser bundle, so they must exist
**before** the first build. If you add them later, redeploy.

Minimum set for a fully working deployment:

- `VITE_SITE_URL` — your live URL, e.g. `https://lumoropark.vercel.app`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_RAZORPAY_KEY_ID` — the Razorpay key id for the environment you serve (`rzp_test_...` for sandbox, `rzp_live_...` for live)
- `RAZORPAY_SANDBOX_KEY_ID`, `RAZORPAY_SANDBOX_KEY_SECRET`, `RAZORPAY_SANDBOX_WEBHOOK_SECRET`
- `RAZORPAY_LIVE_KEY_ID`, `RAZORPAY_LIVE_KEY_SECRET`, `RAZORPAY_LIVE_WEBHOOK_SECRET`

Optional (enables the Lumoro AI assistant on `/ai` and AI price suggestions):

- `AI_API_KEY` — Google AI Studio key (provider `gemini`) or OpenAI key (provider `openai`)
- `AI_PROVIDER` — `gemini` (default) or `openai`
- `AI_GEMINI_MODEL` — default `gemini-2.5-flash-lite`
- `AI_OPENAI_MODEL` — default `gpt-4o-mini`

Without `SUPABASE_SERVICE_ROLE_KEY`, payment settlement, expiry of stale
checkout holds and account deletion will fail. Without the Razorpay key
secrets, order creation, refunds and webhook verification fail.

## 3. Point the payment webhook at Vercel

After the first successful deploy, update the payment provider's webhook
destination to:

```
https://<your-vercel-domain>/api/public/payments/webhook?env=live
```

(and the test destination to the same URL with `?env=sandbox`).

Subscribe these events: `payment.captured`, `payment.failed`,
`refund.created`, `refund.processed`, `subscription.created`,
`subscription.activated`, `subscription.charged`, `subscription.updated`,
`subscription.cancelled`, `subscription.paused`, `subscription.resumed`,
`subscription.completed`, `subscription.halted`, `subscription.pending`.

## 4. Allow the new domain in the backend

In the backend auth settings, add the Vercel domain to the allowed redirect
URLs / site URL, otherwise email confirmation, password reset and Google
sign-in will bounce back to the old domain.

## 5. Verify after deploy

1. `/` loads with the map placeholder, then the interactive map.
2. `/robots.txt` and `/sitemap.xml` show your Vercel domain.
3. Sign up, confirm email, sign in.
4. Create a listing, book it, pay with the test card `4111 1111 1111 1111`
   (any future expiry and CVV; Razorpay sandbox only).
5. Check the booking flips to confirmed (this proves the webhook and the
   service-role key are wired correctly).
6. `/profile` → billing history shows the payment.

## Local production check

```bash
npm run build      # produces .vercel/output
npx vite preview
```

## Google sign-in on Vercel

Google sign-in uses the backend's own OAuth endpoint
(`src/lib/google-signin.ts`), so add your Vercel URL (e.g.
`https://your-app.vercel.app/auth`) to the allowed redirect URLs in the
Cloud → Users → Authentication settings before going live.
Email/password sign-in only needs `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` present **at build time** in Vercel.
