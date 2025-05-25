import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Tipos
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
  team_name: string;
  team_color: string;
};

type ProcessedCircuitData = {
  trackPath: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  driverTrails: { [driverNumber: string]: { x: number; y: number }[] };
};

const CircuitTracker = () => {
  // Estados principais
  const [allPositions, setAllPositions] = useState<DriverPosition[]>([]);
  const [driverInfo, setDriverInfo] = useState<DriverInfo[]>([]);
  const [sessions, setSessions] = useState<number[]>([233, 234]);
  const [selectedSession, setSelectedSession] = useState<number>(233);
  
  // Estados de controle
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [showTrails, setShowTrails] = useState(true);
  const [trailLength, setTrailLength] = useState(20);
  
  // Estados de visualização
  const [viewBox, setViewBox] = useState({ x: -1000, y: -8000, width: 12000, height: 16000 });
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Buscar dados dos pilotos
  useEffect(() => {
    const fetchDriverInfo = async () => {
      const { data } = await supabase
        .from('session_drivers')
        .select('*')
        .eq('session_id', selectedSession);
      
      if (data) {
        setDriverInfo(data);
      }
    };

    fetchDriverInfo();
  }, [selectedSession]);

  // Buscar posições
  useEffect(() => {
    const fetchPositions = async () => {
      const { data } = await supabase
        .from('car_positions')
        .select('*')
        .eq('session_id', selectedSession)
        .order('timestamp', { ascending: true });
      
      if (data) {
        setAllPositions(data.filter(pos => 
          pos.x_coord !== null && 
          pos.y_coord !== null && 
          !(pos.x_coord === 0 && pos.y_coord === 0)
        ));
        setCurrentIndex(0);
        setIsPlaying(false);
      }
    };

    fetchPositions();
  }, [selectedSession]);

  // Processar dados do circuito e trails
  const processedData = useMemo<ProcessedCircuitData>(() => {
    if (allPositions.length === 0) {
      return { trackPath: '', bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, driverTrails: {} };
    }

    // Calcular bounds
    const xCoords = allPositions.map(p => p.x_coord!);
    const yCoords = allPositions.map(p => p.y_coord!);
    const bounds = {
      minX: Math.min(...xCoords),
      maxX: Math.max(...xCoords),
      minY: Math.min(...yCoords),
      maxY: Math.max(...yCoords)
    };

    // Criar outline do circuito usando todos os pontos únicos
    const trackPoints = new Map<string, { x: number; y: number }>();
    allPositions.forEach(pos => {
      if (pos.x_coord !== null && pos.y_coord !== null) {
        // Discretizar pontos para reduzir ruído
        const discreteX = Math.round(pos.x_coord / 50) * 50;
        const discreteY = Math.round(pos.y_coord / 50) * 50;
        const key = `${discreteX},${discreteY}`;
        trackPoints.set(key, { x: discreteX, y: discreteY });
      }
    });

    // Ordenar pontos para formar um path contínuo (algoritmo simples de nearest neighbor)
    const sortedPoints = Array.from(trackPoints.values());
    if (sortedPoints.length === 0) {
      return { trackPath: '', bounds, driverTrails: {} };
    }

    const orderedPoints = [sortedPoints[0]];
    const remaining = sortedPoints.slice(1);

    while (remaining.length > 0) {
      const lastPoint = orderedPoints[orderedPoints.length - 1];
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      remaining.forEach((point, index) => {
        const distance = Math.sqrt(
          Math.pow(point.x - lastPoint.x, 2) + Math.pow(point.y - lastPoint.y, 2)
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      // Se a distância é muito grande, pode ser que estejamos começando uma nova seção
      if (nearestDistance < 500) {
        orderedPoints.push(remaining[nearestIndex]);
      }
      remaining.splice(nearestIndex, 1);
    }

    // Criar path SVG
    const trackPath = orderedPoints.length > 1 
      ? `M ${orderedPoints.map(p => `${p.x} ${p.y}`).join(' L ')} Z`
      : '';

    // Criar trails por piloto
    const driverTrails: { [driverNumber: string]: { x: number; y: number }[] } = {};
    const driverNumbers = [...new Set(allPositions.map(p => p.driver_number))];
    
    driverNumbers.forEach(driverNumber => {
      const driverPositions = allPositions
        .filter(p => p.driver_number === driverNumber)
        .map(p => ({ x: p.x_coord!, y: p.y_coord! }));
      driverTrails[driverNumber] = driverPositions;
    });

    return { trackPath, bounds, driverTrails };
  }, [allPositions]);

  // Agrupar posições por timestamp
  const timestampGroups = useMemo(() => {
    const groups: { [timestamp: string]: DriverPosition[] } = {};
    allPositions.forEach(pos => {
      if (!groups[pos.timestamp]) {
        groups[pos.timestamp] = [];
      }
      groups[pos.timestamp].push(pos);
    });
    
    return Object.entries(groups)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([timestamp, positions]) => ({ timestamp, positions }));
  }, [allPositions]);

  // Posições atuais baseadas no índice
  const currentPositions = useMemo(() => {
    if (timestampGroups.length === 0) return [];
    
    // Pegar todas as posições mais recentes até o índice atual
    const allCurrentPositions: { [driverNumber: string]: DriverPosition } = {};
    
    for (let i = 0; i <= Math.min(currentIndex, timestampGroups.length - 1); i++) {
      timestampGroups[i].positions.forEach(pos => {
        allCurrentPositions[pos.driver_number] = pos;
      });
    }
    
    return Object.values(allCurrentPositions);
  }, [timestampGroups, currentIndex]);

  // Controle de replay
  useEffect(() => {
    if (isPlaying && timestampGroups.length > 0) {
      const interval = setInterval(() => {
        setCurrentIndex(prevIndex => {
          if (prevIndex >= timestampGroups.length - 1) {
            setIsPlaying(false);
            return prevIndex;
          }
          return prevIndex + 1;
        });
      }, 1000 / replaySpeed);

      return () => clearInterval(interval);
    }
  }, [isPlaying, timestampGroups.length, replaySpeed]);

  // Funções de controle
  const handlePlay = () => setIsPlaying(!isPlaying);
  const handlePrevious = () => setCurrentIndex(Math.max(0, currentIndex - 1));
  const handleNext = () => setCurrentIndex(Math.min(timestampGroups.length - 1, currentIndex + 1));
  const handleReset = () => {
    setCurrentIndex(0);
    setIsPlaying(false);
  };

  // Zoom e pan
  const handleZoom = (delta: number) => {
    const newZoom = Math.max(0.1, Math.min(5, zoom + delta));
    setZoom(newZoom);
    
    const scale = 1 / newZoom;
    const centerX = (processedData.bounds.minX + processedData.bounds.maxX) / 2;
    const centerY = (processedData.bounds.minY + processedData.bounds.maxY) / 2;
    const width = (processedData.bounds.maxX - processedData.bounds.minX) * scale;
    const height = (processedData.bounds.maxY - processedData.bounds.minY) * scale;
    
    setViewBox({
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height
    });
  };

  const resetView = () => {
    setZoom(1);
    const padding = 500;
    setViewBox({
      x: processedData.bounds.minX - padding,
      y: processedData.bounds.minY - padding,
      width: (processedData.bounds.maxX - processedData.bounds.minX) + padding * 2,
      height: (processedData.bounds.maxY - processedData.bounds.minY) + padding * 2
    });
  };

  // Função para obter cor do piloto
  const getDriverColor = (driverNumber: string) => {
    const driver = driverInfo.find(d => d.driver_number === driverNumber);
    return driver?.team_color || '#ffffff';
  };

  const getDriverName = (driverNumber: string) => {
    const driver = driverInfo.find(d => d.driver_number === driverNumber);
    return driver?.full_name || `Piloto #${driverNumber}`;
  };

  // Timestamp atual
  const currentTimestamp = timestampGroups[currentIndex]?.timestamp || '';

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-4">
        {/* Cabeçalho */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 gap-4">
          <div>
            <h1 className="text-3xl font-bold">🏎️ Circuit Tracker Pro</h1>
            <p className="text-gray-400">{currentTimestamp && new Date(currentTimestamp).toLocaleString()}</p>
          </div>
          
          <div className="flex items-center gap-3">
            <select 
              value={selectedSession}
              onChange={(e) => setSelectedSession(Number(e.target.value))}
              className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-600"
            >
              {sessions.map(session => (
                <option key={session} value={session}>Sessão #{session}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Controles principais */}
        <div className="bg-gray-800 p-4 rounded-lg mb-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Controles de replay */}
            <div className="flex items-center gap-2">
              <button onClick={handleReset} className="p-2 bg-gray-700 hover:bg-gray-600 rounded" title="Reset">
                ⏹️
              </button>
              <button onClick={handlePrevious} className="p-2 bg-gray-700 hover:bg-gray-600 rounded" disabled={currentIndex === 0}>
                ⏮️
              </button>
              <button onClick={handlePlay} className="p-2 bg-blue-600 hover:bg-blue-500 rounded">
                {isPlaying ? '⏸️' : '▶️'}
              </button>
              <button onClick={handleNext} className="p-2 bg-gray-700 hover:bg-gray-600 rounded" disabled={currentIndex >= timestampGroups.length - 1}>
                ⏭️
              </button>
              
              <select 
                value={replaySpeed}
                onChange={(e) => setReplaySpeed(Number(e.target.value))}
                className="bg-gray-700 p-2 rounded ml-2"
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={5}>5x</option>
                <option value={10}>10x</option>
              </select>
            </div>
            
            {/* Controles de visualização */}
            <div className="flex items-center gap-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showTrails}
                  onChange={(e) => setShowTrails(e.target.checked)}
                  className="mr-2"
                />
                Mostrar Rastros
              </label>
              
              {showTrails && (
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={trailLength}
                  onChange={(e) => setTrailLength(Number(e.target.value))}
                  className="w-20"
                  title={`Comprimento do rastro: ${trailLength}`}
                />
              )}
              
              <div className="flex items-center gap-1 ml-4">
                <button onClick={() => handleZoom(-0.2)} className="p-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">🔍➖</button>
                <span className="text-sm px-2">{Math.round(zoom * 100)}%</span>
                <button onClick={() => handleZoom(0.2)} className="p-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">🔍➕</button>
                <button onClick={resetView} className="p-1 bg-gray-700 hover:bg-gray-600 rounded text-sm ml-1">🎯</button>
              </div>
            </div>
          </div>
          
          {/* Barra de progresso */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Início</span>
              <span>Frame {currentIndex + 1} de {timestampGroups.length}</span>
              <span>Fim</span>
            </div>
            <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-200"
                style={{ 
                  width: `${timestampGroups.length > 0 ? (currentIndex / (timestampGroups.length - 1)) * 100 : 0}%` 
                }}
              />
            </div>
          </div>
        </div>
        
        {/* Visualização do circuito */}
        <div className="bg-black rounded-lg overflow-hidden mb-6" style={{ height: '600px' }}>
          <svg 
            ref={svgRef}
            width="100%" 
            height="100%" 
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            className="cursor-move"
          >
            {/* Grid de referência */}
            <defs>
              <pattern id="grid" width="1000" height="1000" patternUnits="userSpaceOnUse">
                <rect width="1000" height="1000" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            
            {/* Traçado do circuito */}
            {processedData.trackPath && (
              <path 
                d={processedData.trackPath}
                fill="none" 
                stroke="rgba(255, 255, 255, 0.3)" 
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            
            {/* Rastros dos pilotos */}
            {showTrails && Object.entries(processedData.driverTrails).map(([driverNumber, trail]) => {
              const color = getDriverColor(driverNumber);
              const recentTrail = trail.slice(Math.max(0, trail.length - trailLength));
              
              if (recentTrail.length < 2) return null;
              
              const pathData = `M ${recentTrail.map(p => `${p.x} ${p.y}`).join(' L ')}`;
              
              return (
                <path
                  key={`trail-${driverNumber}`}
                  d={pathData}
                  fill="none"
                  stroke={color}
                  strokeWidth="4"
                  strokeOpacity="0.6"
                  strokeLinecap="round"
                />
              );
            })}
            
            {/* Pilotos atuais */}
            {currentPositions.map(position => {
              const color = getDriverColor(position.driver_number);
              
              return (
                <g key={position.driver_number}>
                  {/* Sombra */}
                  <circle
                    cx={position.x_coord! + 20}
                    cy={position.y_coord! + 20}
                    r="40"
                    fill="rgba(0,0,0,0.3)"
                  />
                  {/* Piloto */}
                  <circle
                    cx={position.x_coord!}
                    cy={position.y_coord!}
                    r="35"
                    fill={color}
                    stroke="white"
                    strokeWidth="6"
                  />
                  <text
                    x={position.x_coord!}
                    y={position.y_coord! + 8}
                    textAnchor="middle"
                    fill="white"
                    fontSize="24"
                    fontWeight="bold"
                  >
                    {position.driver_number}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        
        {/* Legenda dos pilotos */}
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">🏎️ Pilotos ({currentPositions.length} em pista)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {driverInfo.map(driver => {
              const isActive = currentPositions.some(p => p.driver_number === driver.driver_number);
              
              return (
                <div 
                  key={driver.driver_number} 
                  className={`flex items-center p-2 rounded ${isActive ? 'bg-gray-700 font-semibold' : 'bg-gray-900 opacity-60'}`}
                >
                  <div 
                    className="w-5 h-5 rounded-full mr-3 flex-shrink-0 border-2 border-white"
                    style={{ backgroundColor: driver.team_color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">#{driver.driver_number} {driver.full_name}</div>
                    <div className="text-sm text-gray-400 truncate">{driver.team_name}</div>
                  </div>
                  {isActive && <div className="text-green-400 ml-2">●</div>}
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