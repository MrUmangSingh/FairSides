import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SmoothScroll } from "@/components/smooth-scroll";
import "./globals.css";

// One variable family: regular width for reading, stretched wide for headlines.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: { default: "Fairsides — fair teams for pickup football", template: "%s — Fairsides" },
  description:
    "Create a match, let players join, and split them into two balanced teams by skill and position.",
};

export const viewport: Viewport = { themeColor: "#05090b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-chalk focus:px-3 focus:py-2 focus:text-turf-deep"
        >
          Skip to content
        </a>
        <SmoothScroll />
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="chalk-rule mt-24">
          <div className="mx-auto max-w-7xl px-5 py-8 text-sm text-chalk-dim">
            Fairsides keeps everything in this browser for now. Accounts and shared matches arrive
            with the next release.
          </div>
        </footer>
      </body>
    </html>
  );
}
