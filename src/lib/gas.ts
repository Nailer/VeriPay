// Browser-side: make sure an account can afford the action it's about to sign.
//
// People who sign in with a fingerprint have never held MON and shouldn't need
// to know it exists. Before any transaction we check the balance and, if it's
// short, ask the server to cover it (see sponsorGas in lib/payments.ts).

import { createPublicClient, http, parseEther } from "viem";
import { MONAD_RPC_URL } from "@/lib/monad";

const MIN_GAS = parseEther("0.03"); // one escrow action, with room to spare

export async function readyToTransact(address: string): Promise<boolean> {
  const pub = createPublicClient({ transport: http(MONAD_RPC_URL) });
  const who = address as `0x${string}`;
  const enough = async () => (await pub.getBalance({ address: who })) >= MIN_GAS;
  if (await enough()) return true;

  await fetch("/api/pay/gas", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }),
  }).catch(() => {});

  for (let i = 0; i < 6; i++) {
    if (await enough()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
