import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Blue Vending",
  description: "Blue Vending Machine <3",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Blue Vending",
    description: "Blue Vending Machine <3",
    type: "website",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Blue Vending",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blue Vending",
    description: "Blue Vending Machine <3",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${displayFont.variable} ${monoFont.variable}`}>
      <body className="bg-[#eff7ff] font-[var(--font-display)] text-slate-900">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface">
          <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link
              href="/"
              className="text-xl font-semibold tracking-tight text-slate-900"
            >
              <span className="text-[#2057d5]">Blue</span> Vending
            </Link>
            <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-surface p-1 text-sm font-medium text-slate-900">
              <Link
                href="/"
                className="rounded px-3 py-1.5 transition hover:bg-[#eff7ff] hover:text-[#2057d5]"
              >
                Machine
              </Link>
              <Link
                href="/admin"
                className="rounded px-3 py-1.5 transition hover:bg-[#eff7ff] hover:text-[#2057d5]"
              >
                Admin
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto min-h-screen w-full max-w-6xl bg-[#eff7ff] px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
