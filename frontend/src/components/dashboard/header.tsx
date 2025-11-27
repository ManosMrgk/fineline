"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
];

function GraphLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-5 w-5 text-primary", className)}
      aria-hidden="true"
    >
      {/* Background grid-ish shape */}
      <rect
        x="3"
        y="4"
        width="18"
        height="14"
        rx="3"
        className="fill-primary/5"
      />
      {/* Bars */}
      <rect x="6" y="11" width="2" height="5" className="fill-primary/70" />
      <rect x="11" y="9" width="2" height="7" className="fill-primary" />
      <rect x="16" y="7" width="2" height="9" className="fill-primary/80" />
      {/* Trend line */}
      <path
        d="M5.5 15L9.5 11.5L12.5 13L17.5 8.5"
        className="stroke-primary"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8">
        {/* Left: Brand */}
        <div className="flex items-center gap-2">
          <GraphLogo />
          <span className="text-lg font-semibold tracking-tight">
            FineLine
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-4 text-sm sm:flex">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "transition-colors hover:text-foreground",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: hamburger (mobile) */}
        <div className="flex items-center gap-2 sm:hidden">
          <MobileNav />
        </div>

        {/* Optional: also show sidebar trigger on desktop */}
        <div className="hidden sm:flex sm:items-center sm:gap-2">
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full"
        >
          <Menu className="h-4 w-4" />
          <span className="sr-only">Open navigation menu</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-full flex-col">
          {/* Title + description for a11y */}
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <GraphLogo />
              <span>FineLine</span>
            </SheetTitle>
            <SheetDescription className="sr-only">
              Sidebar navigation for FineLine with options Dashboard and
              Transactions.
            </SheetDescription>
          </SheetHeader>

          {/* Sidebar nav items */}
          <nav className="flex flex-1 flex-col gap-1 px-2 py-3 text-sm">
            {navItems.map((item) => (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </Link>
              </SheetClose>
            ))}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
