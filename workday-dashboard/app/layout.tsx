import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workday Admin Dashboard",
  description: "FreshService ticket dashboard for the Workday admin team",
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
