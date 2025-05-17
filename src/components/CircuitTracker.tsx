import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Tipos para o componente
type DriverPosition = {
  id: number;
  session_id: number;
  driver_number: string;
  x_coord: number | null;
  y_coord: number | null;
  z_coord: number | null;
  timestamp: string;
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

// Tipo para rastrear a última posição conhecida de cada piloto
type LastKnownPositions = {
  [driverNumber: string]: {
    x: number;
    y: number;
    z: number | null;
    timestamp: string;
  };
};

const CircuitTracker = () => {
  // Estados para dados
  const [allDriverPositions, setAllDriverPositions] = useState<LastKnownPositions>({});
  const [currentFramePositions, setCurrentFramePositions] = useState<DriverPosition[]>([]);
  const [driverHistory, setDriverHistory] = useState<DriverPosition[][]>([]);
  const [driverInfo, setDriverInfo] = useState<DriverInfo[]>([]);
  const [sessions, setSessions] = useState<number[]>([]);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [circuitCoordinates, setCircuitCoordinates] = useState<{x: number, y: number}[]>([]);
  
  // Estados para controle de replay
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayTimestamps, setReplayTimestamps] = useState<string[]>([]);

  // Buscar sessões disponíveis
  useEffect(() => {
    const fetchSessions = async () => {
      const { data, error } = await supabase
        .from('car_positions')
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

  // Buscar informações dos pilotos
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

  // Buscar histórico de posições e gerar traçado do circuito
  useEffect(() => {
    if (!selectedSession) return;

    // Reset replay state
    setCurrentIndex(0);
    setIsPlaying(false);
    setAllDriverPositions({});
    
    const fetchDriverHistory = async () => {
      const { data, error } = await supabase
        .from('car_positions')
        .select('*')
        .eq('session_id', selectedSession)
        .order('timestamp', { ascending: true });
      
      if (data && !error) {
        // Gerar pontos para o traçado do circuito
        const validPositions = data.filter(
          pos => pos.x_coord !== null && pos.y_coord !== null
        );
        
        // Extrair pontos únicos para o traçado
        const trackPoints = new Set<string>();
        const coordinates: {x: number, y: number}[] = [];
        
        validPositions.forEach(pos => {
          if (pos.x_coord === null || pos.y_coord === null) return;
          
          // Arredondar para reduzir pontos e agrupar próximos
          const roundedX = Math.round(pos.x_coord / 5) * 5;
          const roundedY = Math.round(pos.y_coord / 5) * 5;
          const key = `${roundedX},${roundedY}`;
          
          if (!trackPoints.has(key)) {
            trackPoints.add(key);
            coordinates.push({ x: pos.x_coord, y: pos.y_coord });
          }
        });
        
        setCircuitCoordinates(coordinates);
        
        // Agrupar posições por timestamp
        const positionsByTimestamp = data.reduce((acc, position) => {
          const timestamp = position.timestamp;
          if (!acc[timestamp]) {
            acc[timestamp] = [];
          }
          acc[timestamp].push(position);
          return acc;
        }, {} as Record<string, DriverPosition[]>);
        
        // Converter para array ordenado por timestamp
        const timestamps = Object.keys(positionsByTimestamp).sort();
        const history = timestamps.map(ts => positionsByTimestamp[ts]);
        
        setReplayTimestamps(timestamps);
        setDriverHistory(history);
        
        // Inicializar com o primeiro frame
        if (history.length > 0) {
          updateCurrentFrame(history[0]);
        }
      }
    };

    fetchDriverHistory();
  }, [selectedSession]);

  // Função para atualizar o frame atual e manter um registro de todas as posições conhecidas
  const updateCurrentFrame = (framePositions: DriverPosition[]) => {
    // Atualizar frame atual
    setCurrentFramePositions(framePositions);
    
    // Atualizar posições acumuladas
    setAllDriverPositions(prevPositions => {
      const newPositions = { ...prevPositions };
      
      framePositions.forEach(position => {
        if (position.x_coord !== null && position.y_coord !== null) {
          newPositions[position.driver_number] = {
            x: position.x_coord,
            y: position.y_coord,
            z: position.z_coord,
            timestamp: position.timestamp
          };
        }
      });
      
      return newPositions;
    });
  };

  // Controle de replay
  useEffect(() => {
    if (isPlaying && driverHistory.length > 0) {
      const interval = setInterval(() => {
        setCurrentIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= driverHistory.length) {
            setIsPlaying(false);
            return prevIndex;
          }
          updateCurrentFrame(driverHistory[nextIndex]);
          return nextIndex;
        });
      }, 1000 / replaySpeed);

      return () => clearInterval(interval);
    }
  }, [isPlaying, driverHistory.length, replaySpeed, driverHistory]);

  // Normalizar coordenadas para o espaço da visualização
  const normalizeCoordinates = (x: number | null | undefined, y: number | null | undefined) => {
    if (x === undefined || x === null || y === undefined || y === null) {
      return { x: 50, y: 50 }; // Centro da imagem como fallback
    }
    
    // Valores baseados no mapa real do circuito
    const MIN_X = -4000;  // Valor mínimo de x
    const MAX_X = 10000;  // Valor máximo de x
    const MIN_Y = -10000; // Valor mínimo de y
    const MAX_Y = 7500;   // Valor máximo de y
    
    // Normalizar para valores entre 0 e 100 (porcentagem)
    const normalizedX = ((x - MIN_X) / (MAX_X - MIN_X)) * 100;
    // Inverter Y porque em CSS o eixo Y é invertido (0 no topo, aumenta para baixo)
    const normalizedY = (1 - ((y - MIN_Y) / (MAX_Y - MIN_Y))) * 100;
    
    return { x: normalizedX, y: normalizedY };
  };

  // Funções auxiliares para obter informações dos pilotos
  const getDriverColor = (driverNumber: string) => {
    const driver = driverInfo.find(d => d.driver_number === driverNumber);
    return driver?.team_color || '#ffffff';
  };

  const getDriverName = (driverNumber: string) => {
    const driver = driverInfo.find(d => d.driver_number === driverNumber);
    return driver?.full_name || `Piloto #${driverNumber}`;
  };

  const getTeamName = (driverNumber: string) => {
    const driver = driverInfo.find(d => d.driver_number === driverNumber);
    return driver?.team_name || '';
  };

  // Verificar se a posição foi atualizada no frame atual
  const isPositionInCurrentFrame = (driverNumber: string) => {
    return currentFramePositions.some(pos => pos.driver_number === driverNumber);
  };

  // Formatar timestamp para exibição
  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  // Timestamp atual para exibição
  const currentTimestamp = useMemo(() => {
    if (replayTimestamps.length > 0 && currentIndex < replayTimestamps.length) {
      return formatTimestamp(replayTimestamps[currentIndex]);
    }
    return '';
  }, [currentIndex, replayTimestamps]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto p-4">
        {/* Cabeçalho e controles */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">Rastreador de Pilotos no Circuito</h1>
            <p className="text-gray-400">{currentTimestamp}</p>
          </div>
          
          <div className="mt-4 md:mt-0 flex items-center gap-2">
            <div>
              <select 
                value={selectedSession || ''}
                onChange={(e) => setSelectedSession(Number(e.target.value))}
                className="bg-gray-800 text-white px-4 py-2 rounded"
              >
                {sessions.map(session => (
                  <option key={session} value={session}>Sessão #{session}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={() => {
                  const prevIndex = Math.max(0, currentIndex - 1);
                  setCurrentIndex(prevIndex);
                  if (prevIndex >= 0) {
                    updateCurrentFrame(driverHistory[prevIndex]);
                  }
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
                  const nextIndex = Math.min(driverHistory.length - 1, currentIndex + 1);
                  setCurrentIndex(nextIndex);
                  updateCurrentFrame(driverHistory[nextIndex]);
                }}
                className="p-2 rounded bg-gray-700 hover:bg-gray-600"
                disabled={currentIndex >= driverHistory.length - 1}
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
        </div>
        
        {/* Barra de progresso */}
        <div className="mb-4 bg-gray-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Início</span>
            <span>Progresso</span>
            <span>Fim</span>
          </div>
          <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full"
              style={{ 
                width: `${driverHistory.length > 0 ? (currentIndex / (driverHistory.length - 1)) * 100 : 0}%` 
              }}
            ></div>
          </div>
          <div className="flex justify-center mt-2 text-sm">
            <span>
              Frame {currentIndex + 1} de {driverHistory.length}
            </span>
          </div>
        </div>
        
        {/* Visualização do circuito */}
        <div className="bg-black rounded-lg overflow-hidden mb-6">
          <div className="relative" style={{ height: '500px' }}>
            {/* Traçado do circuito */}
            <svg className="absolute top-0 left-0 w-full h-full" style={{ zIndex: 1 }}>
              {/* Pontos do circuito */}
              {circuitCoordinates.map((coord, index) => {
                const { x, y } = normalizeCoordinates(coord.x, coord.y);
                return (
                  <circle 
                    key={index}
                    cx={`${x}%`} 
                    cy={`${y}%`} 
                    r="1" 
                    fill="rgba(255, 255, 255, 0.3)"
                  />
                );
              })}
            </svg>
            
            {/* Container para os pilotos */}
            <div className="absolute top-0 left-0 w-full h-full" style={{ zIndex: 2 }}>
              {/* Renderizar TODOS os pilotos com posições conhecidas */}
              {Object.entries(allDriverPositions).map(([driverNumber, position]) => {
                const { x, y } = normalizeCoordinates(position.x, position.y);
                const driverColor = getDriverColor(driverNumber);
                const isCurrentlyUpdated = isPositionInCurrentFrame(driverNumber);
                
                return (
                  <div 
                    key={driverNumber}
                    className="absolute w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transform -translate-x-1/2 -translate-y-1/2"
                    style={{ 
                      left: `${x}%`, 
                      top: `${y}%`,
                      backgroundColor: driverColor,
                      border: isCurrentlyUpdated ? '3px solid white' : '1px solid white',
                      color: '#000000',
                      fontWeight: 'bold',
                      opacity: isCurrentlyUpdated ? 1 : 0.7,
                      zIndex: isCurrentlyUpdated ? 10 : 5,
                      transition: 'all 0.3s ease-out'
                    }}
                    title={`${getDriverName(driverNumber)} - ${getTeamName(driverNumber)}`}
                  >
                    {driverNumber}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Legenda dos pilotos - Mostrar todos os pilotos com posições conhecidas */}
        <div className="bg-gray-800 p-4 rounded-lg mb-6">
          <h2 className="text-lg font-semibold mb-3">Pilotos em Pista</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {driverInfo
              .filter(driver => 
                Object.keys(allDriverPositions).includes(driver.driver_number)
              )
              .map(driver => {
                const isActive = isPositionInCurrentFrame(driver.driver_number);
                return (
                  <div 
                    key={driver.driver_number} 
                    className={`flex items-center ${isActive ? 'font-semibold' : 'opacity-70'}`}
                  >
                    <div 
                      className="w-4 h-4 rounded-full mr-2 flex-shrink-0"
                      style={{ 
                        backgroundColor: driver.team_color || '#ffffff',
                        border: isActive ? '1px solid white' : 'none'
                      }}
                    ></div>
                    <div className="overflow-hidden">
                      <div className="truncate">#{driver.driver_number} {driver.full_name}</div>
                      <div className="text-xs text-gray-400 truncate">{driver.team_name}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CircuitTracker;