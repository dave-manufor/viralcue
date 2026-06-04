import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ViralCue - AI Co-pilot for Live Streamers",
  description:
    "Real-time viral moment detection and content generation for streamers",
  manifest: "/manifest.json",
  openGraph: {
    title: "ViralCue - AI Co-pilot for Live Streamers",
    description:
      "Real-time viral moment detection and content generation for streamers",
    url: "https://viralcue-api.vercel.app",
    siteName: "ViralCue",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 1200,
        alt: "ViralCue - AI Co-pilot for Live Streamers",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ViralCue - AI Co-pilot for Live Streamers",
    description:
      "Real-time viral moment detection and content generation for streamers",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={inter.className}>
        <body className="antialiased">
          {children}
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                background: "#27272a",
                color: "#fafafa",
                borderRadius: "8px",
              },
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
