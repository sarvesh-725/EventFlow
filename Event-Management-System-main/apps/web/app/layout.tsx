import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "EventFlow",
  description: "Multi-organizer event ticketing and check-in platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <Link className="brand" href="/">EventFlow</Link>
            <div className="nav-links">
              <Link className="nav-link" href="/">Discover</Link>
              <Link className="nav-link" href="/organizer/new">Create event</Link>
              <Link className="button secondary" href="/login">Sign in</Link>
            </div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
