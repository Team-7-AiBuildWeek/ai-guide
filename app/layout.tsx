import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

/** The pairing from smaut.tech: Space Grotesk for display, Inter for reading. */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "latin-ext"], // latin-ext carries ľ š č ť ž ý á í é
  weight: ["500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Walk — audio tours anywhere",
  description:
    "A free audio walking tour of wherever you are, built around what you want to see.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Walk",
    /**
     * Edge to edge on iOS: the page is drawn *under* the status bar rather
     * than below it, which is the difference between an app and a web page
     * with the browser hidden. It only works because every fixed edge in this
     * app already pads with `env(safe-area-inset-*)` — without that the first
     * line of the sheet would sit under the clock.
     */
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f9fafb",
  width: "device-width",
  initialScale: 1,
  // Zoom stays unlocked on purpose — a 55-year-old may want to pinch.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
