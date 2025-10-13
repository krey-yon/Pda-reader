"use client";

import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";

function toHex(buffer: Buffer | Uint8Array) {
  return Buffer.from(buffer).toString("hex");
}

function toBase64(buffer: Buffer | Uint8Array) {
  return Buffer.from(buffer).toString("base64");
}

interface ParsedField {
  name: string;
  type: string;
  value: string | bigint | number | boolean;
}

interface StructField {
  name: string;
  type: string;
}

/**
 * Parse Rust struct definition to extract field names and types
 * Example input:
 * #[account]
 * pub struct Counter {
 *     authority: Pubkey,
 *     count: u64,
 * }
 */
function parseRustStruct(structDef: string): StructField[] {
  const fields: StructField[] = [];

  // Remove comments and extra whitespace
  const cleaned = structDef
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();

  // Extract field definitions between braces
  const braceMatch = cleaned.match(/\{([^}]+)\}/);
  if (!braceMatch) return fields;

  const fieldBlock = braceMatch[1];

  // Match field patterns: name: Type,
  const fieldRegex =
    /(\w+)\s*:\s*(Pubkey|PublicKey|u8|u16|u32|u64|u128|i8|i16|i32|i64|i128|bool|String)/gi;
  let match;

  while ((match = fieldRegex.exec(fieldBlock)) !== null) {
    fields.push({
      name: match[1],
      type: match[2],
    });
  }

  return fields;
}

/**
 * Calculate expected data size from space structure
 * Example: "8 + 32 + 8" = 48 bytes (discriminator + Pubkey + u64)
 */
function calculateSpaceSize(spaceExpr: string): number {
  try {
    // Remove whitespace and evaluate the expression
    const sanitized = spaceExpr.replace(/\s/g, "");
    // eslint-disable-next-line no-eval
    return eval(sanitized);
  } catch {
    return 0;
  }
}

/**
 * Deserialize buffer based on parsed struct fields
 * Using DataView for browser compatibility
 */
function deserializeWithStruct(
  dataBuffer: Uint8Array,
  fields: StructField[],
  spaceSize: number
): ParsedField[] | null {
  if (dataBuffer.length < spaceSize) {
    return null;
  }

  const view = new DataView(
    dataBuffer.buffer,
    dataBuffer.byteOffset,
    dataBuffer.byteLength
  );
  const result: ParsedField[] = [];
  let offset = 8; // Skip 8-byte discriminator for Anchor accounts

  try {
    for (const field of fields) {
      const type = field.type.toLowerCase();

      if (type === "pubkey" || type === "publickey") {
        const pkBytes = dataBuffer.slice(offset, offset + 32);
        const pk = new PublicKey(pkBytes);
        result.push({
          name: field.name,
          type: "Pubkey",
          value: pk.toBase58(),
        });
        offset += 32;
      } else if (type === "u64") {
        const value = view.getBigUint64(offset, true); // true = little-endian
        result.push({
          name: field.name,
          type: "u64",
          value,
        });
        offset += 8;
      } else if (type === "i64") {
        const value = view.getBigInt64(offset, true);
        result.push({
          name: field.name,
          type: "i64",
          value,
        });
        offset += 8;
      } else if (type === "u32") {
        const value = view.getUint32(offset, true);
        result.push({
          name: field.name,
          type: "u32",
          value,
        });
        offset += 4;
      } else if (type === "i32") {
        const value = view.getInt32(offset, true);
        result.push({
          name: field.name,
          type: "i32",
          value,
        });
        offset += 4;
      } else if (type === "u16") {
        const value = view.getUint16(offset, true);
        result.push({
          name: field.name,
          type: "u16",
          value,
        });
        offset += 2;
      } else if (type === "i16") {
        const value = view.getInt16(offset, true);
        result.push({
          name: field.name,
          type: "i16",
          value,
        });
        offset += 2;
      } else if (type === "u8") {
        const value = view.getUint8(offset);
        result.push({
          name: field.name,
          type: "u8",
          value,
        });
        offset += 1;
      } else if (type === "i8") {
        const value = view.getInt8(offset);
        result.push({
          name: field.name,
          type: "i8",
          value,
        });
        offset += 1;
      } else if (type === "bool") {
        const value = view.getUint8(offset) !== 0;
        result.push({
          name: field.name,
          type: "bool",
          value,
        });
        offset += 1;
      }
    }

    return result;
  } catch (e) {
    console.error("Failed to deserialize with struct:", e);
    return null;
  }
}

