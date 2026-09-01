import { AppIcon } from "@/lib/branding/icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS takes the home-screen icon from <link rel="apple-touch-icon">, which this
// file convention emits — not from the web app manifest.
export default function AppleIcon() {
  return AppIcon({ size: 180 });
}
