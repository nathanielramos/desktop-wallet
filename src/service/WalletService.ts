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
import { cryptographer } from '../crypto/Cryptographer';
import { secretStoreService } from '../storage/SecretStoreService';
import { AssetMarketPrice, UserAsset } from '../models/UserAsset';
import { croMarketPriceApi } from './rpc/MarketApi';

export interface TransferRequest {
  toAddress: string;
  amount: string;
  memo: string;
  decryptedPhrase: string;
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

    const signedTxHex = await transactionSigner.signTransfer(
      transfer,
      transferRequest.decryptedPhrase,
    );
    return nodeRpc.broadcastTransaction(signedTxHex);
  }

  public async sendDelegateTransaction(
    delegatorAddress: string,
    validatorAddress: string,
    amount: string,
    memo: string,
    decryptedPhrase: string,
  ) {
    const {
      nodeRpc,
      accountNumber,
      accountSequence,
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

    const signedTxHex = await transactionSigner.signDelegateTx(
      delegateTransaction,
      decryptedPhrase,
    );
    return nodeRpc.broadcastTransaction(signedTxHex);
  }

  public async sendStakingRewardWithdrawalTx(
    delegatorAddress: string,
    validatorAddress: string,
    amount: string,
    memo: string,
    decryptedPhrase: string,
  ) {
    const {
      nodeRpc,
      accountNumber,
      accountSequence,
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
      decryptedPhrase,
    );
    return nodeRpc.broadcastTransaction(signedTxHex);
  }

  public async prepareTransaction() {
    const currentSession = await this.storageService.retrieveCurrentSession();
    const currentWallet = currentSession.wallet;

    const nodeRpc = await NodeRpcService.init(currentWallet.config.nodeUrl);

    const accountNumber = await nodeRpc.fetchAccountNumber(currentWallet.address);
    const accountSequence = await nodeRpc.loadSequenceNumber(currentWallet.address);

    const transactionSigner = new TransactionSigner(currentWallet.config);

    return {
      nodeRpc,
      accountNumber,
      accountSequence,
      currentWallet,
      transactionSigner,
    };
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
    return newWallet;
  }

  public async persistInitialAsset(walletId: string, network: Network) {
    const defaultAsset: UserAsset = {
      ...DefaultAsset(network),
      walletId,
    };

    await this.storageService.saveAsset(defaultAsset);
  }

  // Import or restore wallet and persist it on the db
  public async restoreAndSaveWallet(importOptions: WalletImportOptions): Promise<Wallet> {
    const importedWallet = WalletImporter.import(importOptions);
    await this.persistWallet(importedWallet);
    return importedWallet;
  }

  // eslint-disable-next-line class-methods-use-this
  public async restoreWallet(importOptions: WalletImportOptions): Promise<Wallet> {
    return WalletImporter.import(importOptions);
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
    await this.persistInitialAsset(wallet.identifier, wallet.config.network);
  }

  public async findWalletByIdentifier(identifier: string): Promise<Wallet> {
    return this.storageService.findWalletByIdentifier(identifier);
  }

  public async setCurrentSession(session: Session): Promise<void> {
    await this.storageService.setSession(session);
    return this.syncData(session);
  }

  public async fetchAndUpdateBalances(session: Session | null = null) {
    const currentSession =
      session == null ? await this.storageService.retrieveCurrentSession() : session;
    if (!currentSession) {
      return;
    }
    const nodeRpc = await NodeRpcService.init(currentSession.wallet.config.nodeUrl);

    const assets: UserAsset[] = await this.retrieveCurrentWalletAssets(currentSession);

    if (!assets || assets.length === 0) {
      return;
    }

    await Promise.all(
      assets.map(async asset => {
        const baseDenomination = currentSession.wallet.config.network.coin.baseDenom;
        asset.balance = await nodeRpc.loadAccountBalance(
          currentSession.wallet.address,
          baseDenomination,
        );
        await this.storageService.saveAsset(asset);
      }),
    );
  }

  public async retrieveCurrentWalletAssets(currentSession: Session): Promise<UserAsset[]> {
    const assets = await this.storageService.retrieveAssetsByWallet(
      currentSession.wallet.identifier,
    );

    return assets.map(data => {
      const asset: UserAsset = { ...data };
      return asset;
    });
  }

  public async retrieveDefaultWalletAsset(currentSession: Session): Promise<UserAsset> {
    return (await this.retrieveCurrentWalletAssets(currentSession))[0];
  }

  public async loadAndSaveAssetPrices(session: Session | null = null) {
    const currentSession =
      session == null ? await this.storageService.retrieveCurrentSession() : session;
    if (!currentSession) {
      return;
    }

    const assets: UserAsset[] = await this.retrieveCurrentWalletAssets(currentSession);

    if (!assets || assets.length === 0) {
      return;
    }

    await Promise.all(
      assets.map(async (asset: UserAsset) => {
        const assetPrice = await croMarketPriceApi.getAssetPrice(
          asset.mainnetSymbol,
          currentSession.currency,
        );
        await this.storageService.saveAssetMarketPrice(assetPrice);
      }),
    );
  }

  public async retrieveAssetPrice(
    assetSymbol: string,
    currency: string = 'USD',
  ): Promise<AssetMarketPrice> {
    const price = await this.storageService.retrieveAssetPrice(assetSymbol, currency);
    return {
      ...price,
    };
  }

  public async syncData(session: Session): Promise<void> {
    try {
      await this.fetchAndUpdateBalances(session);
      return this.loadAndSaveAssetPrices(session);
      // eslint-disable-next-line no-empty
    } catch (e) {
      return Promise.resolve();
    }
  }

  public async encryptWalletAndSetSession(key: string, wallet: Wallet): Promise<void> {
    const initialVector = await cryptographer.generateIV();
    const encryptionResult = await cryptographer.encrypt(
      wallet.encryptedPhrase,
      key,
      initialVector,
    );
    wallet.encryptedPhrase = encryptionResult.cipher;

    await this.persistWallet(wallet);
    await secretStoreService.persistEncryptedPhrase(wallet.identifier, encryptionResult);
    await this.setCurrentSession(new Session(wallet));
  }

  public async retrieveCurrentSession(): Promise<Session> {
    return this.storageService.retrieveCurrentSession();
  }
}

export const walletService = new WalletService();
