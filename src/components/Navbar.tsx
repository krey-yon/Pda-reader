"use client";

import React, { useEffect, useState } from "react";
import Balance from "./Balance";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function Navbar() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav className="w-full border-b border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-black/40 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-lg font-semibold">PDA Reader</div>
          <div className="text-sm text-neutral-500">Devnet</div>
        </div>

        <div className="flex items-center gap-4">
          <Balance />
          {mounted && <WalletMultiButton />}
        </div>
      </div>
    </nav>
  );
}
