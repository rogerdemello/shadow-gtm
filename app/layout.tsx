import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shadow GTM — Live Web Intelligence for Revenue Teams",
  description:
    "Autonomous AI that monitors the live web with Gemini grounding and turns competitor movement into ranked, explained GTM plays.",
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
