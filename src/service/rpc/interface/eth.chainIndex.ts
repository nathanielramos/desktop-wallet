/**
 * Blockchair Dashboard Freemium API
 * @link https://blockchair.com/api/docs#link_302
 * @dev 1440 Req/ip/day allowed
 */

export interface txQueryBaseParams {
  limit?: number | 10000; // max: 10000 ; default: 100
  offset?: number | 0; // max: 1000000 ; default: 0
  state: "latest";
}

export interface IEthChainIndexAPI {

  // List all transactions for an address
  getTxsByAddress(address: string, options?: txQueryBaseParams): Promise<any>;

  // Get transaction details  by transaction hash
  getTxByHash(txHash: string): Promise<any>;

  // Fetch Internal transaction for an address
  getInternalTxsByAddress(address: string, options?: any);
}