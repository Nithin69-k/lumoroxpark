import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, LegalSection, LegalList } from "@/components/LegalPage";
import { absoluteUrl } from "@/lib/site";

export const Route = createFileRoute("/refunds")({
  head: () => ({
    meta: [
      { title: "Refund & Cancellation Policy | LUMORO X PARK" },
      {
        name: "description",
        content:
          "How cancellations, refunds and driver-protection claims work on LUMORO X PARK, including Flexible, Moderate and Strict host policies.",
      },
      { property: "og:title", content: "Refund & Cancellation Policy | LUMORO X PARK" },
      {
        property: "og:description",
        content:
          "Flexible, Moderate and Strict cancellation tiers, no-show rules and driver-protection refunds.",
      },
      { property: "og:url", content: absoluteUrl("/refunds") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/refunds") }],
  }),
  component: RefundPolicyPage,
});

function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      updated="27 July 2026"
      intro="This policy explains when a booking can be cancelled, when money is returned, and how to raise a dispute. It applies to all parking bookings and subscriptions purchased on LUMORO X PARK, operated by Parking Space Management."
    >
      <LegalSection heading="1. Host-controlled cancellations">
        <p>
          Cancellation policies on LUMORO X PARK are set individually by each Host. Drivers must
          review the cancellation tier displayed on the listing before confirming a booking:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-foreground">Flexible:</strong> full refund (including service
              fees) if cancelled up to 1 hour before the scheduled start time.
            </>,
            <>
              <strong className="text-foreground">Moderate:</strong> full refund (including service
              fees) if cancelled up to 12 hours before the scheduled start time.
            </>,
            <>
              <strong className="text-foreground">Strict:</strong> full refund (including service
              fees) if cancelled up to 24 hours before the scheduled start time. No refunds are
              issued for cancellations made less than 24 hours before the start time.
            </>,
          ]}
        />
        <p>
          The applicable tier is shown on the listing page, on your booking, and in the cancellation
          dialog before you confirm.
        </p>
      </LegalSection>

      <LegalSection heading="2. Late cancellations and no-shows">
        <p>
          If a Driver cancels after the Host's specified deadline, or fails to show up for the
          booking, no refund is issued and the Host is credited their earnings according to the
          platform terms.
        </p>
      </LegalSection>

      <LegalSection heading="3. Driver protection & disputes">
        <p>Drivers are eligible for a 100% full refund regardless of the Host's policy if:</p>
        <LegalList
          items={[
            "the designated parking space is inaccessible, occupied by another vehicle, or does not exist; or",
            "the space drastically misrepresents the description provided in the listing.",
          ]}
        />
        <p>
          To claim a driver-protection refund, the Driver must file a formal dispute through the
          LUMORO X PARK app within 24 hours of the booking's scheduled end time. Host earnings are
          held in escrow during this period to ensure safe resolution.
        </p>
      </LegalSection>

      <LegalSection heading="4. Host Pro subscriptions">
        <p>
          Host Pro subscriptions are separate from parking bookings. You may cancel a subscription
          at any time from your billing settings; access continues until the end of the paid billing
          period. If you are not satisfied with a subscription payment, you can request a full
          refund within 30 days of the charge date.
        </p>
      </LegalSection>

      <LegalSection heading="5. How refunds are processed">
        <p>
          Payments on LUMORO X PARK are collected by UPI transfer to the business's UPI ID from your
          own UPI app. Approved refunds are issued by LUMORO X PARK by UPI transfer to the account
          the payment came from. Once a refund is issued, it typically appears within 5–10 business
          days, depending on your bank.
        </p>
        <p>
          You can contact our support team through the app for any questions about a refund or a
          billing receipt.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
