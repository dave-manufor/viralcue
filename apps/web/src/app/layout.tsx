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
