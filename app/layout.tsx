import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

/** Narro's typeface, display and text alike — one family, two weights apart.
 *  latin-ext carries ľ š č ť ž ý á í é. */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Narro — the city tells its own story, out loud",
  description:
    "An AI guide that narrates the street you're standing on, in real time, in your ear.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Narro",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
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
      className={`${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
