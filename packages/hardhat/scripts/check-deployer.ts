import hre from "hardhat";

async function main() {
  const network = hre.network.name;
  const [signer] = await hre.ethers.getSigners();
  if (!signer) {
    console.error("No signer available. Did you set PRIVATE_KEY in .env?");
    process.exit(1);
  }
  const address = await signer.getAddress();
  const balance = await hre.ethers.provider.getBalance(address);
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  console.log("Network    :", network);
  console.log("Chain ID   :", chainId.toString());
  console.log("Deployer   :", address);
  console.log(
    "Balance    :",
    hre.ethers.formatEther(balance),
    "ETH",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
