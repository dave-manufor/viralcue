"use client";

import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/80 backdrop-blur-sm px-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
        {description && <p className="text-sm text-zinc-500">{description}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-500">
          <Search className="h-5 w-5" />
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-zinc-500 relative"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
            3
          </span>
        </Button>

        {/* Live Status */}
        <Badge variant="success" className="gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Extension Active
        </Badge>
      </div>
    </header>
  );
}
