import type { Metadata } from "next";
import "./globals.css";
import "./monitor.css";

export const metadata: Metadata = {
  title: "PactPilot | Living commercial assurance",
  description: "Checkpoint-bounded commercial obligation monitoring on GenLayer.",
  icons: { icon: "/pactpilot-logo.jpg", apple: "/pactpilot-logo.jpg" },
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
