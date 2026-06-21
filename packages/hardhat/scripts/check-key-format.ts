import * as dotenv from "dotenv";
dotenv.config();

const raw = process.env.PRIVATE_KEY ?? "";
const cleaned = raw.trim();
const startsWith0x = cleaned.startsWith("0x");
const hexBody = startsWith0x ? cleaned.slice(2) : cleaned;
const isHex = /^[0-9a-fA-F]*$/.test(hexBody);

console.log("PRIVATE_KEY length (raw)    :", raw.length);
console.log("PRIVATE_KEY length (trimmed):", cleaned.length);
console.log("Starts with 0x              :", startsWith0x);
console.log("Hex body length             :", hexBody.length);
console.log("Hex body is valid hex       :", isHex);
console.log("Expected hex body length    : 64 (32 bytes)");
if (hexBody.length === 64 && isHex) {
  console.log("\nFormat OK.");
} else if (hexBody.length < 64) {
  console.log("\nChave incompleta. Faltam", 64 - hexBody.length, "caracteres.");
} else if (hexBody.length > 64) {
  console.log("\nChave longa demais. Sobram", hexBody.length - 64, "caracteres.");
} else if (!isHex) {
  console.log("\nChave contém caracteres não-hexadecimais.");
}
