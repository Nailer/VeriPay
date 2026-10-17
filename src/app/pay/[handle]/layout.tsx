import type { Metadata } from "next";
import { sellerCard, recordLine } from "@/lib/sellerCard";

// The pay page itself is a client component; this layout gives each seller's
// link its own title and description, so a shared link reads as the shop,
// not as "VeriPay". The preview image sits next to it in opengraph-image.tsx.
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const card = await sellerCard(handle).catch(() => null);
  if (!card) return { title: "VeriPay — pay only when it arrives" };

  const title = `Pay ${card.name} safely · VeriPay`;
  const description = recordLine(card.reputation);
  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "VeriPay" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
