import { Splash } from "@/components/ui/Splash";

/** Shown during the server render gap (auth check in page.tsx) before HTML streams. */
export default function Loading() {
  return <Splash />;
}
