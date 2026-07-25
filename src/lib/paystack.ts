// Paystack integration for "Pay with card".
//
// Paystack is Nigeria's default card processor: it takes Verve/Mastercard/Visa
// naira cards, plus Apple/Google Pay, and settles to a Nigerian account.
//
// Why cards can settle without an admin: for a bank transfer we have to *look*
// at a statement to know money arrived, but for a card charge Paystack itself
// is an authority we can query. We never trust the browser's "payment worked!"
// — we re-ask Paystack server-side with the secret key, check the amount and
// currency, and only then release crypto.
//
// With no key configured the module runs in clearly-labelled TEST MODE so the
// flow is demonstrable end-to-end; test-mode orders are tagged as such.

const SECRET = process.env.PAYSTACK_SECRET_KEY;

export const paystackConfigured = () => Boolean(SECRET);

/** Public key is safe in the browser; used by the inline checkout popup. */
export const paystackPublicKey = () => process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";

export type InitResult =
  | { ok: true; demo: false; reference: string; accessCode: string; authorizationUrl: string }
  | { ok: true; demo: true; reference: string }
  | { ok: false; error: string };

export async function initTransaction(params: {
  orderId: string;
  amountNgn: number;
  email: string;
  callbackUrl?: string;
}): Promise<InitResult> {
  const reference = `VP-${params.orderId}-${Date.now().toString(36).toUpperCase()}`;

  if (!SECRET) {
    return { ok: true, demo: true, reference };
  }

  try {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: params.email,
        // Paystack works in kobo.
        amount: Math.round(params.amountNgn * 100),
        currency: "NGN",
        reference,
        callback_url: params.callbackUrl,
        metadata: { orderId: params.orderId, product: "VeriPay Exchange" },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const json = await res.json();
    if (!res.ok || !json.status) {
      return { ok: false, error: json.message || "Could not start the card payment." };
    }

    return {
      ok: true,
      demo: false,
      reference: json.data.reference as string,
      accessCode: json.data.access_code as string,
      authorizationUrl: json.data.authorization_url as string,
    };
  } catch (err) {
    console.error("Paystack init failed:", err);
    return { ok: false, error: "Could not reach the card processor. Try a bank transfer instead." };
  }
}

export type VerifyResult =
  | { ok: true; demo: boolean; amountNgn: number; channel: string; paidAt: string }
  | { ok: false; error: string };

/**
 * Ask Paystack — not the browser — whether this charge really succeeded.
 * `expectedAmountNgn` is checked here so a tampered client can't pay ₦100 for
 * a ₦100,000 order.
 */
export async function verifyTransaction(
  reference: string,
  expectedAmountNgn: number
): Promise<VerifyResult> {
  if (!SECRET) {
    // TEST MODE: only reachable when no live key exists at all.
    return {
      ok: true,
      demo: true,
      amountNgn: expectedAmountNgn,
      channel: "test-card",
      paidAt: new Date().toISOString(),
    };
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${SECRET}` },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      }
    );

    const json = await res.json();
    if (!res.ok || !json.status || !json.data) {
      return { ok: false, error: "We couldn't verify that payment with Paystack." };
    }

    const data = json.data;
    if (data.status !== "success") {
      return { ok: false, error: `Card payment was not successful (${data.gateway_response || data.status}).` };
    }
    if (data.currency !== "NGN") {
      return { ok: false, error: "Payment currency mismatch." };
    }

    const paidNgn = Number(data.amount) / 100;
    // Allow a ₦1 rounding tolerance, but never accept a short payment.
    if (paidNgn + 1 < expectedAmountNgn) {
      return {
        ok: false,
        error: `Card payment was ₦${paidNgn.toLocaleString("en-NG")}, but this order needs ₦${expectedAmountNgn.toLocaleString("en-NG")}.`,
      };
    }

    return {
      ok: true,
      demo: false,
      amountNgn: paidNgn,
      channel: data.channel || "card",
      paidAt: data.paid_at || new Date().toISOString(),
    };
  } catch (err) {
    console.error("Paystack verify failed:", err);
    return { ok: false, error: "Could not reach the card processor to confirm your payment." };
  }
}

/** Validate a Paystack webhook signature (HMAC SHA512 of the raw body). */
export async function isValidWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!SECRET || !signature) return false;
  const { createHmac } = await import("node:crypto");
  const expected = createHmac("sha512", SECRET).update(rawBody).digest("hex");
  return expected === signature;
}
