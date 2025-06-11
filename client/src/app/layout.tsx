// File: ./src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastContainer, ToastProvider } from "@/app/components/core/ToastNotification"; // Updated import for ToastProvider
import { SRSProvider } from '@/contexts/SRSContext'; // Import SRSProvider

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ankidemy",
  description: "Learn with spaced repetition for hierarchical knowledge structures",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
     <ToastProvider>
       <SRSProvider>{children}</SRSProvider>
       <ToastContainer />
     </ToastProvider>
      </body>
    </html>
  );
}
