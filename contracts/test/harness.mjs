// Compiles the contracts with solc and runs them on an in-process Ganache
// chain. No network, no keys, no deployed state — every test file gets a
// fresh chain.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createPublicClient, custom, encodeDeployData, encodeFunctionData, toHex } from "viem";

const require = createRequire(import.meta.url);
const solc = require("solc");
const ganache = require("ganache");

const here = path.dirname(fileURLToPath(import.meta.url));
const contractsDir = path.resolve(here, "..");

const SOURCES = {
  "VeriPayEscrow.sol": path.join(contractsDir, "VeriPayEscrow.sol"),
  "test/VeriPayTestNaira.sol": path.join(here, "VeriPayTestNaira.sol"),
  "cre/AutoReleaseReceiver.sol": path.join(contractsDir, "cre/AutoReleaseReceiver.sol"),
};

function findImport(importPath) {
  for (const candidate of [path.join(contractsDir, importPath), path.join(here, "node_modules", importPath)]) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, "utf8") };
  }
  return { error: `not found: ${importPath}` };
}

let compiled;
export function compile() {
  if (compiled) return compiled;
  const input = {
    language: "Solidity",
    sources: Object.fromEntries(Object.entries(SOURCES).map(([name, file]) => [name, { content: fs.readFileSync(file, "utf8") }])),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris", // Ganache predates Cancun; the contracts use nothing newer
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
  const errors = (out.errors || []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const pick = (file, name) => ({ abi: out.contracts[file][name].abi, bytecode: `0x${out.contracts[file][name].evm.bytecode.object}` });
  compiled = {
    escrow: pick("VeriPayEscrow.sol", "VeriPayEscrow"),
    token: pick("test/VeriPayTestNaira.sol", "VeriPayTestNaira"),
    receiver: pick("cre/AutoReleaseReceiver.sol", "AutoReleaseReceiver"),
  };
  return compiled;
}

export async function startChain() {
  const provider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8, defaultBalance: 1000 }, chain: { hardfork: "merge" } });
  const chain = { id: 1337, name: "local", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [] } } };
  const transport = custom(provider);
  const pub = createPublicClient({ chain, transport });
  const accounts = await provider.request({ method: "eth_accounts" });
  // Transactions go straight to the node's unlocked accounts. Each one is
  // dry-run first so a revert surfaces with its reason string.
  const raw = async (from, tx) => {
    const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from, gas: "0x5b8d80", ...tx }] });
    const receipt = await pub.getTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("transaction reverted");
    return receipt;
  };
  const deploy = async (artifact, args = [], from = accounts[0]) => {
    const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args });
    await pub.call({ account: from, data });
    return (await raw(from, { data })).contractAddress;
  };
  /** Send a transaction and return its receipt. Throws on revert. */
  const send = async (from, address, abi, functionName, args = [], value) => {
    await pub.simulateContract({ account: from, address, abi, functionName, args, value });
    const data = encodeFunctionData({ abi, functionName, args });
    return raw(from, { to: address, data, ...(value ? { value: toHex(value) } : {}) });
  };
  const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
  const warp = async (seconds) => {
    await provider.request({ method: "evm_increaseTime", params: [seconds] });
    await provider.request({ method: "evm_mine", params: [] });
  };
  const gasCost = (receipt) => receipt.gasUsed * receipt.effectiveGasPrice;
  return { provider, pub, accounts, deploy, send, read, warp, gasCost, balance: (address) => pub.getBalance({ address }) };
}

/** Assert that a call reverts with a message containing `reason`. */
export async function expectRevert(promise, reason) {
  try {
    await promise;
  } catch (err) {
    const text = `${err?.shortMessage || ""} ${err?.message || ""} ${err?.details || ""}`;
    if (reason && !text.includes(reason)) throw new Error(`expected revert "${reason}", got: ${text.slice(0, 300)}`);
    return;
  }
  throw new Error(`expected revert${reason ? ` "${reason}"` : ""}, but the call succeeded`);
}
