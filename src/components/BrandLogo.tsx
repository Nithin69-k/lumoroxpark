// Bundled through Vite so the artwork ships with the deployment itself.
import logoUrl from "@/assets/lumorox-park-logo.png";
import logoDarkUrl from "@/assets/lumorox-park-logo-dark.png";
import markUrl from "@/assets/lumorox-park-mark.png";
import markDarkUrl from "@/assets/lumorox-park-mark-dark.png";
import { cn } from "@/lib/utils";

/**
 * Brand lockup. `variant="mark"` renders only the circular P mark,
 * `variant="full"` renders the full LUMORO X PARK lockup.
 *
 * The artwork is transparent, so it blends into whatever surface it sits on.
 * A light-ink copy is swapped in under `.dark` so nothing is lost on dark
 * headers.
 */
export function BrandLogo({
  variant = "full",
  className,
}: {
  variant?: "full" | "mark";
  className?: string;
}) {
  const isMark = variant === "mark";
  const light = isMark ? markUrl : logoUrl;
  const dark = isMark ? markDarkUrl : logoDarkUrl;
  const base = cn(isMark ? "h-8 w-8" : "h-8 w-auto", "select-none object-contain", className);

  return (
    <>
      <img
        src={light}
        alt="LumoroX Park"
        className={cn(base, "block dark:hidden")}
        loading="eager"
        decoding="async"
      />
      <img
        src={dark}
        alt=""
        aria-hidden="true"
        className={cn(base, "hidden dark:block")}
        loading="eager"
        decoding="async"
      />
    </>
  );
}
