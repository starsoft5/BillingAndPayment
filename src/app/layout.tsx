import type { Metadata } from "next";
import "./tailwind.css";

export const metadata: Metadata = {
  title: "Memberly — Member portal",
  description: "A clear, simple way to manage your members.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
