import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useBroadcast<T>(
  channelName: string,
  onMessage: (payload: T) => void
) {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // 1) Cria/entra no canal
    const channel = supabase.channel(channelName);

    // 2) Escuta TODOS os eventos broadcast (event:'*')
    channel
      .on('broadcast', { event: '*' }, (payload) => {
        onMessage(payload as T);
      })
      .subscribe();  // subscreve ao canal :contentReference[oaicite:0]{index=0}

    channelRef.current = channel;

    return () => {
      // Limpa a assinatura ao desmontar
      supabase.removeChannel(channelRef.current!); // remove canal :contentReference[oaicite:1]{index=1}
    };
  }, [channelName, onMessage]);
}
