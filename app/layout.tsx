// app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lab 15: Deep Agents",
  description: "Harness și Deep Agent: planificare, fișiere, memory",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
