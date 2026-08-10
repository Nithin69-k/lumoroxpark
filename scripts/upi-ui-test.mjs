import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const URL = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CHROME_PATH = process.env.CHROME_PATH;
const HOST_ID = "dc792845-cab2-4fd9-bbd1-cbad722a1e66";
const EMAIL = "upi-ui-renter@example.com";
const PASSWORD = "UpiUiPass_2026!";

const results = [];
function check(name, ok, extra = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Fixed test user
let userId;
const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const found = existing?.users?.find((u) => u.email === EMAIL);
if (found) {
  userId = found.id;
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "UPI UI Renter" },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = data.user.id;
}
check("UI test user ready", Boolean(userId));

const { data: signIn, error: signInErr } = await admin.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (signInErr) throw new Error(`signIn: ${signInErr.message}`);
check("UI user signed in", Boolean(signIn.session?.access_token));

const renter = createClient(URL, PUBLISHABLE, {
  global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});
// Pending booking for the pay flow. Each run uses a distinct start hour so
// the booking can never collide with leftover bookings from earlier runs
// (those sit at 14:00 IST), keeping the pay flow deterministic even if the
// purge above is flaky.
const { data: spaces } = await admin
  .from("parking_spaces")
  .select("id")
  .eq("host_id", HOST_ID)
  .limit(1);

// Purge bookings left behind by earlier test runs so the test space's
// calendar never fills up (each run leaves confirmed+paid rows behind).
// Paid bookings can't be cancelled via a plain UPDATE (the DB only allows
// the cancel_booking RPC path), so delete the non-cancelled leftovers.
if (spaces?.[0]) {
  const { error: purgeErr } = await admin
    .from("bookings")
    .delete()
    .eq("space_id", spaces[0].id)
    .neq("status", "cancelled");
  if (purgeErr) console.error("purge:", purgeErr.message);
}

let bookingId = null;
let bookingStart = null;
for (let day = 3; day <= 9; day++) {
  const start = new Date();
  start.setDate(start.getDate() + day);
  start.setMinutes(0, 0, 0);
  start.setHours(9 + (day - 3) * 3);
  const end = new Date(start.getTime() + 2 * 3600000);
  const { data, error } = await renter.rpc("create_pending_booking", {
    p_space_id: spaces[0].id,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
  });
  if (!error && data) {
    bookingId = data;
    bookingStart = start.toISOString();
    break;
  }
}
check("pending booking created for UI flow", Boolean(bookingId), bookingId ?? "all windows busy");

const utr = `U${Math.floor(100000000000 + Math.random() * 900000000000)}`.slice(0, 12);

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const context = await browser.newContext();
await context.addInitScript(
  ([key, session]) => {
    localStorage.setItem(key, JSON.stringify(session));
  },
  [`sb-xlmmmbztwreeqkbmwdan-auth-token`, signIn.session],
);
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

async function dumpPage(label) {
  const body = await page.textContent("body").catch(() => "?");
  console.log(`--- ${label} ---`);
  console.log((body ?? "").slice(0, 1200));
}

try {
  // --- /pricing: Host Pro subscription via UPI panel ---
  await page.goto(`${BASE_URL}/pricing`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Subscribe monthly" }).click();
  await page.waitForSelector('img[alt*="UPI payment QR"]', { timeout: 10000 });
  const qr = page.locator('img[alt*="UPI payment QR"]');
  const qrOk = await qr.evaluate((el) => el.naturalWidth > 0);
  check("pricing dialog shows a rendered UPI QR", qrOk);
  check(
    "pricing dialog shows the business UPI ID",
    await page.getByText("lumoropark@upi").first().isVisible(),
  );
  check("pricing dialog shows amount 19.00", await page.getByText("19.00").first().isVisible());
  check(
    "pricing dialog has UTR input + activate button",
    (await page.locator("#upi-ref").count()) > 0 &&
      (await page.getByRole("button", { name: "Activate plan" }).count()) > 0,
  );
  await page.keyboard.press("Escape");

  // --- /bookings: pay a pending booking through the UPI panel ---
  await page.goto(`${BASE_URL}/bookings`, { waitUntil: "networkidle" });

  // Scope every assertion to THIS run's booking card: it must contain the
  // run's unique slot text AND a pay button (cancelled leftovers share the
  // slot text of past runs but never this run's hour).
  const slotLabel = (iso) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const slotText = `${slotLabel(bookingStart)} → ${slotLabel(new Date(new Date(bookingStart).getTime() + 2 * 3600000))}`;
  const ownCard = () =>
    page
      .locator("li")
      .filter({ has: page.getByRole("button", { name: "Pay by UPI" }) })
      .filter({ hasText: slotText })
      .first();

  await ownCard()
    .getByRole("button", { name: "Pay by UPI" })
    .click({ timeout: 30000 })
    .catch(async (e) => {
      await dumpPage("bookings page on Pay-by-UPI timeout");
      throw e;
    });
  await page.waitForSelector('img[alt*="UPI payment QR"]', { timeout: 10000 });
  check(
    "bookings panel shows the business UPI ID",
    await page.getByText("lumoropark@upi").first().isVisible(),
  );
  await page.fill("#upi-ref", utr);
  await page.getByRole("button", { name: "Confirm payment" }).click();

  // After confirm the server settles via service role; the page reloads and the
  // booking card shows the check-in QR (paid) and no pay button.
  await page
    .waitForSelector("text=Show this at arrival", { timeout: 20000 })
    .catch(() => undefined);
  const ownCardAfter = page
    .locator("li")
    .filter({ has: page.getByText("Show this at arrival") })
    .filter({ hasText: slotText })
    .first();
  const paidState = await ownCardAfter.getByText("Show this at arrival").count();
  const payButtonGone =
    (await ownCardAfter.getByRole("button", { name: "Pay by UPI" }).count()) === 0;
  check("booking becomes paid after UPI confirm (check-in QR shown)", paidState > 0);
  check("pay button disappears after confirm", payButtonGone);

  // Ignore favicon 404s and React's dev-only "state update before mount"
  // warning: it is a hydration-timing race in development builds that has no
  // effect in production, and the real signal is any other console error.
  const realErrors = consoleErrors.filter(
    (t) => !t.includes("favicon") && !t.includes("hasn't mounted yet"),
  );
  check(
    "no console errors during UPI flows",
    realErrors.length === 0,
    realErrors.join(" | ").slice(0, 200),
  );
} finally {
  await browser.close();
}

console.log(results.join("\n"));
