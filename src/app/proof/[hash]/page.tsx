"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createPublicClient, http, parseAbi, parseEventLogs, formatEther } from "viem";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { MONAD_RPC_URL } from "@/lib/monad";
import { CONTRACT_ADDRESS } from "@/lib/abi";

// "Don't take our word for it": this page asks a Monad node directly for a
// transaction and shows what the chain says happened. Nothing here comes from
// VeriPay's database.

const RECEIVER = "0x4bdff272df53a78887fd84a9ee9f4aa9a161a0b9";
const events = parseAbi([
  "event TradeCreated(uint256 indexed id, address indexed buyer, address indexed seller, uint256 amount)",
  "event FundsReleased(uint256 indexed id, address to)",
  "event AutoReleased(uint256 indexed id, address to)",
  "event FeeCharged(uint256 indexed id, uint256 amount)",
  "event DisputeRaised(uint256 indexed id, address by)",
  "event DisputeResolved(uint256 indexed id, uint256 toBuyer, uint256 toSeller)",
  "event RefundAuthorized(uint256 indexed id)",
  "event AutoReleaseSucceeded(uint256 indexed tradeId)",
]);

const WORDS: Record<string, (id: string) => string> = {
  TradeCreated: (id) => `Payment for order #${id} locked in the VeriPay contract`,
  FundsReleased: (id) => `Money for order #${id} paid out`,
  AutoReleased: (id) => `Order #${id} released automatically — the buyer's window had passed`,
  FeeCharged: (id) => `1% VeriPay fee taken on order #${id}`,
  DisputeRaised: (id) => `A problem was reported on order #${id} — money frozen`,
  DisputeResolved: (id) => `Order #${id} settled after review`,
  RefundAuthorized: (id) => `Seller approved a refund for order #${id}`,
  AutoReleaseSucceeded: (id) => `Chainlink automation triggered the release of order #${id}`,
};

type Proof = {
  ok: boolean; block: string; when: string; from: string; to: string;
  toName: string; feeMon: string; steps: string[];
};

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

export default function ProofPage() {
  const { hash } = useParams<{ hash: string }>();
  const router = useRouter();
  const [proof, setProof] = useState<Proof | null | undefined>(undefined);

  useEffect(() => {
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash ?? "")) { setProof(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const pub = createPublicClient({ transport: http(MONAD_RPC_URL) });
        const receipt = await pub.getTransactionReceipt({ hash: hash as `0x${string}` });
        const block = await pub.getBlock({ blockNumber: receipt.blockNumber });
        const to = (receipt.to ?? "").toLowerCase();
        const steps = parseEventLogs({ abi: events, logs: receipt.logs })
          .filter((l) => [CONTRACT_ADDRESS.toLowerCase(), RECEIVER].includes(l.address.toLowerCase()))
          .map((l) => {
            const a = l.args as { id?: bigint; tradeId?: bigint };
            return WORDS[l.eventName]?.(String(a.id ?? a.tradeId ?? "")) ?? l.eventName;
          });
        if (cancelled) return;
        setProof({
          ok: receipt.status === "success",
          block: receipt.blockNumber.toLocaleString("en-US"),
          when: new Date(Number(block.timestamp) * 1000).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          from: receipt.from, to: receipt.to ?? "",
          toName: to === CONTRACT_ADDRESS.toLowerCase() ? "VeriPay escrow contract" : to === RECEIVER ? "VeriPay auto-release contract" : "Contract",
          feeMon: Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice)).toFixed(4),
          steps,
        });
      } catch {
        if (!cancelled) setProof(null);
      }
    })();
    return () => { cancelled = true; };
  }, [hash]);

  const row = "flex items-start justify-between gap-4 py-2.5";
  const key = "text-[11px] font-black uppercase tracking-widest text-zinc-500 shrink-0 pt-0.5";
  const val = "text-sm font-bold text-zinc-900 dark:text-white text-right break-all min-w-0";

  return (
    <div className="flex-1 flex flex-col items-center py-8 sm:py-14 px-4 w-full max-w-md mx-auto">
      <button onClick={() => router.back()} className="self-start flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-5">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-5 sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Proof on Monad</p>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight mt-1">Read live from the blockchain</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          This page asks the Monad network directly. Nothing below comes from VeriPay&apos;s own records, so we can&apos;t change it.
        </p>

        {proof === undefined ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
        ) : proof === null ? (
          <p className="mt-6 text-sm text-zinc-900 dark:text-white">We couldn&apos;t find that transaction on Monad.</p>
        ) : (
          <>
            <div className="mt-5 flex items-center gap-2.5 p-3.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black">
              {proof.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
              <span className="text-sm font-black">{proof.ok ? "Confirmed on Monad" : "This transaction failed"}</span>
            </div>

            {proof.steps.length > 0 && (
              <div className="mt-5">
                <p className={key}>What happened</p>
                <ol className="mt-2 flex flex-col gap-2">
                  {proof.steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-zinc-900 dark:text-white leading-snug">
                      <span className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-[10px] font-black shrink-0">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="my-5 border-t border-dashed border-zinc-300 dark:border-zinc-700" />

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <div className={row}><span className={key}>Network</span><span className={val}>Monad testnet</span></div>
              <div className={row}><span className={key}>Block</span><span className={`${val} font-mono`}>{proof.block}</span></div>
              <div className={row}><span className={key}>Time</span><span className={val}>{proof.when}</span></div>
              <div className={row}><span className={key}>Sent to</span><span className={val}>{proof.toName}<span className="block font-mono text-xs font-medium text-zinc-500">{short(proof.to)}</span></span></div>
              <div className={row}><span className={key}>Network fee</span><span className={`${val} font-mono`}>{proof.feeMon} MON</span></div>
              <div className={row}><span className={key}>Transaction</span><span className={`${val} font-mono text-xs`}>{hash}</span></div>
            </div>

            <a href={`https://testnet.monadscan.com/tx/${hash}`} target="_blank" rel="noopener noreferrer"
              className="mt-5 flex items-center justify-center gap-1.5 w-full py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-sm">
              Open in Monad&apos;s explorer <ArrowUpRight className="w-4 h-4" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}
