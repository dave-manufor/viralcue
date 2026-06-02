"use client";

import {
  SidebarProvider,
  useSidebar,
} from "@/components/layout/sidebar-context";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { ContextOnboardingModal } from "@/components/context-onboarding-modal";
import { motion } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";

function useMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const isMobile = useMobile();
  const authFetch = useAuthFetch();

  // Check if we should show the onboarding modal
  const checkOnboarding = useCallback(async () => {
    try {
      const response = await authFetch("/api/auth/me");
      if (response.ok) {
        const data = await response.json();
        // Show modal if not dismissed and no active context
        if (!data.contextPromptDismissed && !data.hasActiveContext) {
          setShowOnboarding(true);
        }
      }
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
    } finally {
      setOnboardingChecked(true);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!onboardingChecked) {
      checkOnboarding();
    }
  }, [onboardingChecked, checkOnboarding]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  const handleOnboardingDismiss = () => {
    setShowOnboarding(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Navigation */}
      <MobileHeader onOpen={() => setMobileMenuOpen(true)} />
      <MobileSidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          paddingLeft: isMobile ? 0 : collapsed ? 80 : 280,
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="min-h-screen pt-16 md:pt-0"
      >
        {children}
      </motion.main>

      {/* Context Onboarding Modal */}
      <ContextOnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        onDismiss={handleOnboardingDismiss}
      />
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}
