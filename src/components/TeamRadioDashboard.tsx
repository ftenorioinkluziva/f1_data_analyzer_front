import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export type TeamRadioMessage = {
  id: number;
  session_id: number;
  timestamp: string;
  utc_time: string | null;
  driver_number: string;
  audio_path: string;
  transcript?: string | null;
  transcript_status?: 'pending' | 'completed' | 'error' | null;
  created_at: string;
  updated_at: string;
};

type DriverInfo = {
  session_id: number;
  driver_number: string;
  full_name: string;
  broadcast_name: string;
  tle: string;
  team_name: string;
  team_color: string;
  initial_position: number;
};

export const TeamRadioDashboard: React.FC = () => {
  // States
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [sessions, setSessions] = useState<number[]>([]);
  const [periodFilter, setPeriodFilter] = useState<'atual' | 'historico'>('atual');
  const [teamRadioMessages, setTeamRadioMessages] = useState<TeamRadioMessage[]>([]);
  const [driverInfo, setDriverInfo] = useState<DriverInfo[]>([]);
  const [currentMessage, setCurrentMessage] = useState<TeamRadioMessage | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Replay functionality
  const [rows, setRows] = useState<TeamRadioMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);

  // Fetch available sessions
  useEffect(() => {
    const fetchSessions = async () => {
      const { data, error } = await supabase
        .from('team_radio')
        .select('session_id')
        .order('session_id', { ascending: false });
      
      if (data && !error) {
        const uniqueSessions = [...new Set(data.map(item => item.session_id))];
        setSessions(uniqueSessions);
        if (uniqueSessions.length > 0 && !selectedSession) {
          setSelectedSession(uniqueSessions[0]);
        }
      }
    };

    fetchSessions();
  }, [selectedSession]);

  // Fetch driver info for selected session
  useEffect(() => {
    if (!selectedSession) return;

    const fetchDriverInfo = async () => {
      const { data, error } = await supabase
        .from('session_drivers')
        .select('*')
        .eq('session_id', selectedSession);
      
      if (data && !error) {
        setDriverInfo(data);
      }
    };

    fetchDriverInfo();
  }, [selectedSession]);

  // Fetch team radio messages for selected session
  useEffect(() => {
    if (!selectedSession) return;

    // Reset current index when changing sessions
    setCurrentIndex(0);
    setIsPlaying(false);

    const fetchTeamRadioMessages = async () => {
      const { data, error } = await supabase
        .from('team_radio')
        .select('*')
        .eq('session_id', selectedSession)
        .order('timestamp', { ascending: true });
      
      if (data && !error) {
        setRows(data);
        
        // For the current view when in 'atual' mode
        if (periodFilter === 'atual' && data.length > 0) {
          setCurrentMessage(data[data.length - 1]);
          setTeamRadioMessages(data.slice(-10).reverse()); // Show last 10 messages
        } else if (data.length > 0) {
          setCurrentMessage(data[0]); // Initially show the first message in historical mode
          setTeamRadioMessages(data.slice(0, 10)); // Show first 10 messages
        }
      }
    };

    fetchTeamRadioMessages();

    // Realtime subscription
    const channel = supabase
      .channel('public:team_radio')
      .on(
        'postgres_changes',
        { 
          schema: 'public', 
          table: 'team_radio', 
          event: '*',
          filter: `session_id=eq.${selectedSession}`
        },
        ({ eventType, new: newRow, old: oldRow }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const typedNewRow = newRow as TeamRadioMessage;
            
            // Update rows array
            setRows(current => {
              const updatedRows = [...current];
              const existingIndex = updatedRows.findIndex(r => r.id === typedNewRow.id);
              
              if (existingIndex >= 0) {
                updatedRows[existingIndex] = typedNewRow;
              } else {
                updatedRows.push(typedNewRow);
                // Sort by timestamp
                updatedRows.sort((a, b) => 
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
              }
              
              return updatedRows;
            });
            
            // Update current message if in atual mode and it's the latest message
            if (periodFilter === 'atual') {
              setCurrentMessage(typedNewRow);
              
              // Update team radio messages list
              setTeamRadioMessages(current => {
                const newMessages = [typedNewRow, ...current.slice(0, 9)];
                return newMessages;
              });
            }
          } else if (eventType === 'DELETE') {
            const typedOldRow = oldRow as TeamRadioMessage;
            
            // Remove from rows array
            setRows(current => current.filter(r => r.id !== typedOldRow.id));
            
            // Remove from team radio messages list
            setTeamRadioMessages(current => 
              current.filter(item => item.id !== typedOldRow.id)
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedSession, periodFilter]);

  // Effect for replay functionality
  useEffect(() => {
    if (isPlaying && rows.length > 0) {
      const interval = setInterval(() => {
        setCurrentIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= rows.length) {
            setIsPlaying(false);
            return prevIndex;
          }
          
          // Update the current message with the current point during replay
          setCurrentMessage(rows[nextIndex]);
          
          // Update team radio messages list for historical mode
          if (periodFilter === 'historico') {
            // Show a window of messages around the current index
            const startIdx = Math.max(0, nextIndex - 5);
            const endIdx = Math.min(rows.length, nextIndex + 5);
            setTeamRadioMessages(rows.slice(startIdx, endIdx));
          }
          
          return nextIndex;
        });
      }, 2000 / replaySpeed); // Slower replay to give time to listen to messages

      return () => clearInterval(interval);
    }
  }, [isPlaying, rows, replaySpeed, periodFilter]);

  // Effect for handling period filter changes
  useEffect(() => {
    if (rows.length === 0) return;
    
    if (periodFilter === 'atual') {
      // In atual mode, show the latest message
      setCurrentMessage(rows[rows.length - 1]);
      setTeamRadioMessages(rows.slice(-10).reverse()); // Show last 10 messages
      setCurrentIndex(rows.length - 1);
    } else {
      // In historico mode, start from the beginning for replay
      setCurrentMessage(rows[currentIndex]);
      
      // Show a window of messages around the current index
      const startIdx = Math.max(0, currentIndex - 5);
      const endIdx = Math.min(rows.length, currentIndex + 5);
      setTeamRadioMessages(rows.slice(startIdx, endIdx));
    }
  }, [periodFilter, rows, currentIndex]);

  // Request transcription for audio message
  const requestTranscription = async (messageId: number) => {
    if (!currentMessage) return;
    
    setIsTranscribing(true);
    setTranscriptionError(null);
    
    try {
      // Chamar a função Edge do Supabase para transcrição
      // Explicitamente enviar 'en' para áudios em inglês, ou null para auto-detecção
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { 
          messageId,
          language: 'en'  // Definido como inglês para F1
        }
      });
      
      if (error) throw new Error(error.message);
      
      // Atualizar o currentMessage com a transcrição
      setCurrentMessage(prev => {
        if (!prev) return null;
        return {
          ...prev,
          transcript: data.transcript,
          transcript_status: 'completed'
        };
      });
      
      // Atualizar também na lista de mensagens
      setTeamRadioMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, transcript: data.transcript, transcript_status: 'completed' } 
            : msg
        )
      );
      
    } catch (error) {
      console.error('Erro na transcrição:', error);
      setTranscriptionError('Falha ao transcrever áudio. Tente novamente.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Play audio message
  const playAudio = (audioPath: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
    // Create new audio element
    const audio = new Audio(audioPath);
    audioRef.current = audio;
    
    audio.onended = () => {
      setIsAudioPlaying(false);
    };
    
    audio.onplay = () => {
      setIsAudioPlaying(true);
    };
    
    audio.play().catch(error => {
      console.error('Failed to play audio:', error);
      setIsAudioPlaying(false);
    });
  };

  // Formatar data/hora para exibição
  const getFormattedDateTime = (timestamp: string | undefined) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Helper function to get driver information
  const getDriverInfo = (driverNumber: string) => {
    return driverInfo.find(d => d.driver_number === driverNumber);
  };

  // Helper function to get driver name
  const getDriverName = (driverNumber: string) => {
    const driver = getDriverInfo(driverNumber);
    return driver?.full_name || `Piloto #${driverNumber}`;
  };

  // Helper function to get team color
  const getDriverColor = (driverNumber: string) => {
    const driver = getDriverInfo(driverNumber);
    return driver?.team_color || '#ffffff';
  };

  if (!currentMessage && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-xl">Carregando comunicações de rádio...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-4">
        {/* Cabeçalho e Filtros */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Comunicações por Rádio</h1>
            <p className="text-gray-400">
              {currentMessage ? getFormattedDateTime(currentMessage.timestamp) : ''}
            </p>
          </div>
          
          <div className="flex flex-col md:flex-row items-end space-y-2 md:space-y-0 md:space-x-8 mt-4 md:mt-0">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Sessão</label>
              <select 
                value={selectedSession || ''}
                onChange={(e) => setSelectedSession(Number(e.target.value))}
                className="bg-gray-800 text-white px-4 py-2 rounded w-full md:w-auto"
              >
                {sessions.map(session => (
                  <option key={session} value={session}>Sessão #{session}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Período</label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPeriodFilter('atual')}
                  className={`px-4 py-2 rounded ${periodFilter === 'atual' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  Atual
                </button>
                <button
                  onClick={() => setPeriodFilter('historico')}
                  className={`px-4 py-2 rounded ${periodFilter === 'historico' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  Histórico
                </button>
              </div>
            </div>

            {/* Controles de Replay (apenas visível no modo histórico) */}
            {periodFilter === 'historico' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Replay</label>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => {
                      const prevIndex = Math.max(0, currentIndex - 1);
                      setCurrentIndex(prevIndex);
                      setCurrentMessage(rows[prevIndex]);
                      
                      // Update team radio messages list for historical mode
                      const startIdx = Math.max(0, prevIndex - 5);
                      const endIdx = Math.min(rows.length, prevIndex + 5);
                      setTeamRadioMessages(rows.slice(startIdx, endIdx));
                    }}
                    className="p-2 rounded bg-gray-700 hover:bg-gray-600"
                    disabled={currentIndex === 0}
                  >
                    ⏮️
                  </button>
                  
                  <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 rounded bg-gray-700 hover:bg-gray-600"
                  >
                    {isPlaying ? '⏸️' : '▶️'}
                  </button>
                  
                  <button 
                    onClick={() => {
                      const nextIndex = Math.min(rows.length - 1, currentIndex + 1);
                      setCurrentIndex(nextIndex);
                      setCurrentMessage(rows[nextIndex]);
                      
                      // Update team radio messages list for historical mode
                      const startIdx = Math.max(0, nextIndex - 5);
                      const endIdx = Math.min(rows.length, nextIndex + 5);
                      setTeamRadioMessages(rows.slice(startIdx, endIdx));
                    }}
                    className="p-2 rounded bg-gray-700 hover:bg-gray-600"
                    disabled={currentIndex === rows.length - 1}
                  >
                    ⏭️
                  </button>
                  
                  <select 
                    value={replaySpeed}
                    onChange={(e) => setReplaySpeed(Number(e.target.value))}
                    className="bg-gray-700 p-2 rounded"
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={5}>5x</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Comunicação atual */}
        {currentMessage && (
          <div className="mb-6 bg-gray-800 rounded-lg p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between">
              <div className="flex items-center">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold mr-4"
                  style={{ backgroundColor: getDriverColor(currentMessage.driver_number) }}
                >
                  {currentMessage.driver_number}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{getDriverName(currentMessage.driver_number)}</h2>
                 
                </div>
              </div>
              
              <div className="mt-4 md:mt-0">
                <div className="flex flex-col md:flex-row gap-2">
                  <button 
                    onClick={() => playAudio(currentMessage.audio_path)}
                    className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
                    disabled={isAudioPlaying}
                  >
                    <span>{isAudioPlaying ? 'Reproduzindo...' : 'Reproduzir'}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    </svg>
                  </button>
                  
                  <button 
                    onClick={() => requestTranscription(currentMessage.id)}
                    className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded"
                    disabled={isTranscribing || Boolean(currentMessage.transcript)}
                  >
                    <span>
                      {isTranscribing 
                        ? 'Transcrevendo...' 
                        : currentMessage.transcript 
                          ? 'Já Transcrito' 
                          : 'Transcrever'}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15c0-4.625-3.51-8.45-8-8.95M3 15a9 9 0 0 1 18 0"></path>
                      <path d="M3 15v-2"></path>
                      <path d="M21 15v-2"></path>
                      <path d="M12 16a1 1 0 0 0 0-2"></path>
                      <path d="M8 16a1 1 0 0 0 0-2"></path>
                      <path d="M16 16a1 1 0 0 0 0-2"></path>
                    </svg>
                  </button>
                </div>
                
                {transcriptionError && (
                  <p className="text-red-500 text-sm mt-2">{transcriptionError}</p>
                )}
              </div>
            </div>
            
            <div className="mt-4">
              <p className="text-sm text-gray-400">
                Timestamp: {getFormattedDateTime(currentMessage.timestamp)}
              </p>
              {currentMessage.utc_time && (
                <p className="text-sm text-gray-400">
                  UTC Time: {currentMessage.utc_time}
                </p>
              )}
              
              {/* Transcrição */}
              {currentMessage.transcript && (
                <div className="mt-4 p-3 bg-gray-700 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-300 mb-1">Transcrição:</h4>
                  <p className="text-white">{currentMessage.transcript}</p>
                </div>
              )}
              
              {isTranscribing && (
                <div className="mt-4 flex items-center text-gray-300">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 mr-2"></div>
                  <span>Transcrevendo áudio...</span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Lista de comunicações recentes */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold">
              {periodFilter === 'atual' ? 'Comunicações Recentes' : 'Histórico de Comunicações'}
            </h3>
          </div>
          
          <div className="divide-y divide-gray-700">
            {teamRadioMessages.map((message) => (
              <div 
                key={message.id} 
                className={`p-4 hover:bg-gray-700 transition-colors ${message.id === currentMessage?.id ? 'bg-blue-900' : ''}`}
                onClick={() => {
                  setCurrentMessage(message);
                  if (periodFilter === 'historico') {
                    const messageIndex = rows.findIndex(row => row.id === message.id);
                    if (messageIndex !== -1) {
                      setCurrentIndex(messageIndex);
                    }
                  }
                }}
              >
                <div className="flex items-center">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold mr-3"
                    style={{ backgroundColor: getDriverColor(message.driver_number) }}
                  >
                    {message.driver_number}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{getDriverName(message.driver_number)}</h4>
                        
                        
                        {/* Mostrar transcrição se disponível */}
                        {message.transcript && (
                          <p className="text-sm text-gray-300 mt-1 italic">"{message.transcript}"</p>
                        )}
                      </div>
                      <span className="text-sm text-gray-400">
                        {new Date(message.timestamp).toLocaleTimeString('pt-BR', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="ml-4 flex gap-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        playAudio(message.audio_path);
                      }}
                      className="p-2 bg-gray-700 hover:bg-gray-600 rounded"
                      title="Reproduzir"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                      </svg>
                    </button>
                    
                    {!message.transcript && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          requestTranscription(message.id);
                        }}
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded"
                        title="Transcrever"
                        disabled={isTranscribing}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15c0-4.625-3.51-8.45-8-8.95M3 15a9 9 0 0 1 18 0"></path>
                          <path d="M3 15v-2"></path>
                          <path d="M21 15v-2"></path>
                          <path d="M12 16a1 1 0 0 0 0-2"></path>
                          <path d="M8 16a1 1 0 0 0 0-2"></path>
                          <path d="M16 16a1 1 0 0 0 0-2"></path>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {teamRadioMessages.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                Nenhuma comunicação de rádio encontrada para esta sessão.
              </div>
            )}
          </div>
        </div>
        
        {/* Barra de progresso para modo histórico */}
        {periodFilter === 'historico' && rows.length > 0 && (
          <div className="mt-6 bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Início</span>
              <span>Progresso</span>
              <span>Fim</span>
            </div>
            <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-blue-500 h-full"
                style={{ 
                  width: `${(currentIndex / (rows.length - 1)) * 100}%` 
                }}
              ></div>
            </div>
            <div className="flex justify-center mt-2 text-sm">
              <span>
                Mensagem {currentIndex + 1} de {rows.length}
              </span>
            </div>
          </div>
        )}
      </div>
      
      {/* Audio element for playback (hidden) */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default TeamRadioDashboard;