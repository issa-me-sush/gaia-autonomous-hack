import * as LitJsSdk from '@lit-protocol/lit-node-client';

const litNodeClient = new LitJsSdk.LitNodeClient();
litNodeClient.connect();

export const getLitAuthSig = async () => {
  try {
    return await LitJsSdk.checkAndSignAuthMessage({
      chain: "ethereum",
    });
  } catch (err) {
    console.error("Error getting Lit auth sig:", err);
    throw err;
  }
};

export const getTournamentAccessConditions = (tournamentType) => {
  switch (tournamentType) {
    case 'PREMIUM':
      return [
        // Must have ETH or be PoH verified
        {
          conditionType: "evmBasic",
          contractAddress: "",
          standardContractType: "",
          chain: "ethereum",
          method: "eth_getBalance",
          parameters: [":userAddress", "latest"],
          returnValueTest: {
            comparator: ">=",
            value: "10000000000000", // 0.00001 ETH
          }
        },
        { operator: "or" },
        {
          contractAddress: "0xC5E9dDebb09Cd64DfaCab4011A0D5cEDaf7c9BDb",
          standardContractType: "ProofOfHumanity",
          chain: "ethereum",
          method: "isRegistered",
          parameters: [":userAddress"],
          returnValueTest: {
            comparator: "=",
            value: "true"
          }
        }
      ];

    case 'ELITE':
      // Must be PoH verified AND have ETH
      return [
        {
          contractAddress: "0xC5E9dDebb09Cd64DfaCab4011A0D5cEDaf7c9BDb",
          standardContractType: "ProofOfHumanity",
          chain: "ethereum",
          method: "isRegistered",
          parameters: [":userAddress"],
          returnValueTest: {
            comparator: "=",
            value: "true"
          }
        },
        { operator: "and" },
        {
          conditionType: "evmBasic",
          contractAddress: "",
          standardContractType: "",
          chain: "ethereum",
          method: "eth_getBalance",
          parameters: [":userAddress", "latest"],
          returnValueTest: {
            comparator: ">=",
            value: "100000000000000", // 0.0001 ETH
          }
        }
      ];

    default:
      return null; // No access conditions for regular tournaments
  }
};

export const verifyAccess = async (userAddress, tournamentType) => {
  const conditions = getTournamentAccessConditions(tournamentType);
  if (!conditions) return true; // No restrictions for regular tournaments

  try {
    const authSig = await getLitAuthSig();
    
    const response = await litNodeClient.checkConditions({
      unifiedAccessControlConditions: conditions,
      authSig,
      chain: 'ethereum'
    });

    return response;
  } catch (err) {
    console.error("Lit Protocol verification failed:", err);
    return false;
  }
}; 