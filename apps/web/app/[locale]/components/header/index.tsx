"use client";

import { ModeToggle } from "@ai-cfo/design-system/components/mode-toggle";
import { Button } from "@ai-cfo/design-system/components/ui/button";
import type { Dictionary } from "@ai-cfo/internationalization";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { env } from "@/env";
import { LanguageSwitcher } from "./language-switcher";

interface HeaderProps {
  dictionary: Dictionary;
}

/**
 * AI-CFO marketing header. Day-10 trim: dropped the next-forge default
 * navigation menu (Home / Product / Blog / Docs) that pointed at
 * routes we removed. The marketing site is a single-page hero+sections
 * scroll target now; in-page section anchors do the work.
 */
const SECTION_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "What it catches", href: "#anomalies" },
  { label: "FAQ", href: "#faq" },
];

// Keep the prop for layout.tsx call-site stability while the dictionary
// system still surrounds the page; English-only copy on the marketing
// site for the design-partner stage.
// biome-ignore lint/correctness/noUnusedFunctionParameters: signature parity
export const Header = ({ dictionary }: HeaderProps) => {
  const [isOpen, setOpen] = useState(false);

  return (
    <header className="sticky top-0 left-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
        <Link className="flex items-center gap-2" href="/">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border bg-background font-mono font-semibold text-xs tracking-tight">
            ai
          </div>
          <span className="font-semibold text-sm tracking-tight">AI · CFO</span>
        </Link>

        <nav className="hidden gap-6 lg:flex">
          {SECTION_LINKS.map((link) => (
            <Link
              className="text-muted-foreground text-sm transition-colors hover:text-foreground"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden lg:inline">
            <LanguageSwitcher />
          </div>
          <div className="hidden lg:inline">
            <ModeToggle />
          </div>
          <Button
            asChild
            className="hidden lg:inline-flex"
            size="sm"
            variant="ghost"
          >
            <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-in`}>Sign in</Link>
          </Button>
          <Button asChild className="hidden lg:inline-flex" size="sm">
            <Link href="#waitlist">Join the waitlist</Link>
          </Button>
          <Button
            className="lg:hidden"
            onClick={() => setOpen(!isOpen)}
            size="icon"
            variant="ghost"
          >
            {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isOpen ? (
        <div className="container mx-auto flex flex-col gap-3 border-t px-4 py-4 lg:hidden">
          {SECTION_LINKS.map((link) => (
            <Link
              className="text-muted-foreground text-sm transition-colors hover:text-foreground"
              href={link.href}
              key={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex items-center gap-2 pt-2">
            <Button asChild className="flex-1" size="sm" variant="outline">
              <Link href={`${env.NEXT_PUBLIC_APP_URL}/sign-in`}>Sign in</Link>
            </Button>
            <Button asChild className="flex-1" size="sm">
              <Link href="#waitlist">Join waitlist</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
};
