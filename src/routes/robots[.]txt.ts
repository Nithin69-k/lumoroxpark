import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const rules = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /auth",
          "Disallow: /reset-password",
          "Disallow: /onboarding",
          "Disallow: /profile",
          "Disallow: /activity",
          "Disallow: /bookings",
          "Disallow: /host",
          "Disallow: /admin",
          "Disallow: /messages",
          "Disallow: /notifications",
          "",
          `Sitemap: ${SITE_URL}/sitemap.xml`,
        ];
        const body = rules.join("\n") + "\n";
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
