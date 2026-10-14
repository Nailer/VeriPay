// Shared by the browser and the server — no server-only imports here.

export const normaliseHandle = (raw: string) => raw.trim().toLowerCase().replace(/^@/, "");

/** The exact text a seller signs to prove they control the payout address. */
export const claimMessage = (handle: string, address: string) =>
  `VeriPay: I am claiming the payment link "${handle}" for ${address.toLowerCase()}.`;
