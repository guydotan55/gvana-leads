import NavBar from "@/components/NavBar";
import BackToTop from "@/components/BackToTop";
import ScrollAnchor from "@/components/ScrollAnchor";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <ScrollAnchor />
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
      <BackToTop />
    </div>
  );
}
