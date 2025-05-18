import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type RaceControlMessage = {
  id: number;
  session_id: number;
  timestamp: string;
  utc_time: string | null;
  category: string | null;
  message: string | null;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  created_at: string;
  updated_at: string;
};

export const RaceControlDashboard: React.FC = () => {
  // States
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [sessions, setSessions] = useState<number[]>([]);
  const [periodFilter, setPeriodFilter] = useState<'atual' | 'historico'>('atual');
  const [raceControlMessages, setRaceControlMessages] = useState<RaceControlMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState<RaceControlMessage | null>(null);
  
  // Replay functionality
  const [rows, setRows] = useState<RaceControlMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);

  // Fetch available sessions
  useEffect(() => {
    const fetchSessions = async () => {
      const { data, error } = await supabase
        .from('race_control_messages')
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

  // Fetch race control messages for selected session
  useEffect(() => {
    if (!selectedSession) return;

    // Reset current index when changing sessions
    setCurrentIndex(0);
    setIsPlaying(false);

    const fetchRaceControlMessages = async () => {
      const { data, error } = await supabase
        .from('race_control_messages')
        .select('*')
        .eq('session_id', selectedSession)
        .order('timestamp', { ascending: true });
      
      if (data && !error) {
        setRows(data);
        
        // For the current view when in 'atual' mode
        if (periodFilter === 'atual' && data.length > 0) {
          setCurrentMessage(data[data.length - 1]);
          setRaceControlMessages(data.slice(-10).reverse()); // Show last 10 messages
        } else if (data.length > 0) {
          setCurrentMessage(data[0]); // Initially show the first data point in historical mode
          setRaceControlMessages(data.slice(0, 10)); // Show first 10 messages
        }
      }
    };

    fetchRaceControlMessages();

    // Realtime subscription
    const channel = supabase
      .channel('public:race_control_messages')
      .on(
        'postgres_changes',
        { 
          schema: 'public', 
          table: 'race_control_messages', 
          event: '*',
          filter: `session_id=eq.${selectedSession}`
        },
        ({ eventType, new: newRow, old: oldRow }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const typedNewRow = newRow as RaceControlMessage;
            
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
              
              // Update race control messages list
              setRaceControlMessages(current => {
                const newMessages = [typedNewRow, ...current.slice(0, 9)];
                return newMessages;
              });
            }
          } else if (eventType === 'DELETE') {
            const typedOldRow = oldRow as RaceControlMessage;
            
            // Remove from rows array
            setRows(current => current.filter(r => r.id !== typedOldRow.id));
            
            // Remove from race control messages list
            setRaceControlMessages(current => 
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
          
          // Update race control messages list for historical mode
          if (periodFilter === 'historico') {
            // Show a window of messages around the current index
            const startIdx = Math.max(0, nextIndex - 5);
            const endIdx = Math.min(rows.length, nextIndex + 5);
            setRaceControlMessages(rows.slice(startIdx, endIdx));
          }
          
          return nextIndex;
        });
      }, 1000 / replaySpeed);

      return () => clearInterval(interval);
    }
  }, [isPlaying, rows, replaySpeed, periodFilter]);

  // Effect for handling period filter changes
  useEffect(() => {
    if (rows.length === 0) return;
    
    if (periodFilter === 'atual') {
      // In atual mode, show the latest message
      setCurrentMessage(rows[rows.length - 1]);
      setRaceControlMessages(rows.slice(-10).reverse()); // Show last 10 messages
      setCurrentIndex(rows.length - 1);
    } else {
      // In historico mode, start from the beginning for replay
      setCurrentMessage(rows[currentIndex]);
      
      // Show a window of messages around the current index
      const startIdx = Math.max(0, currentIndex - 5);
      const endIdx = Math.min(rows.length, currentIndex + 5);
      setRaceControlMessages(rows.slice(startIdx, endIdx));
    }
  }, [periodFilter, rows, currentIndex]);

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

  // Helper function to get flag color
  const getFlagColor = (flag: string | null | undefined) => {
    if (!flag) return '#ffffff';
    
    switch (flag.toLowerCase()) {
      case 'yellow': return '#f1c40f';
      case 'red': return '#e74c3c';
      case 'blue': return '#3498db';
      case 'green': return '#2ecc71';
      case 'white': return '#ffffff';
      case 'black': return '#000000';
      case 'chequered': return '#000000';
      default: return '#ffffff';
    }
  };

  // Helper function to get flag icon/symbol
  const getFlagIcon = (flag: string | null | undefined) => {
    if (!flag) return null;
    
    switch (flag.toLowerCase()) {
      case 'yellow': return '⚠️';
      case 'red': return '🔴';
      case 'blue': return '🔵';
      case 'green': return '🟢';
      case 'white': return '⚪';
      case 'black': return '⚫';
      case 'chequered': return '🏁';
      default: return null;
    }
  };

  if (!currentMessage && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-xl">Carregando mensagens do controle de corrida...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-4">
        {/* Cabeçalho e Filtros */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Controle de Corrida</h1>
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
                      
                      // Update race control messages list for historical mode
                      const startIdx = Math.max(0, prevIndex - 5);
                      const endIdx = Math.min(rows.length, prevIndex + 5);
                      setRaceControlMessages(rows.slice(startIdx, endIdx));
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
                      
                      // Update race control messages list for historical mode
                      const startIdx = Math.max(0, nextIndex - 5);
                      const endIdx = Math.min(rows.length, nextIndex + 5);
                      setRaceControlMessages(rows.slice(startIdx, endIdx));
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
        
        {/* Mensagem atual */}
        {currentMessage && (
          <div className="mb-6 bg-gray-800 rounded-lg p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between">
              <div className="flex items-center">
                {currentMessage.flag && (
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-2xl mr-4"
                    style={{ backgroundColor: getFlagColor(currentMessage.flag) }}
                  >
                    {getFlagIcon(currentMessage.flag)}
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold">{currentMessage.category || 'Mensagem do Controle'}</h2>
                  <p className="text-gray-400">
                    {currentMessage.scope && `Escopo: ${currentMessage.scope}`}
                    {currentMessage.sector && currentMessage.scope && ' • '}
                    {currentMessage.sector && `Setor: ${currentMessage.sector}`}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-gray-700 rounded">
              <p className="text-lg">{currentMessage.message || 'Sem mensagem'}</p>
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
            </div>
          </div>
        )}
        
        {/* Lista de mensagens recentes */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold">
              {periodFilter === 'atual' ? 'Mensagens Recentes' : 'Histórico de Mensagens'}
            </h3>
          </div>
          
          <div className="divide-y divide-gray-700">
            {raceControlMessages.map((message) => (
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
                  {message.flag && (
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-lg mr-3"
                      style={{ backgroundColor: getFlagColor(message.flag) }}
                    >
                      {getFlagIcon(message.flag)}
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{message.category || 'Mensagem'}</h4>
                        <p className="text-sm text-gray-400 truncate">{message.message}</p>
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
                </div>
              </div>
            ))}
            
            {raceControlMessages.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                Nenhuma mensagem do controle de corrida encontrada para esta sessão.
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
                  width: `${rows.length > 1 ? (currentIndex / (rows.length - 1)) * 100 : 0}%` 
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
    </div>
  );
};

export default RaceControlDashboard;