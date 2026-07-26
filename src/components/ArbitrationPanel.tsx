"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { createPublicClient, createWalletClient, http, custom, formatEther } from "viem";
import { CONTRACT_ADDRESS, escrowAbi } from "@/lib/abi";
import { isLegacyContract } from "@/lib/escrow";
import {
  Loader2, Scale, ExternalLink, AlertTriangle, RefreshCw, Inbox, MessageSquare,
} from "lucide-react";
import Link from "next/link";

const RPC = "https://testnet-rpc.monad.xyz";
const MONAD_CHAIN = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } },
};

/** How far back to scan for open disputes. */
const SCAN_LIMIT = 150;

type Disputed = {
  id: number;
  buyer: string;
  seller: string;
  amount: bigint;
  metadata: string;
  feeBps: number;
};

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

export default function ArbitrationPanel() {
  const account = useActiveAccount();

  const [disputes, setDisputes] = useState<Disputed[]>([]);
  const [arbitrator, setArbitrator] = useState<string>("");
  const [legacy, setLegacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  // Per-trade UI state: the split the agent is proposing, keyed by trade id.
  const [splits, setSplits] = useState<Record<number, number>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setScanning(true);
    setError("");
    try {
      const pub = createPublicClient({ chain: MONAD_CHAIN as any, transport: http(RPC) });

      // The old contract has no disputes at all — say so rather than showing an
      // empty list that looks like everything is fine.
      if (await isLegacyContract(pub as any)) {
        setLegacy(true);
        setDisputes([]);
        return;
      }
      setLegacy(false);

      const [nextId, arb] = await Promise.all([
        pub.readContract({ address: CONTRACT_ADDRESS, abi: escrowAbi, functionName: "nextTradeId" }) as Promise<bigint>,
        pub.readContract({ address: CONTRACT_ADDRESS, abi: escrowAbi, functionName: "arbitrator" }) as Promise<string>,
      ]);
      setArbitrator(arb);

      const total = Number(nextId);
      const start = Math.max(0, total - SCAN_LIMIT);

      const reads = [];
      for (let i = total - 1; i >= start; i--) {
        reads.push(
          pub
            .readContract({ address: CONTRACT_ADDRESS, abi: escrowAbi, functionName: "trades", args: [BigInt(i)] })
            .then((r) => ({ i, r: r as any }))
            .catch(() => null)
        );
      }

      const rows = await Promise.all(reads);
      const open: Disputed[] = [];
      for (const row of rows) {
        if (!row) continue;
        const { i, r } = row;
        const [buyer, seller, amount, released, , metadata, , , disputed, refunded, feeBps] = r;
        if (disputed && !released && !refunded) {
          open.push({ id: i, buyer, seller, amount, metadata, feeBps: Number(feeBps) });
        }
      }
      setDisputes(open);
    } catch (err) {
      console.error(err);
      setError("Couldn't read disputes from Monad. Check the RPC and the contract address.");
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isArbitrator =
    !!account?.address && !!arbitrator &&
    account.address.toLowerCase() === arbitrator.toLowerCase();

  const resolve = async (trade: Disputed) => {
    if (!account || !window.ethereum) {
      setError("Connect the arbitrator wallet first.");
      return;
    }
    const buyerPct = splits[trade.id] ?? 50;

    setBusyId(trade.id);
    setError("");
    try {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x279f" }],
        });
      } catch (e) {
        if ((e as { code?: number }).code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x279f",
              chainName: "Monad Testnet",
              nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
              rpcUrls: [RPC],
            }],
          });
        } else {
          throw new Error("Switch your wallet to Monad Testnet.");
        }
      }

      const walletClient = createWalletClient({ chain: MONAD_CHAIN as any, transport: custom(window.ethereum) });
      const pub = createPublicClient({ chain: MONAD_CHAIN as any, transport: http(RPC) });

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: escrowAbi,
        functionName: "resolveDispute",
        args: [BigInt(trade.id), buyerPct * 100], // percent → basis points
        account: account.address as `0x${string}`,
        chain: MONAD_CHAIN as any,
      });
      await pub.waitForTransactionReceipt({ hash });

      // Leave a record in the trade's chat so both parties see the outcome.
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId: String(trade.id),
          sender: "Admin",
          address: "admin",
          isAdmin: true,
          text:
            buyerPct === 100 ? "Dispute resolved: full refund to the buyer."
            : buyerPct === 0 ? "Dispute resolved: funds released to the seller."
            : `Dispute resolved: ${buyerPct}% refunded to the buyer, ${100 - buyerPct}% released to the seller.`,
        }),
      }).catch(() => {});

      await load();
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      setError(e.shortMessage || e.message || "Transaction failed.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-900 dark:text-white" />
      </div>
    );
  }

  if (legacy) {
    return (
      <div className="anim-fade-up anim-delay-2 flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertTriangle className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
        <p className="text-sm font-black text-zinc-900 dark:text-white">Disputes aren&apos;t available yet</p>
        <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
          You&apos;re still on the original escrow contract, which has no dispute or fee
          support. Deploy <span className="font-mono">VeriPayEscrow.sol</span> (see
          contracts/README.md) and set <span className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</span>,
          then this panel goes live.
        </p>
      </div>
    );
  }

  return (
    <div className="anim-fade-up anim-delay-2">
      {/* Arbitrator status */}
      <div className="mb-5 p-4 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Arbitrator wallet</p>
            <p className="text-xs font-mono font-bold text-zinc-900 dark:text-white break-all">
              {arbitrator ? short(arbitrator) : "—"}
            </p>
          </div>
          <button
            onClick={load}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} /> Rescan
          </button>
        </div>

        {!account ? (
          <p className="mt-3 text-[11px] font-bold text-zinc-500">
            Connect your wallet (top right) to settle disputes. Rulings are signed on-chain, so
            the passcode alone isn&apos;t enough.
          </p>
        ) : !isArbitrator ? (
          <div className="mt-3 flex items-start gap-2 text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Connected as {short(account.address)}, which is not the arbitrator. You can review
              disputes but not settle them. Use the arbitrator wallet, or call
              <span className="font-mono"> setArbitrator </span> on the contract.
            </span>
          </div>
        ) : (
          <p className="mt-3 text-[11px] font-bold text-zinc-900 dark:text-white">
            Connected as arbitrator — you can settle these.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-medium text-zinc-900 dark:text-white">
          ⚠️ {error}
        </div>
      )}

      {disputes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Inbox className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
          <p className="text-sm text-zinc-400 font-medium">No open disputes.</p>
          <p className="text-xs text-zinc-400 max-w-xs">
            When a buyer or seller reports a problem, the trade freezes and shows up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => {
            const buyerPct = splits[d.id] ?? 50;
            const buyerWei = (d.amount * BigInt(buyerPct)) / BigInt(100);
            const sellerGross = d.amount - buyerWei;
            const fee = (sellerGross * BigInt(d.feeBps)) / BigInt(10000);
            const sellerNet = sellerGross - fee;

            return (
              <div key={d.id} className="p-4 rounded-2xl bg-white dark:bg-zinc-900/70 border border-zinc-900 dark:border-white">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-zinc-900 dark:text-white" />
                    <span className="text-sm font-black text-zinc-900 dark:text-white">Trade #00{d.id}</span>
                    <span className="text-xs font-bold text-zinc-500">{formatEther(d.amount)} MON</span>
                  </div>
                  <Link
                    href={`/trade/${d.id}/chat`}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  >
                    <MessageSquare className="w-3 h-3" /> Read the thread
                  </Link>
                </div>

                <p className="text-xs text-zinc-600 dark:text-zinc-400 italic mb-3 leading-relaxed">
                  &ldquo;{d.metadata}&rdquo;
                </p>

                <div className="grid grid-cols-2 gap-3 mb-4 text-[10px]">
                  <div>
                    <p className="font-black uppercase tracking-widest text-zinc-400">Buyer</p>
                    <p className="font-mono text-zinc-900 dark:text-white break-all">{short(d.buyer)}</p>
                  </div>
                  <div>
                    <p className="font-black uppercase tracking-widest text-zinc-400">Seller</p>
                    <p className="font-mono text-zinc-900 dark:text-white break-all">{short(d.seller)}</p>
                  </div>
                </div>

                {/* Split control */}
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">
                  How much goes back to the buyer?
                </p>
                <input
                  type="range" min={0} max={100} step={5} value={buyerPct}
                  onChange={(e) => setSplits((s) => ({ ...s, [d.id]: Number(e.target.value) }))}
                  className="w-full accent-zinc-900 dark:accent-white mb-2"
                />
                <div className="flex gap-2 mb-3">
                  {[0, 50, 100].map((v) => (
                    <button
                      key={v}
                      onClick={() => setSplits((s) => ({ ...s, [d.id]: v }))}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-colors ${
                        buyerPct === v
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white"
                          : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      {v === 0 ? "Seller wins" : v === 100 ? "Buyer wins" : "Split 50/50"}
                    </button>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 mb-3 text-[11px] font-bold">
                  <div className="flex justify-between text-zinc-700 dark:text-zinc-300">
                    <span>Buyer gets back</span><span>{formatEther(buyerWei)} MON</span>
                  </div>
                  <div className="flex justify-between text-zinc-700 dark:text-zinc-300">
                    <span>Seller receives</span><span>{formatEther(sellerNet)} MON</span>
                  </div>
                  <div className="flex justify-between text-zinc-400 mt-1 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                    <span>Platform fee ({d.feeBps / 100}% of seller&apos;s share)</span>
                    <span>{formatEther(fee)} MON</span>
                  </div>
                </div>

                <button
                  onClick={() => resolve(d)}
                  disabled={!isArbitrator || busyId !== null}
                  className="w-full py-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-xs disabled:opacity-40 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isArbitrator ? "Sign ruling on-chain" : "Arbitrator wallet required"}
                </button>

                <a
                  href={`https://monad-testnet.socialscan.io/address/${CONTRACT_ADDRESS}`}
                  target="_blank" rel="noreferrer"
                  className="mt-2 flex items-center justify-center gap-1.5 text-[10px] font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                >
                  View contract <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
