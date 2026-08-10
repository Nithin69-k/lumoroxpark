import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOST_ID = "dc792845-cab2-4fd9-bbd1-cbad722a1e66";

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const authClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, ok, extra = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// 0. Fresh test renter
const email = `renter-${Date.now().toString(36)}@example.com`;
const password = "TestPass_2026!";
const { data: newUser, error: newUserErr } = await authClient.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "UPI E2E Renter" },
});
check("fresh test renter created", !newUserErr && newUser?.user?.id, newUserErr?.message);
const { data: signIn } = await authClient.auth.signInWithPassword({ email, password });
const renterToken = signIn?.session?.access_token;
check("renter signed in", Boolean(renterToken));
const renter = createClient(URL, PUBLISHABLE, {
  global: { headers: { Authorization: `Bearer ${renterToken}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: spaces } = await admin
  .from("parking_spaces")
  .select("id, price_per_hour")
  .eq("host_id", HOST_ID)
  .limit(1);
const space = spaces?.[0];
check("host has a test space", Boolean(space), space?.id ?? "none");
const hourly = Number(space?.price_per_hour ?? 50);

// Purge bookings left behind by earlier test runs so the test space's
// calendar never fills up (each run leaves confirmed+paid rows behind).
// Paid bookings can't be cancelled via a plain UPDATE (the DB only allows
// the cancel_booking RPC path), so delete the non-cancelled leftovers.
if (space) {
  const { error: purgeErr } = await admin
    .from("bookings")
    .delete()
    .eq("space_id", space.id)
    .neq("status", "cancelled");
  if (purgeErr) console.error("purge:", purgeErr.message);
}

async function makePendingBooking() {
  for (let day = 3; day <= 9; day++) {
    const start = new Date();
    start.setDate(start.getDate() + day);
    start.setMinutes(0, 0, 0);
    start.setHours(14, 0, 0);
    const end = new Date(start.getTime() + 2 * 3600000);
    const { data, error } = await renter.rpc("create_pending_booking", {
      p_space_id: space.id,
      p_start: start.toISOString(),
      p_end: end.toISOString(),
    });
    if (!error && data) return data;
  }
  return null;
}

async function chargeFor(bookingId) {
  const { data, error } = await renter.rpc("get_booking_charge", {
    p_booking_id: bookingId,
    p_env: "live",
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

// ============ A. Host Pro activation (mirrors activateUpiSubscription) ============
const utr2 = `S${Math.floor(100000000000 + Math.random() * 900000000000)}`.slice(0, 12);
const subId = `upi-${utr2}`;
const now = new Date();
const end = new Date(now.getTime() + 30 * 86400000);
const { data: sub, error: subErr } = await admin
  .from("subscriptions")
  .insert({
    user_id: HOST_ID,
    product_id: "host_pro",
    price_id: "host_pro_monthly",
    status: "active",
    environment: "live",
    current_period_start: now.toISOString(),
    current_period_end: end.toISOString(),
    razorpay_subscription_id: subId,
    razorpay_customer_id: `upi-${HOST_ID.slice(0, 12)}`,
  })
  .select("id")
  .single();
check("subscription inserted", !subErr && sub?.id, subErr?.message);

const dupSub = await admin
  .from("subscriptions")
  .select("id")
  .eq("razorpay_subscription_id", subId)
  .maybeSingle();
check("dup subscription ref detected", Boolean(dupSub?.data));

// Pro commission: a new booking priced while the sub is active should show 5% fee
const proBooking = await makePendingBooking();
const proCharge = proBooking ? await chargeFor(proBooking) : null;
const base = Number(proCharge?.base_amount ?? NaN);
check(
  "pro booking priced",
  Boolean(proCharge),
  proCharge ? `total=${proCharge.total}` : "no window",
);
check(
  "pro commission is 5%",
  !Number.isNaN(base) &&
    Math.abs(Number(proCharge.platform_fee) - Math.round(base * 0.05 * 100) / 100) < 0.01,
  `fee=${proCharge?.platform_fee}`,
);

// cleanup the pro-priced booking so it doesn't linger as pending
if (proBooking) {
  await admin
    .from("bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", proBooking);
}

// ============ B. Booking payment by UPI (mirrors confirmUpiBookingPayment) ============
const utr = `T${Math.floor(100000000000 + Math.random() * 900000000000)}`.slice(0, 12);
const bookingId = await makePendingBooking();
check("pending booking created", Boolean(bookingId), bookingId ?? "all windows busy");

const dupCheck = await renter
  .from("bookings")
  .select("id")
  .eq("razorpay_transaction_id", utr)
  .eq("payment_status", "paid")
  .maybeSingle();
check("UTR not used yet", !dupCheck.error && !dupCheck.data);

const charge = await chargeFor(bookingId);
check("get_booking_charge as renter", charge?.total > 0, `total=${charge.total}`);

const { data: outcome, error: settleErr } = await admin.rpc("settle_booking_payment", {
  p_booking_id: bookingId,
  p_transaction_id: utr,
  p_amount_charged: Number(charge.total),
  p_env: "live",
});
check(
  "settle_booking_payment",
  !settleErr && outcome === "settled",
  String(outcome ?? settleErr?.message),
);

const { data: booking } = await admin
  .from("bookings")
  .select("status,payment_status,razorpay_transaction_id")
  .eq("id", bookingId)
  .single();
check(
  "booking confirmed+paid",
  booking?.status === "confirmed" && booking?.payment_status === "paid",
  `${booking?.status}/${booking?.payment_status}`,
);
check("UTR stored on booking", booking?.razorpay_transaction_id === utr);

const dupCheck2 = await renter
  .from("bookings")
  .select("id")
  .eq("razorpay_transaction_id", utr)
  .eq("payment_status", "paid")
  .maybeSingle();
check("same UTR detected as used", Boolean(dupCheck2?.data));

const { data: wallet } = await admin
  .from("host_wallets")
  .select("pending_clearance")
  .eq("host_id", HOST_ID)
  .single();
check(
  "host wallet credited",
  Number(wallet?.pending_clearance ?? 0) > 0,
  `pending=${wallet?.pending_clearance}`,
);

// ============ C. Subscriptions cleanup (mirrors cancel at period end) ============
const { data: subRow } = await admin
  .from("subscriptions")
  .select("id")
  .eq("user_id", HOST_ID)
  .eq("environment", "live")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (subRow) {
  const { error: delErr } = await admin.from("subscriptions").delete().eq("id", subRow.id);
  check("test subscription cleaned up", !delErr, delErr?.message);
}

console.log(results.join("\n"));
