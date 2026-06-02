"use client";

import { Menu, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileHeaderProps {
  onOpen: () => void;
}

export function MobileHeader({ onOpen }: MobileHeaderProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/80 px-4 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onOpen} className="-ml-2">
          <Menu className="h-6 w-6" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-zinc-900">ViralCue</span>
        </div>
      </div>
    </div>
  );
}
