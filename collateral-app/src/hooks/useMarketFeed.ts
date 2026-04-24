import { useEffect, useRef } from "react";
import { useDomain, useDispatch } from "@/domain/store";
import type { Asset } from "@/domain/types";

// Realistic bond volatility parameters
const NORMAL_VOL = 0.0002;  // ±2bp per 5s tick (IG sovereign bonds)
const STRESS_VOL = 0.005;   // ±50bp shock, fires ~every 5 minutes
const TICK_MS    = 5_000;

export function useMarketFeed() {
  const dispatch  = useDispatch();
  const { assets } = useDomain();

  const assetsRef = useRef<Asset[]>(assets);
  useEffect(() => { assetsRef.current = assets; }, [assets]);

  useEffect(() => {
    const tick = setInterval(() => {
      const current = assetsRef.current;
      if (!current || current.length === 0) return; // guard: don't fire before assets load
      const isStress = Math.random() < (1 / 60);
      const vol = isStress ? STRESS_VOL : NORMAL_VOL;
      const updated = current.map((a) => ({
        ...a,
        marketValue: Math.round(a.marketValue * (1 + (Math.random() - 0.5) * 2 * vol)),
      }));
      dispatch({ type: "ASSETS_BULK_UPDATED", payload: updated });
    }, TICK_MS);
    return () => clearInterval(tick);
  }, [dispatch]);
}
