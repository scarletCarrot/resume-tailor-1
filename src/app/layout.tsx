import { Source_Serif_4, DM_Sans } from "next/font/google";
import "./globals.css";
import type { Metadata } from "next";

const display = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Resume Tailor",
  description:
    "Scrape job posts, extract the JD, and generate ATS-optimized resumes and cover letters.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
