import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployVickrey: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const vickrey = await deploy("ConfidentialVickreyAuction", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  console.log("ConfidentialVickreyAuction deployed to:", vickrey.address);
};

export default deployVickrey;

deployVickrey.tags = ["ConfidentialVickreyAuction", "Vickrey"];
