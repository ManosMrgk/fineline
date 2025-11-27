"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSpendingData } from "@/lib/spending-store";

export default function PersistenceBanner() {
  const { persistenceEnabled, setPersistenceEnabled } = useSpendingData();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mode = localStorage.getItem("fineline_persist_mode");
    if (!mode) {
      setVisible(true);
    }
  }, []);

  if (!visible || persistenceEnabled) return null;

  const handleAccept = () => {
    setPersistenceEnabled(true);
    setVisible(false);
  };

  const handleDecline = () => {
    setPersistenceEnabled(false);
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:px-6 sm:pb-6 pointer-events-none">
      <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-border/70 bg-background/95 p-4 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">
            Save your data on this device?
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            FineLine can store your imported transactions in your browser&apos;s
            local storage so you don&apos;t lose them when you refresh. Your
            data never leaves this device.
          </p>
        </div>

        <div className="flex flex-row justify-end gap-2 sm:flex-row sm:gap-3">
          <Button size="sm" onClick={handleAccept} className="px-4">
            Allow saving
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDecline}
            className="px-4"
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
