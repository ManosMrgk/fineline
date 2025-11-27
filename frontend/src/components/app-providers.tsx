"use client";

import React from "react";
import { SpendingDataProvider } from "@/lib/spending-store";
import PersistenceBanner from "@/components/persistence-banner";

type Props = {
  children: React.ReactNode;
};

export function AppProviders({ children }: Props) {
  return (
    <SpendingDataProvider>
      {children}
      <PersistenceBanner />
    </SpendingDataProvider>
  );
}
