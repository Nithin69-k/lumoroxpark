import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage, LegalSection, LegalList } from "@/components/LegalPage";
import { absoluteUrl } from "@/lib/site";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | LUMORO X PARK" },
      {
        name: "description",
        content:
          "What personal data LUMORO X PARK collects, why we collect it, who we share it with, and the rights you have over your data.",
      },
      { property: "og:title", content: "Privacy Policy | LUMORO X PARK" },
      {
        property: "og:description",
        content:
          "Data we collect, payment processing by UPI, sharing with Hosts, retention and your rights.",
      },
      { property: "og:url", content: absoluteUrl("/privacy") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/privacy") }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="27 July 2026"
      intro="Parking Space Management, trading as LUMORO X PARK, acts as the data controller for personal data processed through this platform. This notice explains what we collect, why, who we share it with, and the choices you have."
    >
      <LegalSection heading="1. Who we are">
        <p>
          This platform is operated by <strong>Parking Space Management</strong>, trading as LUMORO
          X PARK. Parking Space Management is the data controller responsible for personal data
          processed through the service, and any reference to LUMORO X PARK in this notice means
          Parking Space Management.
        </p>
      </LegalSection>

      <LegalSection heading="2. Data we collect">
        <p>We collect personal data necessary to operate a secure marketplace, including:</p>
        <LegalList
          items={[
            "identity and contact data — name, email address, contact number, profile photo;",
            "account data — login credentials, host or driver status, ratings and trust score;",
            "vehicle data — licence plate number, make and model, used for booking verification;",
            "location data — precise geolocation, used to display nearby parking options and listing addresses;",
            "transaction data — bookings, cancellations, payouts, disputes and support messages;",
            "technical data — device identifiers, IP address and usage telemetry.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Why we use it and our legal basis">
        <LegalList
          items={[
            "To create your account and provide the booking, hosting and check-in service — performance of our contract with you.",
            "To process payments, payouts and refunds — performance of our contract and legal obligation.",
            "To prevent fraud, resolve disputes and keep the platform secure — our legitimate interests.",
            "To improve the product and provide customer support — our legitimate interests.",
            "To send marketing communications — your consent, which you can withdraw at any time.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Payment processing">
        <p>
          Payments on LUMORO X PARK are collected by UPI transfer to the business's bank account
          through your own UPI app. LUMORO X PARK does not store credit card numbers or banking
          credentials on its own servers, and refunds are issued by UPI transfer to the account the
          payment came from.
        </p>
      </LegalSection>

      <LegalSection heading="5. Third-party sharing">
        <p>We share personal data only with:</p>
        <LegalList
          items={[
            "the booked Host — necessary vehicle details (licence plate, make, model) and Driver contact info, to ensure legitimate property access and security verification;",
            "the Driver — the Host's contact details and space access instructions for the booked window;",
            "our bank, which receives UPI payments for bookings, Host Pro subscriptions and payouts;",
            "service providers and subprocessors that host our infrastructure, provide mapping, and support customer service;",
            "professional advisers (legal and accounting) and authorities, where required by law.",
          ]}
        />
        <p>We do not sell your personal data.</p>
      </LegalSection>

      <LegalSection heading="6. Retention">
        <p>
          We keep personal data only as long as needed for the purposes above. Booking, payout and
          dispute records are retained for as long as required for tax, accounting and
          fraud-prevention purposes, after which data is deleted or anonymised. Closing your account
          removes your profile from the marketplace.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your rights">
        <p>
          Subject to the law applicable to you, you may request access to your data, correction of
          inaccurate data, deletion, restriction of processing, portability, and you may object to
          processing or withdraw consent. You also have the right to complain to your local data
          protection authority. We aim to respond to requests within one month.
        </p>
      </LegalSection>

      <LegalSection heading="8. Security">
        <p>
          We apply appropriate technical and organisational measures to protect personal data,
          including encryption in transit, row-level access controls on our database, and restricted
          administrative access. No system can be guaranteed completely secure, so please use a
          strong, unique password.
        </p>
      </LegalSection>

      <LegalSection heading="9. Cookies">
        <p>
          We use essential cookies and local storage to keep you signed in and to remember your
          preferences. Any analytics cookies are used only to understand aggregate product usage.
          You can clear or block cookies in your browser, but essential cookies are required for
          sign-in to work.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <p>
          For any privacy request or question, contact us through the in-app support channel. See
          also our{" "}
          <Link to="/terms" className="font-medium text-primary underline underline-offset-4">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/refunds" className="font-medium text-primary underline underline-offset-4">
            Refund &amp; Cancellation Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
