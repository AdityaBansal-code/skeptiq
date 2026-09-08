import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brandConfig } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brandConfig.name} · ${brandConfig.descriptor}`,
  description:
    "Simulate autonomous AI focus groups to stress-test venture ideas, pricing, and adoption before building.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased font-sans selection:bg-butter selection:text-ink">
        {children}
      </body>
    </html>
  );
}
