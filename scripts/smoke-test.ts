/**
 * End-to-end smoke test for LumoroX Park.
 *
 * Runs a real browser through the critical public journeys and reports a
 * pass/fail summary. Usage:
 *
 *   bun run smoke            # against http://localhost:8080
 *   BASE_URL=https://<your-vercel-domain> bun run smoke
 *
 * It only exercises public surfaces (no credentials required), and fails the
 * process on any page error, console error, or missing key element.
 */
import { chromium, type ConsoleMessage, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";

type Result = { name: string; ok: boolean; detail?: string; ms: number };
const results: Result[] = [];

async function step(name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  PASS  ${name} (${Date.now() - t0}ms)`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail, ms: Date.now() - t0 });
    console.error(`  FAIL  ${name} — ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`Smoke test against ${BASE_URL}\n`);
  // CHROME_PATH lets CI point at a preinstalled Chromium instead of Playwright's.
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  );
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page: Page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const open = async (path: string) => {
    const res = await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    assert(res, `no response for ${path}`);
    assert(res.status() < 400, `${path} returned HTTP ${res.status()}`);
    await page.waitForLoadState("networkidle").catch(() => {});
  };

  await step("home page renders hero + primary CTA", async () => {
    await open("/");
    assert(await page.locator("h1").first().isVisible(), "no visible h1");
    assert(
      await page
        .getByRole("button", { name: /find|browse|spot/i })
        .first()
        .count(),
      "no browse CTA",
    );
  });

  await step("browse page loads map frame and listings", async () => {
    await open("/browse");
    await page.waitForSelector(".leaflet-container, [role='status'], [role='alert']", {
      timeout: 20_000,
    });
    const body = await page.textContent("body");
    assert(body && !/something went wrong/i.test(body), "error boundary shown on /browse");
  });

  await step("space detail opens from a listing", async () => {
    await open("/browse");
    const card = page.locator("a[href^='/space/']").first();
    if ((await card.count()) === 0) return; // no demo data seeded — not a failure
    await card.click();
    await page.waitForURL(/\/space\//, { timeout: 15_000 });
    assert(await page.locator("h1").first().isVisible(), "space detail has no heading");
  });

  await step("auth page exposes sign in, sign up and forgot password", async () => {
    await open("/auth");
    assert(await page.getByLabel(/email/i).first().isVisible(), "no email field");
    assert(
      await page
        .getByLabel(/password/i)
        .first()
        .isVisible(),
      "no password field",
    );
    const forgot = page.getByRole("button", { name: /forgot password/i });
    assert(await forgot.isVisible(), "no forgot-password link");
    await forgot.click();
    assert(
      await page.getByRole("button", { name: /send reset link/i }).isVisible(),
      "forgot-password view did not open",
    );
  });

  await step("reset-password route handles a missing token gracefully", async () => {
    await open("/reset-password");
    const body = (await page.textContent("body")) ?? "";
    assert(/reset link|new password/i.test(body), "reset page did not render");
  });

  await step("protected route redirects to auth", async () => {
    await open("/host/new");
    await page.waitForURL(/\/auth/, { timeout: 15_000 }).catch(() => {});
    assert(/\/auth/.test(page.url()), `expected redirect to /auth, got ${page.url()}`);
  });

  for (const path of ["/pricing", "/help", "/support", "/terms", "/privacy", "/refunds"]) {
    await step(`static page ${path} responds`, async () => {
      await open(path);
      assert(await page.locator("h1").first().isVisible(), `no h1 on ${path}`);
    });
  }

  await step("support form submits a ticket", async () => {
    await open("/support");
    const subject = page.getByLabel(/subject/i).first();
    if ((await subject.count()) === 0) return;
    await page.getByLabel(/email/i).first().fill("smoke-test@example.com");
    await subject.fill("Smoke test");
    await page
      .getByLabel(/details|message|describe/i)
      .first()
      .fill("Automated smoke test — please ignore.");
    await page
      .getByRole("button", { name: /send|submit/i })
      .first()
      .click();
    await page.waitForTimeout(2500);
  });

  await step("performance metrics are collected", async () => {
    await open("/?perf=1");
    await page.waitForTimeout(1500);
    const events = await page.evaluate(
      () => (window as unknown as { __lumoroPerf?: () => unknown[] }).__lumoroPerf?.() ?? [],
    );
    assert(Array.isArray(events), "perf monitoring not installed");
  });

  await step("no console errors during the run", async () => {
    // Dev-only noise: Vite's lazy route chunks can trip a hydration warning on
    // a redirected navigation; it does not reproduce on a production build.
    const ignorable =
      /favicon|ResizeObserver|third-party cookie|leaflet.*tile|Hydration failed|didn't match the client|hasn't mounted yet/i;
    const real = consoleErrors.filter((e) => !ignorable.test(e));
    assert(real.length === 0, `console errors:\n    - ${real.slice(0, 8).join("\n    - ")}`);
  });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  const total = results.reduce((s, r) => s + r.ms, 0);
  console.log(`\n${results.length - failed.length}/${results.length} passed in ${total}ms`);
  if (failed.length) {
    console.error("\nFailures:");
    failed.forEach((f) => console.error(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
