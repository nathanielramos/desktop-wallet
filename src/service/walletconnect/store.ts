import { atom } from 'recoil';
import { IClientMeta } from '@walletconnect/types';
import WalletConnect from '@walletconnect/client';
import { EVMChainConfig } from '../../models/Chain';

export interface WalletConnectState {
  connected: boolean;
  loading: boolean;
  fetchingPeerMeta: boolean;
  address: string;
}

export const DefaultState: WalletConnectState = {
  connected: false,
  loading: false,
  fetchingPeerMeta: false,
  address: '',
};

export const walletConnectSelectedChainConfigAtom = atom<EVMChainConfig | null>({
  key: 'walletConnectSelectedChainConfigAtom',
  default: null,
});

export const walletConnectPeerMetaAtom = atom<Partial<IClientMeta> | null>({
  key: 'walletConnectPeerMetaAtom',
  default: null,
});

export const walletConnectConnectorAtom = atom<WalletConnect | null>({
  key: 'walletConnectConnectorAtom',
  default: null,
  dangerouslyAllowMutability: true,
});

export const walletConnectStateAtom = atom<WalletConnectState>({
  key: 'walletConnectStateAtom',
  default: DefaultState,
});
