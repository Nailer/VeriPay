import { createWallet, inAppWallet } from "thirdweb/wallets";

/** Sign-in options offered everywhere a wallet can be connected. */
export const wallets = [
  inAppWallet({ auth: { options: ["email", "google", "apple", "facebook", "phone"] } }),
  createWallet("io.metamask"),
  createWallet("walletConnect"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
  createWallet("com.walletconnect"),
  createWallet("io.rabby"),
  createWallet("io.zerion.wallet"),
];
