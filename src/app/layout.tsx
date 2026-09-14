import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ExitKeeper | Deterministic Lido withdrawals",
  description:
    "Wayfinder-powered Lido withdrawals, deterministically executed by KeeperHub.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      className={cn("font-sans", geist.variable, geistMono.variable)}
      lang="en"
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
