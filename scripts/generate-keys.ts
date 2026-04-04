import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const zgKey = generatePrivateKey();
const zgAccount = privateKeyToAccount(zgKey);

const platformKey = generatePrivateKey();
const platformAccount = privateKeyToAccount(platformKey);

console.log("=== 0G Storage Key ===");
console.log(`ZG_PRIVATE_KEY=${zgKey}`);
console.log(`ZG_ADDRESS=${zgAccount.address}`);
console.log(`  → Fund at: https://faucet.0g.ai`);
console.log();
console.log("=== Platform ETH Key (Sepolia) ===");
console.log(`PLATFORM_ETH_PRIVATE_KEY=${platformKey}`);
console.log(`PLATFORM_ETH_ADDRESS=${platformAccount.address}`);
console.log(`  → Fund at: https://www.infura.io/faucet/sepolia`);
