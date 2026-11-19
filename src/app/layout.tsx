import type { Metadata, Viewport } from "next";
import { Bungee, Gochi_Hand, Lexend } from "next/font/google";
import { SITE_NAME } from "@/lib/env";
import "./globals.css";

const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"] });
const bungee = Bungee({ variable: "--font-bungee", subsets: ["latin"], weight: "400" });
const gochi = Gochi_Hand({ variable: "--font-gochi", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: "Games made by our family, for our family.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1b1446",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${lexend.variable} ${bungee.variable} ${gochi.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
