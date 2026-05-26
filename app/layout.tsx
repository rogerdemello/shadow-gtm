import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shadow GTM — Live Web Intelligence for Revenue Teams",
  description:
    "Autonomous AI agents that monitor the live web via Bright Data and turn competitor movement into ranked GTM plays.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
