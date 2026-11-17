import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { SITE_NAME } from "@/lib/env";
import "./globals.css";

const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: "Games made by our family, for our family.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffd23f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
