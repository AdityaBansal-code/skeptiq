"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

interface AppTabsContainerProps {
  userEmail: string;
  children: ReactNode;
}

/** Keeps the existing shell entry point while route segments own navigation. */
export function AppTabsContainer({ userEmail, children }: AppTabsContainerProps) {
  return <AppShell userEmail={userEmail}>{children}</AppShell>;
}
