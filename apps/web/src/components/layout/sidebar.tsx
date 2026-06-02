"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useUser, UserButton } from "@clerk/nextjs";
import {
  Zap,
  LayoutDashboard,
  Radio,
  Tv,
  Link2,
  Settings,
  ChevronLeft,
  ChevronRight,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/layout/sidebar-context";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Streams", href: "/streams", icon: Tv },
  { name: "Live", href: "/live", icon: Radio },
  { name: "Stream History", href: "/stream-history", icon: History },
  { name: "Affiliate Links", href: "/affiliates", icon: Link2 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed } = useSidebar();
  const { user, isLoaded } = useUser();

  const displayName = user?.firstName || user?.username || "Streamer";

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 280 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 z-40 h-screen border-r border-zinc-200 bg-white hidden md:flex flex-col"
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-200">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900">
            <Zap className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg font-bold text-zinc-900"
            >
              ViralCue
            </motion.span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className="h-8 w-8"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          // Strict match for root, prefix match for others
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative",
                isActive
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute inset-0 bg-zinc-100 rounded-lg"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <item.icon
                className={cn("h-5 w-5 relative z-10", collapsed && "mx-auto")}
              />
              {!collapsed && <span className="relative z-10">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Section - Clerk UserButton */}
      <div className="border-t border-zinc-200 p-4">
        <div
          className={cn(
            "flex items-center gap-3",
            collapsed && "justify-center"
          )}
        >
          <UserButton
            afterSignOutUrl="/login"
            appearance={{
              elements: {
                avatarBox: "h-9 w-9",
              },
            }}
          />
          {!collapsed && isLoaded && user && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 truncate">
                {displayName}
              </p>
              <p className="text-xs text-zinc-500 truncate">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
