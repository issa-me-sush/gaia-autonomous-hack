import { 
  Nevermined, 
  Account, 
  MetaData, 
  AssetPrice, 
  RoyaltyKind, 
  getRoyaltyScheme, 
  BigNumber, 
  NFTAttributes 
} from '@nevermined-io/sdk';

// Nevermined configuration
const neverminedConfig = {
  web3ProviderUri: process.env.WEB3_PROVIDER_URI || 'https://sepolia-rollup.arbitrum.io/rpc',
  neverminedNodeUri: process.env.NEVERMINED_NODE_URI || 'https://node.testing.nevermined.app',
  neverminedNodeAddress: process.env.NEVERMINED_NODE_ADDRESS,
  marketplaceUri: process.env.MARKETPLACE_URI || 'https://marketplace-api.testing.nevermined.app',
  artifactsFolder: './nevermined-artifacts'
};

export class AgentPaymentService {
  private sdk: Nevermined;
  private account: Account;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.sdk = await Nevermined.getInstance(neverminedConfig);
    const accounts = await this.sdk.accounts.list();
    this.account = accounts[0];
  }

  async createAgentService(agent) {
    try {
      // Create metadata for the agent service
      const metadata: MetaData = {
        main: {
          name: agent.name,
          type: 'AI-Agent-Service',
          dateCreated: new Date().toISOString(),
          author: agent.creator,
          license: 'AI Service License',
          files: [{
            index: 0,
            contentType: 'application/json',
            url: agent.endpoint
          }],
          additionalInformation: {
            capabilities: agent.capabilities,
            performanceMetrics: agent.metrics,
            serviceType: agent.type
          }
        }
      };

      // Set up pricing for the service
      const priceMap = new Map([
        [this.account.getId(), BigNumber.from(agent.pricePerCall)]
      ]);
      const assetPrice = new AssetPrice(priceMap);

      // Configure royalties
      const royaltyAttributes = {
        royaltyKind: RoyaltyKind.Standard,
        scheme: getRoyaltyScheme(this.sdk, RoyaltyKind.Standard),
        amount: agent.royaltyPercentage || 0
      };

      // Add network fees
      const networkFee = await this.sdk.keeper.nvmConfig.getNetworkFee();
      const feeReceiver = await this.sdk.keeper.nvmConfig.getFeeReceiver();
      assetPrice.addNetworkFees(feeReceiver, BigNumber.from(networkFee));

      // Create NFT attributes for the service
      const nftAttributes = NFTAttributes.getNFT1155Instance({
        metadata,
        serviceTypes: ['agent-service', 'agent-access'],
        amount: BigNumber.from(1),
        cap: BigNumber.from(1000000), // High cap for multiple uses
        royaltyAttributes,
        preMint: true,
        nftContractAddress: this.sdk.nfts1155.nftContract.address,
        providers: [neverminedConfig.neverminedNodeAddress],
        price: assetPrice
      });

      // Publish the service as an NFT
      const ddo = await this.sdk.nfts1155.create(
        nftAttributes,
        this.account
      );

      return {
        serviceId: ddo.id,
        accessEndpoint: ddo.services[0].serviceEndpoint,
        price: agent.pricePerCall,
        metadata: metadata
      };
    } catch (error) {
      console.error('Failed to create agent service:', error);
      throw error;
    }
  }

  async processAgentPayment(serviceId, userAddress, callCount = 1) {
    try {
      // Verify service exists
      const ddo = await this.sdk.assets.resolve(serviceId);
      if (!ddo) throw new Error('Service not found');

      // Calculate payment amount
      const paymentAmount = BigNumber.from(ddo.price).mul(callCount);

      // Create and process order
      const agreementId = await this.sdk.nfts1155.order(
        serviceId,
        paymentAmount,
        this.account
      );

      // Execute transfer
      const transferResult = await this.sdk.nfts1155.transferForDelegate(
        agreementId,
        await this.sdk.assets.owner(serviceId),
        userAddress,
        paymentAmount,
        1155
      );

      return {
        agreementId,
        transferResult,
        paymentAmount: paymentAmount.toString()
      };
    } catch (error) {
      console.error('Payment processing failed:', error);
      throw error;
    }
  }

  async getAgentMetrics(serviceId) {
    try {
      const metrics = await this.sdk.keeper.conditions.getConditionState(serviceId);
      return {
        totalCalls: metrics.fulfillments,
        totalRevenue: metrics.transfers,
        activeUsers: metrics.uniqueConsumers
      };
    } catch (error) {
      console.error('Failed to fetch agent metrics:', error);
      throw error;
    }
  }
} 