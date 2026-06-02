"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useUser, UserButton } from "@clerk/nextjs";
import {
  Zap,
  LayoutDashboard,
  Radio,
  Tv,
  Link2,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Streams", href: "/streams", icon: Tv },
  { name: "Live", href: "/live", icon: Radio },
  { name: "Affiliate Links", href: "/affiliates", icon: Link2 },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const displayName = user?.firstName || user?.username || "Streamer";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden"
          />

          {/* Sidebar Drawer */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-zinc-200 flex flex-col md:hidden"
          >
            {/* Header */}
            <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-200">
              <Link
                href="/"
                className="flex items-center gap-3"
                onClick={onClose}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-zinc-900">
                  ViralCue
                </span>
              </Link>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4">
              {navigation.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative",
                      isActive
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                    )}
                  >
                    {isActive && (
                      <div className="absolute inset-0 bg-zinc-100 rounded-lg -z-10" />
                    )}
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User Config */}
            <div className="border-t border-zinc-200 p-4 bg-zinc-50">
              <div className="flex items-center gap-3">
                <UserButton afterSignOutUrl="/login" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {user?.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
