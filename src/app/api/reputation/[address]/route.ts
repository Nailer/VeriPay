import { NextResponse } from "next/server";

// ─── GET /api/reputation/[address] ───────────────────────────────────────────
// Reads the Envio-indexed AddressReputation entity for one address — see
// indexer/ for what feeds this. `configured: false` (not an error) until
// ENVIO_GRAPHQL_URL is set, since the indexer is a separate deploy from the
// app and won't exist yet on a fresh checkout.

export type Reputation = {
  address: string;
  totalTrades: number;
  completedTrades: number;
  disputedTrades: number;
  refundedTrades: number;
};

const QUERY = `
  query Reputation($id: String!) {
    AddressReputation(where: { id: { _eq: $id } }) {
      id
      totalTrades
      completedTrades
      disputedTrades
      refundedTrades
    }
  }
`;

export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const graphqlUrl = process.env.ENVIO_GRAPHQL_URL;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (!graphqlUrl) {
    return NextResponse.json({ configured: false, reputation: null });
  }

  try {
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { id: address.toLowerCase() } }),
      // Reputation is read-heavy and changes slowly (one write per trade
      // event) — a short cache keeps a busy trade page from hammering the
      // indexer on every render without ever showing meaningfully stale data.
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return NextResponse.json({ configured: true, reputation: null });
    }

    const json = await res.json();
    const row = json?.data?.AddressReputation?.[0];

    if (!row) {
      return NextResponse.json({
        configured: true,
        reputation: {
          address: address.toLowerCase(),
          totalTrades: 0,
          completedTrades: 0,
          disputedTrades: 0,
          refundedTrades: 0,
        } satisfies Reputation,
      });
    }

    return NextResponse.json({
      configured: true,
      reputation: {
        address: row.id,
        totalTrades: row.totalTrades,
        completedTrades: row.completedTrades,
        disputedTrades: row.disputedTrades,
        refundedTrades: row.refundedTrades,
      } satisfies Reputation,
    });
  } catch (err) {
    console.error("Reputation GET error:", err);
    return NextResponse.json({ configured: true, reputation: null });
  }
}
