// app/page.tsx — Root route
// Do not import or render `./layout` here; Next.js wraps pages with layout automatically.
import Landing from "@/app/components/Landing";

export default function Home() {
  return <Landing />;
}
