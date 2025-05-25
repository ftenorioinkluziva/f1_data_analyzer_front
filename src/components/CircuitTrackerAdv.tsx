import { useEffect, useState, useMemo, useCallback } from 'react';

// Tipos estendidos para análise avançada
type EnhancedDriverPosition = {
  id: number;
  session_id: number;
  driver_number: string;
  x_coord: number;
  y_coord: number;
  z_coord: number | null;
  timestamp: string;
  speed?: number; // Calculado
  acceleration?: number; // Calculado
  distance?: number; // Distância do ponto anterior
};

type HeatmapData = {
  x: number;
  y: number;
  intensity: number;
  count: number;
};

type AnalyticsMode = 'positions' | 'heatmap' | 'speed' | 'comparison';

const AdvancedCircuitAnalytics = () => {
  // Estados básicos
  const [rawPositions, setRawPositions] = useState<any[]>([]);
  const [driverInfo, setDriverInfo] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState(233);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>(['1', '44']);
  
  // Estados de análise
  const [analyticsMode, setAnalyticsMode] = useState<AnalyticsMode>('positions');
  const [timeWindow, setTimeWindow] = useState({ start: 0, end: 100 }); // Porcentagem
  const [showGrid, setShowGrid] = useState(true);
  const [showVelocityVectors, setShowVelocityVectors] = useState(false);
  
  // Dados processados com cálculos de velocidade e aceleração
  const enhancedPositions = useMemo<EnhancedDriverPosition[]>(() => {
    if (!rawPositions.length) return [];
    
    const enhanced: EnhancedDriverPosition[] = [];
    const driverGroups = rawPositions.reduce((groups, pos) => {
      if (!groups[pos.driver_number]) groups[pos.driver_number] = [];
      groups[pos.driver_number].push(pos);
      return groups;
    }, {} as Record<string, any[]>);
    
    Object.entries(driverGroups).forEach(([driverNumber, positions]) => {
      const sortedPositions = positions.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      sortedPositions.forEach((pos, index) => {
        const enhanced_pos: EnhancedDriverPosition = {
          ...pos,
          speed: 0,
          acceleration: 0,
          distance: 0
        };
        
        if (index > 0) {
          const prevPos = sortedPositions[index - 1];
          const timeDiff = (new Date(pos.timestamp).getTime() - new Date(prevPos.timestamp).getTime()) / 1000; // segundos
          
          if (timeDiff > 0) {
            const distance = Math.sqrt(
              Math.pow(pos.x_coord - prevPos.x_coord, 2) + 
              Math.pow(pos.y_coord - prevPos.y_coord, 2)
            );
            
            enhanced_pos.distance = distance;
            enhanced_pos.speed = distance / timeDiff; // unidades/segundo
            
            if (index > 1) {
              const prevSpeed = enhanced[enhanced.length - 1]?.speed || 0;
              enhanced_pos.acceleration = (enhanced_pos.speed - prevSpeed) / timeDiff;
            }
          }
        }
        
        enhanced.push(enhanced_pos);
      });
    });
    
    return enhanced;
  }, [rawPositions]);
  
  // Dados de heatmap
  const heatmapData = useMemo<HeatmapData[]>(() => {
    if (!enhancedPositions.length || analyticsMode !== 'heatmap') return [];
    
    const grid = new Map<string, HeatmapData>();
    const gridSize = 200; // Tamanho da célula do grid
    
    enhancedPositions
      .filter(pos => selectedDrivers.includes(pos.driver_number))
      .forEach(pos => {
        const gridX = Math.floor(pos.x_coord / gridSize) * gridSize;
        const gridY = Math.floor(pos.y_coord / gridSize) * gridSize;
        const key = `${gridX},${gridY}`;
        
        if (!grid.has(key)) {
          grid.set(key, { x: gridX, y: gridY, intensity: 0, count: 0 });
        }
        
        const cell = grid.get(key)!;
        cell.count += 1;
        cell.intensity += pos.speed || 0;
      });
    
    // Normalizar intensidade
    const maxIntensity = Math.max(...Array.from(grid.values()).map(cell => cell.intensity / cell.count));
    
    return Array.from(grid.values()).map(cell => ({
      ...cell,
      intensity: (cell.intensity / cell.count) / maxIntensity
    }));
  }, [enhancedPositions, selectedDrivers, analyticsMode]);
  
  // Filtrar dados por janela de tempo
  const filteredPositions = useMemo(() => {
    if (!enhancedPositions.length) return [];
    
    const timestamps = [...new Set(enhancedPositions.map(p => p.timestamp))].sort();
    const startIndex = Math.floor((timeWindow.start / 100) * timestamps.length);
    const endIndex = Math.floor((timeWindow.end / 100) * timestamps.length);
    const timeRange = timestamps.slice(startIndex, endIndex);
    
    return enhancedPositions.filter(pos => 
      timeRange.includes(pos.timestamp) && 
      selectedDrivers.includes(pos.driver_number)
    );
  }, [enhancedPositions, timeWindow, selectedDrivers]);
  
  // Estatísticas por piloto
  const driverStats = useMemo(() => {
    const stats: Record<string, {
      maxSpeed: number;
      avgSpeed: number;
      totalDistance: number;
      positionCount: number;
    }> = {};
    
    selectedDrivers.forEach(driverNumber => {
      const driverPositions = filteredPositions.filter(p => p.driver_number === driverNumber);
      
      if (driverPositions.length > 0) {
        const speeds = driverPositions.map(p => p.speed || 0).filter(s => s > 0);
        const distances = driverPositions.map(p => p.distance || 0);
        
        stats[driverNumber] = {
          maxSpeed: Math.max(...speeds),
          avgSpeed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
          totalDistance: distances.reduce((a, b) => a + b, 0),
          positionCount: driverPositions.length
        };
      }
    });
    
    return stats;
  }, [filteredPositions, selectedDrivers]);
  
  // Bounds do circuito
  const bounds = useMemo(() => {
    if (!enhancedPositions.length) return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
    
    const x_coords = enhancedPositions.map(p => p.x_coord);
    const y_coords = enhancedPositions.map(p => p.y_coord);
    
    return {
      minX: Math.min(...x_coords),
      maxX: Math.max(...x_coords),
      minY: Math.min(...y_coords),
      maxY: Math.max(...y_coords)
    };
  }, [enhancedPositions]);
  
  const viewBox = `${bounds.minX - 500} ${bounds.minY - 500} ${bounds.maxX - bounds.minX + 1000} ${bounds.maxY - bounds.minY + 1000}`;
  
  // Simulação de dados (remover quando conectar com API real)
  useEffect(() => {
    // Simular dados para demonstração
    const mockData = [];
    const drivers = ['1', '44', '16', '55'];
    const now = Date.now();
    
    for (let i = 0; i < 500; i++) {
      drivers.forEach((driver, driverIndex) => {
        const angle = (i * 0.02 + driverIndex * 1.5) % (Math.PI * 2);
        const radius = 3000 + Math.sin(angle * 3) * 1000;
        const x = 3000 + Math.cos(angle) * radius;
        const y = -1000 + Math.sin(angle) * radius;
        
        mockData.push({
          id: i * drivers.length + driverIndex,
          session_id: 233,
          driver_number: driver,
          x_coord: x + (Math.random() - 0.5) * 100,
          y_coord: y + (Math.random() - 0.5) * 100,
          z_coord: 0,
          timestamp: new Date(now + i * 1000).toISOString()
        });
      });
    }
    
    setRawPositions(mockData);
    
    setDriverInfo([
      { driver_number: '1', full_name: 'Max Verstappen', team_name: 'Red Bull', team_color: '#0600EF' },
      { driver_number: '44', full_name: 'Lewis Hamilton', team_name: 'Mercedes', team_color: '#00D2BE' },
      { driver_number: '16', full_name: 'Charles Leclerc', team_name: 'Ferrari', team_color: '#DC143C' },
      { driver_number: '55', full_name: 'Carlos Sainz Jr', team_name: 'Ferrari', team_color: '#DC143C' }
    ]);
  }, []);
  
  const getDriverColor = (driverNumber: string) => {
    const driver = driverInfo.find(d => d.driver_number === driverNumber);
    return driver?.team_color || '#ffffff';
  };
  
  const getDriverName = (driverNumber: string) => {
    const driver = driverInfo.find(d => d.driver_number === driverNumber);
    return driver?.full_name || `Piloto #${driverNumber}`;
  };
  
  // Componente de cor para velocidade
  const getSpeedColor = (speed: number, maxSpeed: number) => {
    const intensity = Math.min(speed / maxSpeed, 1);
    const hue = (1 - intensity) * 120; // De verde (120) para vermelho (0)
    return `hsl(${hue}, 100%, 50%)`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-4">
        {/* Cabeçalho */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">📊 Circuit Analytics Pro</h1>
          <p className="text-gray-400">Análise avançada de trajetórias e performance dos pilotos</p>
        </div>
        
        {/* Painel de controles */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {/* Modo de análise */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Modo de Análise</h3>
            <select 
              value={analyticsMode}
              onChange={(e) => setAnalyticsMode(e.target.value as AnalyticsMode)}
              className="w-full bg-gray-700 p-2 rounded"
            >
              <option value="positions">Posições</option>
              <option value="heatmap">Mapa de Calor</option>
              <option value="speed">Velocidade</option>
              <option value="comparison">Comparação</option>
            </select>
          </div>
          
          {/* Seleção de pilotos */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Pilotos Selecionados</h3>
            <div className="space-y-1">
              {driverInfo.map(driver => (
                <label key={driver.driver_number} className="flex items-center text-sm">
                  <input
                    type="checkbox"
                    checked={selectedDrivers.includes(driver.driver_number)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDrivers([...selectedDrivers, driver.driver_number]);
                      } else {
                        setSelectedDrivers(selectedDrivers.filter(d => d !== driver.driver_number));
                      }
                    }}
                    className="mr-2"
                  />
                  <div 
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: driver.team_color }}
                  />
                  #{driver.driver_number}
                </label>
              ))}
            </div>
          </div>
          
          {/* Janela de tempo */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Janela de Tempo</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-400">Início: {timeWindow.start}%</label>
                <input
                  type="range"
                  min="0"
                  max="95"
                  value={timeWindow.start}
                  onChange={(e) => setTimeWindow({...timeWindow, start: Number(e.target.value)})}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Fim: {timeWindow.end}%</label>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={timeWindow.end}
                  onChange={(e) => setTimeWindow({...timeWindow, end: Number(e.target.value)})}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          
          {/* Opções de visualização */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Visualização</h3>
            <div className="space-y-2">
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                  className="mr-2"
                />
                Mostrar Grade
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={showVelocityVectors}
                  onChange={(e) => setShowVelocityVectors(e.target.checked)}
                  className="mr-2"
                />
                Vetores de Velocidade
              </label>
            </div>
          </div>
        </div>
        
        {/* Estatísticas */}
        {Object.keys(driverStats).length > 0 && (
          <div className="bg-gray-800 p-4 rounded-lg mb-6">
            <h3 className="font-semibold mb-3">📈 Estatísticas do Período</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(driverStats).map(([driverNumber, stats]) => (
                <div key={driverNumber} className="bg-gray-700 p-3 rounded">
                  <div className="flex items-center mb-2">
                    <div 
                      className="w-4 h-4 rounded-full mr-2"
                      style={{ backgroundColor: getDriverColor(driverNumber) }}
                    />
                    <span className="font-medium">#{driverNumber}</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <div>Vel. Máx: <span className="text-green-400">{stats.maxSpeed.toFixed(1)}</span></div>
                    <div>Vel. Média: <span className="text-blue-400">{stats.avgSpeed.toFixed(1)}</span></div>
                    <div>Distância: <span className="text-yellow-400">{(stats.totalDistance/1000).toFixed(1)}km</span></div>
                    <div>Pontos: <span className="text-gray-400">{stats.positionCount}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Visualização principal */}
        <div className="bg-black rounded-lg overflow-hidden" style={{ height: '700px' }}>
          <svg width="100%" height="100%" viewBox={viewBox}>
            {/* Grade de referência */}
            {showGrid && (
              <defs>
                <pattern id="grid" width="500" height="500" patternUnits="userSpaceOnUse">
                  <rect width="500" height="500" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
                </pattern>
              </defs>
            )}
            {showGrid && <rect width="100%" height="100%" fill="url(#grid)" />}
            
            {/* Mapa de calor */}
            {analyticsMode === 'heatmap' && heatmapData.map((cell, index) => (
              <rect
                key={index}
                x={cell.x}
                y={cell.y}
                width="200"
                height="200"
                fill={`hsla(${(1-cell.intensity) * 240}, 100%, 50%, ${cell.intensity * 0.7})`}
                stroke="none"
              />
            ))}
            
            {/* Trajetórias dos pilotos */}
            {(analyticsMode === 'positions' || analyticsMode === 'speed') && selectedDrivers.map(driverNumber => {
              const driverPositions = filteredPositions.filter(p => p.driver_number === driverNumber);
              if (driverPositions.length < 2) return null;
              
              const color = getDriverColor(driverNumber);
              const maxSpeed = Math.max(...driverPositions.map(p => p.speed || 0));
              
              return (
                <g key={driverNumber}>
                  {/* Trajetória */}
                  <path
                    d={`M ${driverPositions.map(p => `${p.x_coord} ${p.y_coord}`).join(' L ')}`}
                    fill="none"
                    stroke={analyticsMode === 'speed' ? 'url(#speedGradient)' : color}
                    strokeWidth="3"
                    strokeOpacity="0.8"
                  />
                  
                  {/* Pontos de velocidade */}
                  {analyticsMode === 'speed' && driverPositions.map((pos, index) => (
                    <circle
                      key={index}
                      cx={pos.x_coord}
                      cy={pos.y_coord}
                      r="6"
                      fill={getSpeedColor(pos.speed || 0, maxSpeed)}
                      stroke="white"
                      strokeWidth="1"
                    />
                  ))}
                  
                  {/* Vetores de velocidade */}
                  {showVelocityVectors && driverPositions.slice(0, -1).map((pos, index) => {
                    const nextPos = driverPositions[index + 1];
                    const dx = nextPos.x_coord - pos.x_coord;
                    const dy = nextPos.y_coord - pos.y_coord;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const scale = (pos.speed || 0) * 0.1;
                    
                    if (length > 0 && scale > 0) {
                      const endX = pos.x_coord + (dx / length) * scale;
                      const endY = pos.y_coord + (dy / length) * scale;
                      
                      return (
                        <line
                          key={index}
                          x1={pos.x_coord}
                          y1={pos.y_coord}
                          x2={endX}
                          y2={endY}
                          stroke={color}
                          strokeWidth="2"
                          strokeOpacity="0.6"
                          markerEnd="url(#arrowhead)"
                        />
                      );
                    }
                    return null;
                  })}
                  
                  {/* Posição atual (última posição) */}
                  {driverPositions.length > 0 && (
                    <g>
                      <circle
                        cx={driverPositions[driverPositions.length - 1].x_coord}
                        cy={driverPositions[driverPositions.length - 1].y_coord}
                        r="25"
                        fill={color}
                        stroke="white"
                        strokeWidth="3"
                      />
                      <text
                        x={driverPositions[driverPositions.length - 1].x_coord}
                        y={driverPositions[driverPositions.length - 1].y_coord + 6}
                        textAnchor="middle"
                        fill="white"
                        fontSize="16"
                        fontWeight="bold"
                      >
                        {driverNumber}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            
            {/* Definições para setas */}
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
              </marker>
            </defs>
          </svg>
        </div>
        
        {/* Legenda de velocidade */}
        {analyticsMode === 'speed' && (
          <div className="mt-4 bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Legenda de Velocidade</h3>
            <div className="flex items-center space-x-2">
              <span className="text-sm">Lenta</span>
              <div className="w-32 h-4 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded"/>
              <span className="text-sm">Rápida</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedCircuitAnalytics;