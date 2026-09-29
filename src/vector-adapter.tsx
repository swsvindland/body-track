import type { ReactNode } from "react";
import { VectorProvider } from "@/vector";
import { useStore } from "@/lib/store";

/** The kit's provider, fed from the store (KIT §5). No expo-haptics here, so the kit's haptics stay silent. */
export function VectorAdapter({ children }: { children: ReactNode }) {
  const { language } = useStore();
  return <VectorProvider language={language}>{children}</VectorProvider>;
}
