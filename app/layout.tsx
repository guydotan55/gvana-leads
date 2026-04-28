import type { Metadata, Viewport } from "next";
import { clientConfig } from "@/client.config";
import "./globals.css";

export const metadata: Metadata = {
  title: clientConfig.name,
  icons: {
    icon: "/logo-color.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: clientConfig.brand.primary,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brandVars = {
    "--brand-primary": clientConfig.brand.primary,
    "--brand-secondary": clientConfig.brand.secondary,
    "--brand-accent": clientConfig.brand.accent,
    "--brand-accent-light": clientConfig.brand.accentLight,
    "--brand-background": clientConfig.brand.background,
  } as React.CSSProperties;

  return (
    <html lang={clientConfig.locale} dir={clientConfig.dir}>
      <body style={brandVars}>
        {children}
      </body>
    </html>
  );
}
