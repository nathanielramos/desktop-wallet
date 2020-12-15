import { Wallet } from '../models/Wallet';
import { StorageService } from '../storage/StorageService';
import { WalletCreateOptions, WalletCreator } from './WalletCreator';
import {
  APP_DB_NAMESPACE,
  DefaultAsset,
  DefaultWalletConfigs,
  Network,
  WalletConfig,
} from '../config/StaticConfig';
import { WalletImporter, WalletImportOptions } from './WalletImporter';
import { NodeRpcService } from './rpc/NodeRpcService';
import { TransactionSigner } from './signers/TransactionSigner';
import { Session } from '../models/Session';
import {
  DelegateTransactionUnsigned,
  TransferTransactionUnsigned,
  WithdrawStakingRewardUnsigned,
} from './signers/TransactionSupported';

export interface TransferRequest {
  toAddress: string;
  amount: string;
  memo: string;
}

class WalletService {
  private readonly storageService: StorageService;

  constructor() {
    this.storageService = new StorageService(APP_DB_NAMESPACE);
  }

  public async sendTransfer(transferRequest: TransferRequest) {
    const {
      nodeRpc,
      accountNumber,
      accountSequence,
      phrase,
      currentWallet,
      transactionSigner,
    } = await this.prepareTransaction();

    const transfer: TransferTransactionUnsigned = {
      fromAddress: currentWallet.address,
      toAddress: transferRequest.toAddress,
      amount: transferRequest.amount,
      memo: transferRequest.memo,
      accountNumber,
      accountSequence,
    };

    const signedTxHex = await transactionSigner.signTransfer(transfer, phrase);
    return nodeRpc.broadcastTransaction(signedTxHex);
  }

  public async sendDelegateTransaction(
    delegatorAddress: string,
    validatorAddress: string,
    amount: string,
    memo: string,
  ) {
    const {
      nodeRpc,
      accountNumber,
      accountSequence,
      phrase,
      transactionSigner,
    } = await this.prepareTransaction();

    const delegateTransaction: DelegateTransactionUnsigned = {
      delegatorAddress,
      validatorAddress,
      amount,
      memo,
      accountNumber,
      accountSequence,
    };

    const signedTxHex = await transactionSigner.signDelegateTx(delegateTransaction, phrase);
    return nodeRpc.broadcastTransaction(signedTxHex);
  }

  public async sendStakingRewardWithdrawalTx(
    delegatorAddress: string,
    validatorAddress: string,
    amount: string,
    memo: string,
  ) {
    const {
      nodeRpc,
      accountNumber,
      accountSequence,
      phrase,
      transactionSigner,
    } = await this.prepareTransaction();

    const withdrawStakingReward: WithdrawStakingRewardUnsigned = {
      delegatorAddress,
      validatorAddress,
      memo,
      accountNumber,
      accountSequence,
    };

    const signedTxHex = await transactionSigner.signWithdrawStakingRewardTx(
      withdrawStakingReward,
      phrase,
    );
    return nodeRpc.broadcastTransaction(signedTxHex);
  }

  public async prepareTransaction() {
    const currentSession = await this.storageService.retrieveCurrentSession();
    const currentWallet = currentSession.wallet;

    const nodeRpc = await NodeRpcService.init(currentWallet.config.nodeUrl);

    const accountNumber = await nodeRpc.fetchAccountNumber(currentWallet.address);
    const accountSequence = await nodeRpc.loadSequenceNumber(currentWallet.address);

    const phrase = await this.decryptPhrase(currentSession);
    const transactionSigner = new TransactionSigner(currentWallet.config);

    return {
      nodeRpc,
      accountNumber,
      accountSequence,
      phrase,
      currentWallet,
      transactionSigner,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async decryptPhrase(session: Session): Promise<string> {
    // TODO : Implement actual phrase decryption
    return Promise.resolve(session.wallet.encryptedPhrase);
  }

  // eslint-disable-next-line class-methods-use-this
  public supportedConfigs(): WalletConfig[] {
    return [
      DefaultWalletConfigs.TestNetConfig,
      DefaultWalletConfigs.MainNetConfig,
      DefaultWalletConfigs.CustomDevNet,
    ];
  }

  // Create a new wallet and persist it on the db
  public async createAndSaveWallet(createOptions: WalletCreateOptions): Promise<Wallet> {
    const newWallet = WalletCreator.create(createOptions);
    await this.persistWallet(newWallet);
    await this.persistInitialAsset(newWallet.identifier, newWallet.config.network);
    return newWallet;
  }

  public async persistInitialAsset(walletId: string, network: Network) {
    const defaultAsset = DefaultAsset(network);
    await this.storageService.saveAsset({
      walletId,
      ...defaultAsset,
    });
  }

  // Import or restore wallet and persist it on the db
  public async restoreAndSaveWallet(importOptions: WalletImportOptions): Promise<Wallet> {
    const importedWallet = WalletImporter.import(importOptions);
    await this.persistWallet(importedWallet);
    await this.persistInitialAsset(importedWallet.identifier, importedWallet.config.network);
    return importedWallet;
  }

  // Load all persisted wallets
  public async retrieveAllWallets(): Promise<Wallet[]> {
    const wallets = await this.storageService.retrieveAllWallets();
    if (!wallets) {
      return [];
    }
    return wallets.map(
      data =>
        new Wallet(data.identifier, data.name, data.address, data.config, data.encryptedPhrase),
    );
  }

  // This is used to check whether the user should be shown the welcome screen or being redirected straight to their home screen
  public async hasWalletBeenCreated(): Promise<boolean> {
    const allWallets = await this.retrieveAllWallets();
    return allWallets.length > 0;
  }

  // Save freshly created or imported wallet
  public async persistWallet(wallet: Wallet) {
    await this.storageService.saveWallet(wallet);
  }

  public async findWalletByIdentifier(identifier: string): Promise<Wallet> {
    return this.storageService.findWalletByIdentifier(identifier);
  }

  public async setCurrentSession(session: Session) {
    await this.storageService.setSession(session);
  }
}

export const walletService = new WalletService();
