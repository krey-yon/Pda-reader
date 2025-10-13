"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export default function Balance() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let subId: number | null = null;
    async function fetchBalance() {
      if (!publicKey) {
        setBalance(null);
        return;
      }
      try {
        const lamports = await connection.getBalance(publicKey);
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (e) {
        console.error("failed to fetch balance", e);
        setBalance(null);
      }
    }

    fetchBalance();

    // subscribe to slot changes to keep balance fresh
    if (publicKey) {
      subId = connection.onSlotChange(() => {
        fetchBalance();
      }) as unknown as number;
    }

    return () => {
      if (subId != null) connection.removeSlotChangeListener?.(subId);
    };
  }, [publicKey, connection]);

  if (!publicKey) return null;

  return (
    <div className="flex items-center gap-3 text-sm font-medium">
      <span className="text-xs text-neutral-500">Balance</span>
      <span>{balance == null ? "—" : `${balance.toFixed(4)} SOL`}</span>
    </div>
  );
}
