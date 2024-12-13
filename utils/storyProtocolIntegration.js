import { StoryClient, StoryConfig } from "@story-protocol/core-sdk";
import { http } from 'viem';
import { toHex } from 'viem';

const config: StoryConfig = {
  transport: http(process.env.STORY_RPC_URL || 'https://rpc.odyssey.storyrpc.io'),
  chainId: 'odyssey'
};

export class DebateIPManager {
  private client: StoryClient;

  constructor() {
    this.client = StoryClient.newClient(config);
  }

  async registerDebateContent(debateData) {
    try {
      // First create an NFT collection for debate content
      const collection = await this.client.nftClient.createNFTCollection({
        name: 'Autonomous Arcade Debates',
        symbol: 'AAD',
        isPublicMinting: true,
        mintOpen: true,
        mintFeeRecipient: debateData.creator,
        contractURI: '',
        txOptions: { waitForTransaction: true }
      });

      // Register the debate content as IP
      const response = await this.client.ipAsset.mintAndRegisterIp({
        spgNftContract: collection.spgNftContract,
        ipMetadata: {
          ipMetadataURI: `autonomous-arcade/debates/${debateData.tournamentId}`,
          ipMetadataHash: toHex(debateData.contentHash, { size: 32 }),
          nftMetadataHash: toHex(debateData.metadataHash, { size: 32 }),
          nftMetadataURI: debateData.metadataUri
        },
        txOptions: { waitForTransaction: true }
      });

      // Register commercial license terms for the content
      const licenseTerms = await this.client.license.registerCommercialRemixPIL({
        currency: process.env.STORY_CURRENCY_ADDRESS, // SUSD address
        defaultMintingFee: '1', // 1 SUSD
        commercialRevShare: 10, // 10% revenue share
        txOptions: { waitForTransaction: true }
      });

      return {
        ipId: response.ipId,
        tokenId: response.tokenId,
        licenseTermsId: licenseTerms.licenseTermsId,
        collection: collection.spgNftContract
      };
    } catch (error) {
      console.error('Story Protocol IP registration error:', error);
      throw error;
    }
  }

  async attachDebateRights(ipId, participants) {
    try {
      // Create participant-specific license terms
      const participantTerms = await this.client.license.registerPILTerms({
        defaultMintingFee: 0n,
        currency: process.env.STORY_CURRENCY_ADDRESS,
        transferable: true,
        expiration: 0n,
        commercialUse: true,
        commercialAttribution: true,
        commercialRevShare: 5, // 5% rev share for participants
        derivativesAllowed: true,
        derivativesAttribution: true,
        uri: `autonomous-arcade/debates/rights/${ipId}`,
        txOptions: { waitForTransaction: true }
      });

      // Attach rights to each participant
      const rights = await Promise.all(
        participants.map(async (participant) => {
          return this.client.license.mintLicense({
            ipId,
            licenseTermsId: participantTerms.licenseTermsId,
            mintTo: participant.address,
            txOptions: { waitForTransaction: true }
          });
        })
      );

      return {
        termsId: participantTerms.licenseTermsId,
        participantRights: rights
      };
    } catch (error) {
      console.error('Failed to attach debate rights:', error);
      throw error;
    }
  }
} 