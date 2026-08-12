import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage, LegalSection, LegalList } from "@/components/LegalPage";
import { absoluteUrl } from "@/lib/site";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | LUMORO X PARK" },
      {
        name: "description",
        content:
          "The terms governing use of LUMORO X PARK, the peer-to-peer marketplace connecting parking space Hosts with Drivers.",
      },
      { property: "og:title", content: "Terms of Service | LUMORO X PARK" },
      {
        property: "og:description",
        content:
          "Host and Driver obligations, platform liability, payments and account termination.",
      },
      { property: "og:url", content: absoluteUrl("/terms") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/terms") }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="27 July 2026"
      intro="These terms form an agreement between you and Parking Space Management, the legal entity that owns and operates the LUMORO X PARK platform. By creating an account, listing a space, or booking a space you agree to be bound by them."
    >
      <LegalSection heading="1. Who you are contracting with">
        <p>
          The LUMORO X PARK platform is owned and operated by{" "}
          <strong>Parking Space Management</strong> (&quot;we&quot;, &quot;us&quot;, the
          &quot;Company&quot;), trading as LUMORO X PARK. Parking Space Management is the seller and
          the party you contract with when you use this service. Any reference to LUMORO X PARK in
          these terms means Parking Space Management.
        </p>
        <p>
          LUMORO X PARK is an online peer-to-peer marketplace connecting independent space owners
          ("Hosts") with drivers looking for parking ("Drivers"). Parking Space Management does not
          own, operate, manage, or maintain any physical parking space and holds no liability for
          occurrences on physical properties.
        </p>

        <p>
          By continuing to use the service you accept these terms. If you use the service on behalf
          of an organisation, you confirm you have authority to bind that organisation; otherwise
          you confirm you are of legal age to enter a contract.
        </p>
      </LegalSection>

      <LegalSection heading="2. Host liabilities & obligations">
        <LegalList
          items={[
            "Hosts guarantee they have the legal right, permits, or authority to lease out the designated parking space (for example, complying with landlord rules or local housing society bylaws).",
            "Hosts must ensure the space is safe, vacant, and clear of hazards during the booked window.",
            "Parking Space Management is not responsible for property damage or unauthorised access caused by a Driver.",
            "Hosts must keep listing details, photos, availability, and pricing accurate and up to date.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Driver liabilities & obligations">
        <LegalList
          items={[
            "Drivers must vacate the parking space strictly by the scheduled end time. Overstaying will result in automatic penalty fees billed to the registered card.",
            "Drivers assume full liability for their vehicles, personal belongings, and any physical damage caused to the Host's property while manoeuvring or parking.",
            "Drivers must use the space only for the vehicle and purpose declared at booking.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>You must not misuse the service. In particular, you must not:</p>
        <LegalList
          items={[
            "use the platform for any unlawful purpose;",
            "engage in fraud, spam, or misrepresentation of a listing or booking;",
            "infringe the intellectual property or privacy rights of others;",
            "interfere with the security of the service, including malware, probing, or scraping;",
            "transact off-platform to avoid fees, or circumvent technical limits of your plan.",
          ]}
        />
        <p>
          You are responsible for keeping your account credentials confidential and for all activity
          under your account, and for providing accurate information and keeping it up to date.
        </p>
      </LegalSection>

      <LegalSection heading="5. Intellectual property">
        <p>
          Parking Space Management retains ownership of the service and all associated intellectual
          property, including the software, documentation, and branding. You receive a limited,
          non-exclusive, non-transferable right to use the service within the plan you have
          selected. Reverse engineering, resale, or redistribution of the service is not permitted.
          You grant us a limited licence to host and process the content you upload (such as listing
          photos) solely to operate the service.
        </p>
      </LegalSection>

      <LegalSection heading="6. Payments, fees and subscriptions">
        <p>
          Payments on LUMORO X PARK are collected by UPI transfer to the business's UPI ID, shown on
          the booking and subscription payment QR codes. LUMORO X PARK is the merchant of record for
          all bookings and Host Pro subscriptions sold through the platform, and is responsible for
          fulfilment and refunds.
        </p>
        <p>
          Each payment is matched to your booking or subscription using the transaction reference
          from your UPI app. Refunds are issued by UPI transfer to the account the payment came
          from. Booking cancellations, refunds and disputes are described in our{" "}
          <Link to="/refunds" className="font-medium text-primary underline underline-offset-4">
            Refund &amp; Cancellation Policy
          </Link>
          . Host Pro subscriptions renew automatically at the selected interval until cancelled.
          Platform commission and any reservation fee are shown before you confirm a purchase.
        </p>
      </LegalSection>

      <LegalSection heading="7. Service level and warranties">
        <p>
          The service is provided on an "as available" basis. We do not guarantee uninterrupted or
          error-free performance. To the fullest extent permitted by law, we disclaim all implied
          warranties, including merchantability and fitness for a particular purpose.
        </p>
      </LegalSection>

      <LegalSection heading="8. Liability">
        <p>
          To the fullest extent permitted by law, our aggregate liability is capped at the fees you
          paid to us in the twelve months preceding the claim. We exclude liability for indirect,
          consequential, or special damages, including loss of profits, data, or goodwill. Nothing
          in these terms excludes liability for fraud, death, or personal injury where such
          exclusion is prohibited by law. You indemnify us against claims arising from your content,
          unlawful use of the service, or breach of these terms.
        </p>
      </LegalSection>

      <LegalSection heading="9. Suspension and termination">
        <p>
          We may suspend or terminate access to the service for material breach of these terms,
          non-payment, security or fraud risk, or repeated or serious policy violations. You may
          close your account at any time. On termination, outstanding bookings are settled or
          refunded according to the Refund &amp; Cancellation Policy, and your data is handled as
          described in the Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection heading="10. General">
        <p>
          You may not assign these terms without our consent; we may assign them in connection with
          a merger or acquisition. Neither party is liable for failure to perform due to events
          beyond reasonable control. These terms are governed by the laws of the jurisdiction in
          which Parking Space Management is established, and the courts of that jurisdiction have
          exclusive jurisdiction over any dispute.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
