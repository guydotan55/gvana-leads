import Script from "next/script";
import NavBar from "@/components/NavBar";
import BackToTop from "@/components/BackToTop";
import ScrollAnchor from "@/components/ScrollAnchor";

// Runs before React hydrates. Disables browser scroll restoration
// (so refresh / back-nav don't drop the user mid-page) and slams
// scroll to 0 BEFORE the page renders. The React-side ScrollAnchor
// is the second layer that handles post-paint reflow.
const SCROLL_INIT_SCRIPT = `
try {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
} catch (e) {}
`;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50" style={{ overflowAnchor: "none" }}>
      <Script id="dash-scroll-init" strategy="beforeInteractive">
        {SCROLL_INIT_SCRIPT}
      </Script>
      <ScrollAnchor />
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
      <BackToTop />
    </div>
  );
}
