import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PortfolioProvider } from "@/context/PortfolioContext";
import { AuthProvider } from "@/context/AuthContext";
import ConditionalNavbar from "@/components/ConditionalNavbar";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sanal Yatırım - Finansal Oyun",
  description: "Gerçek piyasa verileriyle sanal yatırım yapın, portföyünüzü büyütün ve liderlik tablosunda yarışın!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100`}
      >
        <AuthProvider>
          <PortfolioProvider>
            <ConditionalNavbar />
            <main>{children}</main>
            <Footer />
          </PortfolioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
