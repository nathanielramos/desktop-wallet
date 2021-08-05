import { IEvmRpc } from "../interface/evm.rpcClient";
import Web3 from "web3";
import { BlockTransactionObject, TransactionReceipt } from 'web3-eth';

class EVMClient implements IEvmRpc {

    private _web3: Web3;

    constructor(web3Instance: Web3) {
        this._web3 = web3Instance;
    }

    public static create(web3HttpProviderUrl: string): EVMClient {
        if (!web3HttpProviderUrl.startsWith('https://') || !web3HttpProviderUrl.startsWith('http://')) {
            const web3 = new Web3(new Web3.providers.HttpProvider(web3HttpProviderUrl));
            return new EVMClient(web3);
        }
        throw new Error("Please provide a valid HTTP Web3 Provider.");
    }

    get web3(): Web3 {
        return this._web3;
    }

    set web3(web3: Web3) {
        this._web3 = web3;
    }

    // Node
    async isNodeSyncing(): Promise<boolean> {
        const isSyncing = await this._web3.eth.isSyncing();
        console.debug(isSyncing)
        if (isSyncing instanceof Object) {
            return true;
        }
        return false;
    }

    public async getChainId(): Promise<number> {
        return await this._web3.eth.getChainId();
    }

    // Address
    async getNativeBalanceByAddress(address: string): Promise<string> {
        if (!this._web3.utils.isAddress(address)) {
            throw new Error("Please provide a valid EVM compatible address.");
        }

        const nativeBalance = await this._web3.eth.getBalance(address, "latest");
        return nativeBalance;
    }

    async getNextNonceByAddress(address: string): Promise<number> {
        if (!this._web3.utils.isAddress(address)) {
            throw new Error("Please provide a valid EVM compatible address.");
        }

        const pendingNonce = await this._web3.eth.getTransactionCount(address, "pending");
        return pendingNonce;
    }

    // Transaction
    async getTransactionReceiptByHash(txHash: string): Promise<TransactionReceipt | null> {
        const mayBeTxReceipt = await this._web3.eth.getTransactionReceipt(txHash);
        if (!mayBeTxReceipt) {
            return null;
        }
        return mayBeTxReceipt;
    }

    // Block
    async getLatestBlockHeight(): Promise<number> {
        const blockHeight = await this._web3.eth.getBlockNumber();
        return blockHeight;
    }

    async getBlock(blockHashOrBlockNumber: number | string): Promise<BlockTransactionObject> {
        const blockTransactions = await this._web3.eth.getBlock(blockHashOrBlockNumber, true);
        return blockTransactions
    }
    async getBlockByHeight(height: number): Promise<BlockTransactionObject> {
        return await this.getBlock(height);
    }

    async getBlockByHash(blockHash: string): Promise<BlockTransactionObject> {
        return await this.getBlock(blockHash);
    }

    // Broadcast
    async broadcastRawTransactionHex(signedTxHex: string): Promise<string> {

        if (!this._web3.utils.isHex(signedTxHex)) {
            throw new Error("Please provide a valid Hex string.");

        }
        if (!signedTxHex.startsWith('0x')) {
            signedTxHex = `0x${signedTxHex}`
        }

        const broadcastTx = await this._web3.eth.sendSignedTransaction(signedTxHex);

        if (broadcastTx.status) {
            return broadcastTx.transactionHash;
        }

        throw new Error("Transaction broadcast failed.");
    }
}

export { EVMClient };