/**
 * Fallback: Auto-detect 48-byte structure (discriminator + Pubkey + u64)
 * Using DataView for browser compatibility
 */
function autoDeserialize48Bytes(dataBuffer: Uint8Array): ParsedField[] | null {
  if (dataBuffer.length !== 48) return null;

  try {
    const view = new DataView(
      dataBuffer.buffer,
      dataBuffer.byteOffset,
      dataBuffer.byteLength
    );

    // Skip 8-byte discriminator, then 32-byte Pubkey, then u64
    const pkBytes = dataBuffer.slice(8, 40);
    const pk = new PublicKey(pkBytes);
    const count = view.getBigUint64(40, true); // true = little-endian

    return [
      { name: "authority", type: "Pubkey", value: pk.toBase58() },
      { name: "count", type: "u64", value: count },
    ];
  } catch (e) {
    console.error("Failed auto 48-byte deserialization:", e);
    return null;
  }
}

export default function PdaTool() {
  const { connection } = useConnection();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    pubkey: string;
    lamports: number;
    owner: string;
    executable: boolean;
    data: Uint8Array;
  } | null>(null);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [spaceStructure, setSpaceStructure] = useState("8 + 32 + 8");
  const [rustStruct, setRustStruct] = useState(`#[account]
pub struct Counter {
    authority: Pubkey,
    count: u64,
}`);

  async function lookup() {
    setError(null);
    setResult(null);
    let pub: PublicKey;
    try {
      pub = new PublicKey(input.trim());
    } catch {
      setError("Invalid public key");
      return;
    }

    setLoading(true);
    try {
      const info = await connection.getAccountInfo(pub);
      if (!info) {
        setError("No account found for this PDA on devnet.");
        setResult(null);
      } else {
        setResult({
          pubkey: pub.toBase58(),
          lamports: info.lamports,
          owner: info.owner.toBase58(),
          executable: info.executable,
          data: info.data,
        });
      }
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="max-w-4xl mx-auto p-6 bg-white/60 dark:bg-black/40 rounded-xl shadow-md backdrop-blur">
      <h2 className="text-2xl font-semibold mb-2">PDA Inspector</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Paste a PDA (public key) to fetch the account data from Devnet.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-3 items-center">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter PDA public key (base58)"
          className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-black/60 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          onClick={lookup}
          disabled={loading}
          className="px-4 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-60 transition"
        >
          {loading ? "Looking up..." : "Lookup"}
        </button>
      </div>

      {/* Advanced Settings */}
      <div className="mt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-2"
        >
          <span>{showAdvanced ? "▼" : "▶"}</span>
          Advanced: Custom Struct Deserialization
        </button>

        {showAdvanced && (
          <div className="mt-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-zinc-900/50 grid gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Space Structure (e.g., 8 + 32 + 8)
              </label>
              <input
                value={spaceStructure}
                onChange={(e) => setSpaceStructure(e.target.value)}
                placeholder="8 + 32 + 8"
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-black/60 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Sum should match data length. Example: 8 (discriminator) + 32
                (Pubkey) + 8 (u64) = 48 bytes
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Rust Anchor Struct Definition
              </label>
              <textarea
                value={rustStruct}
                onChange={(e) => setRustStruct(e.target.value)}
                placeholder={`#[account]\npub struct Counter {\n    authority: Pubkey,\n    count: u64,\n}`}
                rows={8}
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-black/60 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Paste your Rust struct. Supported types: Pubkey, u8, u16, u32,
                u64, i8, i16, i32, i64, bool
              </p>
            </div>
          </div>
        )}
      </div>

      {error && <div className="mt-4 text-sm text-red-500">{error}</div>}

      {result && (
        <div className="mt-6 grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-md bg-gray-50 dark:bg-zinc-900">
              <div className="text-xs text-neutral-500">Public Key</div>
              <div className="font-mono break-all text-sm">{result.pubkey}</div>
            </div>
            <div className="p-4 rounded-md bg-gray-50 dark:bg-zinc-900">
              <div className="text-xs text-neutral-500">Owner Program ID</div>
              <div className="font-mono break-all text-sm">{result.owner}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-md bg-gray-50 dark:bg-zinc-900">
              <div className="text-xs text-neutral-500">Lamports (SOL)</div>
              <div className="font-mono">{result.lamports / 1e9} SOL</div>
              <div className="text-xs text-neutral-400 mt-1">
                {result.lamports} lamports
              </div>
            </div>
            <div className="p-4 rounded-md bg-gray-50 dark:bg-zinc-900">
              <div className="text-xs text-neutral-500">Executable</div>
              <div className="font-mono">{String(result.executable)}</div>
            </div>
            <div className="p-4 rounded-md bg-gray-50 dark:bg-zinc-900">
              <div className="text-xs text-neutral-500">Data length</div>
              <div className="font-mono">{result.data.length} bytes</div>
            </div>
          </div>

          {(() => {
            // Try custom struct deserialization first
            const structFields = parseRustStruct(rustStruct);
            const expectedSize = calculateSpaceSize(spaceStructure);

            let parsedFields: ParsedField[] | null = null;

            if (
              structFields.length > 0 &&
              expectedSize > 0 &&
              result.data.length >= expectedSize
            ) {
              parsedFields = deserializeWithStruct(
                result.data,
                structFields,
                expectedSize
              );
            }

            // Fallback to auto 48-byte detection
            if (!parsedFields && result.data.length === 48) {
              parsedFields = autoDeserialize48Bytes(result.data);
            }

            if (parsedFields && parsedFields.length > 0) {
              return (
                <div className="p-4 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <div className="text-sm font-medium mb-3 text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                    <span>✅</span>
                    <span>Deserialized Account Data</span>
                    {structFields.length > 0 && (
                      <span className="text-xs bg-emerald-200 dark:bg-emerald-900 px-2 py-0.5 rounded">
                        Custom Struct
                      </span>
                    )}
                  </div>
                  <div className="grid gap-3">
                    {parsedFields.map((field, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded bg-white dark:bg-black/40"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                            {field.name}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-neutral-600 dark:text-neutral-300">
                            {field.type}
                          </span>
                        </div>
                        <div className="font-mono text-sm break-all">
                          {typeof field.value === "bigint"
                            ? field.value.toString()
                            : typeof field.value === "boolean"
                            ? String(field.value)
                            : field.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <div className="p-4 rounded-md bg-gray-100 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Raw Data Buffer</div>
            </div>

            <div className="grid gap-3">
              <div>
                <div className="text-xs text-neutral-500">HEX</div>
                <pre className="mt-1 overflow-auto max-h-44 bg-white dark:bg-black/60 p-3 rounded text-xs font-mono">
                  {toHex(result.data)}
                </pre>
              </div>

              <div>
                <div className="text-xs text-neutral-500">Base64</div>
                <pre className="mt-1 overflow-auto max-h-44 bg-white dark:bg-black/60 p-3 rounded text-xs font-mono">
                  {toBase64(result.data)}
                </pre>
              </div>

              <div>
                <div className="text-xs text-neutral-500">
                  UTF-8 (best-effort)
                </div>
                <pre className="mt-1 overflow-auto max-h-44 bg-white dark:bg-black/60 p-3 rounded text-xs font-mono">
                  {Buffer.from(result.data).toString("utf8")}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
