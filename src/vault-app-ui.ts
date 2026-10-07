import { useStore } from "@/lib/store";

/** Re-reads the store after a restore replaced the database rows (docs/vault.md §2.1). */
export function useVaultRefresh(): () => void {
  const { refresh } = useStore();
  return refresh;
}
