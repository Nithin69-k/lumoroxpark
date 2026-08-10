import { useCallback, useState } from "react";

export type GeolocationState = {
  coords: { lat: number; lng: number } | null;
  status: "idle" | "locating" | "ready" | "denied" | "error";
  error: string | null;
};

/**
 * Browser geolocation with a friendly status. Call `locate()` on mount or from
 * a button; failures are surfaced as messages, never thrown.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    coords: null,
    status: "idle",
    error: null,
  });

  const locate = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        coords: null,
        status: "error",
        error: "This browser can't share your location.",
      });
      return Promise.resolve(null);
    }
    setState({ coords: null, status: "locating", error: null });
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const coords = { lat: p.coords.latitude, lng: p.coords.longitude };
          setState({ coords, status: "ready", error: null });
          resolve(coords);
        },
        (err) => {
          const message =
            err.code === err.PERMISSION_DENIED
              ? "Location access is blocked. Allow it in your browser to search near you."
              : err.code === err.TIMEOUT
                ? "Getting your location timed out — try again."
                : "We couldn't work out where you are.";
          setState({
            coords: null,
            status: err.code === err.PERMISSION_DENIED ? "denied" : "error",
            error: message,
          });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 120000 },
      );
    });
  }, []);

  return { ...state, locate };
}
