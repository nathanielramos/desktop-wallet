import * as React from 'react';
import { useCallback, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { useRecoilState, useRecoilValue } from 'recoil';
import { usePasswordModal } from '../../../components/PasswordForm/PasswordFormModal';
import { useCronosEvmAsset } from '../../../hooks/useCronosEvmAsset';
import { allMarketState, navbarMenuSelectedKeyState, sessionState } from '../../../recoil/atom';
import { secretStoreService } from '../../../service/storage/SecretStoreService';
import { walletConnectPeerMetaAtom } from '../../../service/walletconnect/store';
import { useWalletConnect } from '../../../service/walletconnect/useWalletConnect';
import RequestConfirmation from '../../dapp/components/RequestConfirmation/RequestConfirmation';
import { handleEvent } from '../provider';
import { ConnectModal } from './ConnectModal';

const { ipcRenderer } = window.require('electron');

// const APP_PROTOCOL_NAME = 'cryptowallet';
const APP_PROTOCOL_NAME = 'ledgerlive';
const WALLET_CONNECT_PAGE_KEY = '/walletconnect';

export const WalletConnectModal = () => {
  const { connect, state, restoreSession, requests, cancelRequest, approveRequest } = useWalletConnect();
  const peerMeta = useRecoilValue(walletConnectPeerMetaAtom);
  const history = useHistory();

  const { show, passphrase } = usePasswordModal();
  const allMarketData = useRecoilValue(allMarketState);
  const currentSession = useRecoilValue(sessionState);
  const cronosAsset = useCronosEvmAsset();
  const address = cronosAsset?.address;
  const [navbarMenuSelectedKey, setNavbarMenuSelectedKey] = useRecoilState(
    navbarMenuSelectedKeyState,
  );

  useEffect(() => {
    if (state.connected) {
      history.push(WALLET_CONNECT_PAGE_KEY);
      setNavbarMenuSelectedKey(WALLET_CONNECT_PAGE_KEY);
    } else {
      if (navbarMenuSelectedKey === '/walletconnect') {
        history.push('/home');
        setNavbarMenuSelectedKey('/home');
      }
    }
  }, [state.connected]);

  const handleOpenURL = useCallback(
    (_event, urlString: string) => {
      console.log('ACTION handleOpenURL');
      if (urlString?.length < 1 || !urlString.startsWith(`${APP_PROTOCOL_NAME}://wc`)) {
        return;
      }

      const url = new URL(urlString);
      const wcURL = url.searchParams.get('uri');

      if (!wcURL) {
        return;
      }

      connect(wcURL, 1, address ?? '');
    },
    [connect],
  );

  useEffect(() => {

  }, []);


  useEffect(() => {
    ipcRenderer.on('open-url', handleOpenURL);
    restoreSession();

    return () => {
      ipcRenderer.removeListener('open-url', handleOpenURL);
    };
  }, []);

  if (!address) {
    return <></>;
  }

  return (
    <>
      {
        requests.length > 0 && peerMeta && <RequestConfirmation
          event={requests[0]}
          cronosAsset={cronosAsset}
          allMarketData={allMarketData}
          dapp={{
            name: peerMeta.name ?? '',
            logo: peerMeta.icons?.[0] ?? '',
            alt: peerMeta.name ?? '',
            url: peerMeta.url ?? '',
            description: peerMeta.description ?? '',
          }}
          currentSession={currentSession}
          wallet={currentSession.wallet}
          visible
          onConfirm={() => {
            const request = requests[0];


            const handler = async (passphrase: string) => {
              const mnemonic = await secretStoreService.decryptPhrase(
                passphrase,
                currentSession.wallet.identifier,
              );

              handleEvent(request, mnemonic, (request, sig) => {
                approveRequest(request, sig);
              });
            };

            if (!passphrase) {
              show({
                onCancel: () => { },
                onSuccess: (passphrase) => {
                  handler(passphrase);
                },
              });
              return;
            }

            handler(passphrase);


          }}
          onCancel={() => {
            cancelRequest(requests[0]);
          }}
        />
      }
      <ConnectModal address={address} />
    </>
  );
};
