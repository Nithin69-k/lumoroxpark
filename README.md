# LumoroX Park

**Book private driveway parking, by the hour.**

📦 Status: **Early access / pre-launch** — "Live in your city soon"

LumoroX Park is a peer-to-peer parking marketplace. Renters find and book private driveways near them by the hour; hosts turn empty driveway space into income. Live availability, contactless QR check-in, and public trust scores are designed to make the experience fast and reliable for both sides.

---

## ✨ Features

- **Live map** — Free spots update in real time as bookings happen.
- **QR check-in** — Contactless arrival: scan on-site, no keys, no phone calls.
- **EV-ready filtering** — Filter listings for EV chargers, covered spots, and gated lots.
- **Trust score** — Every host and renter builds a public reliability score based on past bookings.
- **Two-sided flow** — "Find parking near me" for renters, "List your driveway" for hosts.
- **Single unified signup** — One account covers both booking and listing; sign up with Google or email.

---

## 🧭 Current App Structure

| Page | Path | What it does |
|---|---|---|
| Home | `/` | Landing page — value prop, feature highlights, CTAs to browse or list |
| Browse | `/browse` | Map-based search with filters and geolocation ("Locating…"); currently shows no live listings in most areas since the platform is pre-launch |
| Sign up | `/auth?mode=signup` | Create account via Google OAuth or email/password |
| Sign in | `/auth?mode=signin` | Existing user login |

> The browse map is live and functional, but listing inventory is still empty in most areas — the app is in a pre-launch/early-access phase ("Live in your city soon").

---

## 🧭 How it's meant to work

1. **Renters** browse the live map, filter by price/EV/covered/gated, and book a spot by the hour.
2. **Hosts** list their driveway with availability windows and pricing.
3. On arrival, renters scan a **QR code** to check in — no key exchange needed.
4. After each booking, both sides rate the experience, feeding the public **trust score**.

---

## 🛠 Tech Stack

> Fill this in with what's actually wired up in the repo — the fields below are common defaults, not confirmed for this project.

- Frontend: React + TypeScript (Vite)
- Styling: Tailwind CSS
- Backend/DB: _fill in (e.g. Supabase)_
- Auth: _fill in (e.g. Supabase Auth, given Google OAuth + email/password sign-up)_
- Maps/Geolocation: _fill in (e.g. Mapbox / Google Maps API)_
- Hosting: Vercel

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/Nithin69-k/lumoropark.git
cd lumoropark
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_MAPS_API_KEY=your_maps_api_key
```

> Replace these with whatever services your backend actually uses.

### Run locally

```bash
npm run dev
```

App runs at `http://localhost:5173` (or the port Vite assigns).

### Build for production

```bash
npm run build
```

---

## 📸 Screenshot

![LumoroX Park homepage](blob:https://claude.ai/7107265c-4f89-45aa-a5dd-e8fa89754744)

---

## 🗺 Roadmap

- [ ] Launch live listings in first city
- [ ] Populate browse map with real host inventory
- [ ] In-app messaging between host and renter
- [ ] Payment integration
- [ ] Push notifications for booking status

---

## 📄 License

Add your license here (e.g. MIT).

---

Built by [Nithin K](https://github.com/Nithin69-k)

---

## 🚀 Deploying to Vercel

The app is a TanStack Start (SSR) project. `vite.config.ts` pins the Nitro
preset to `vercel`, so a Vercel build emits the Build Output API v3 bundle at
`.vercel/output` — no adapter or custom server needed.

1. **Import the repo** into Vercel. Leave the framework preset as **Other**
   (`vercel.json` already sets the build/install commands).
2. **Add environment variables** (Project Settings → Environment Variables) —
   copy them from `.env.example`:
   - `VITE_SITE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_RAZORPAY_KEY_ID` (client — used by the checkout script)
   - `RAZORPAY_SANDBOX_KEY_ID`, `RAZORPAY_SANDBOX_KEY_SECRET`, `RAZORPAY_SANDBOX_WEBHOOK_SECRET`
   - `RAZORPAY_LIVE_KEY_ID`, `RAZORPAY_LIVE_KEY_SECRET`, `RAZORPAY_LIVE_WEBHOOK_SECRET`
3. **Deploy.** Client routes, SSR, and the `/api/public/*` server routes
   (Razorpay order creation + signature verification) all run as one serverless function.
4. **After the first deploy**, add your Vercel domain to the backend Auth
   *Site URL* / *Redirect URLs* list so Google OAuth and email links return correctly,
   and point the Razorpay webhook at
   `https://<your-vercel-domain>/api/public/payments/webhook?env=live`
   (use `?env=sandbox` for the test destination).
5. Pay with the test card `4111 1111 1111 1111` (any future expiry/CVV) to verify checkout.

Local production check:

```bash
npm run build   # outputs .vercel/output
npm run preview
```
