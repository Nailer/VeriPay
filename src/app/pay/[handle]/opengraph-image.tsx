import { ImageResponse } from "next/og";
import { sellerCard } from "@/lib/sellerCard";

// The card a chat app shows when a seller's link is shared. It carries the
// seller's live record, read the same way as the pay page — so a buyer sees
// "12 paid out · 0 disputes" before they even tap the link.

export const alt = "Pay this seller safely with VeriPay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300; // records change; refresh the card every 5 minutes

const Check = ({ px, fg, bg }: { px: number; fg: string; bg: string }) => (
  <div style={{ width: px, height: px, borderRadius: px * 0.23, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg width={px * 0.62} height={px * 0.62} viewBox="0 0 64 64">
      <path d="M12 31 L27 46 L52 17" stroke={fg} strokeWidth="8" fill="none" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  </div>
);

const Stat = ({ value, label }: { value: number | string; label: string }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 250, height: 150, borderRadius: 28, background: "#18181b", border: "2px solid #27272a" }}>
    <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{value}</div>
    <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: "#a1a1aa", marginTop: 14 }}>{label}</div>
  </div>
);

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const card = await sellerCard(handle).catch(() => null);
  const r = card?.reputation;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0a0a0a", padding: "56px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Check px={56} fg="#0a0a0a" bg="#ffffff" />
          <div style={{ display: "flex", fontSize: 38, fontWeight: 800, color: "#fff" }}>VeriPay</div>
          <div style={{ display: "flex", marginLeft: "auto", fontSize: 24, color: "#71717a" }}>Buyer protection</div>
        </div>

        {card ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 54 }}>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#fff", letterSpacing: -2, lineHeight: 1.05 }}>{card.name}</div>
            <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", marginTop: 10 }}>{`@${card.handle}`}</div>
            <div style={{ display: "flex", gap: 24, marginTop: 44 }}>
              <Stat value={r?.completedTrades ?? "–"} label="PAID OUT" />
              <Stat value={r?.disputedTrades ?? "–"} label="DISPUTES" />
              <Stat value={r?.totalTrades ?? "–"} label="ORDERS" />
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 90 }}>
            <div style={{ display: "flex", fontSize: 80, fontWeight: 800, color: "#fff", letterSpacing: -2, lineHeight: 1.05 }}>Pay only when</div>
            <div style={{ display: "flex", fontSize: 80, fontWeight: 800, color: "#fff", letterSpacing: -2, lineHeight: 1.05 }}>it arrives.</div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", marginTop: "auto", fontSize: 26, color: "#d4d4d8" }}>
          <div style={{ display: "flex" }}>Your money is held until your order arrives.</div>
          <div style={{ display: "flex", marginLeft: "auto", color: "#71717a" }}>veripay.store</div>
        </div>
      </div>
    ),
    size,
  );
}
