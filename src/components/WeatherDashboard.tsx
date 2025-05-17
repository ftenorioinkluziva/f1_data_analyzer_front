import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer
} from 'recharts';

export type WeatherData = {
  id: number;
  timestamp: string;
  air_temp: number;
  humidity: number;
  pressure: number;
  rainfall: number;
  track_temp: number;
  wind_speed: number;
  wind_direction: number;
  session_id: number;
};

export const WeatherDashboard: React.FC = () => {
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [sessions, setSessions] = useState<number[]>([]);
  const [periodFilter, setPeriodFilter] = useState<'atual' | 'historico'>('atual');
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [temperatureHistory, setTemperatureHistory] = useState<{ time: string; ar: number; pista: number; timestamp: number }[]>([]);
  
  // Replay functionality
  const [rows, setRows] = useState<WeatherData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);

  // Buscar lista de sessões disponíveis
  useEffect(() => {
    const fetchSessions = async () => {
      const { data, error } = await supabase
        .from('weather_data')
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
  }, [selectedSession, periodFilter]);

  // Buscar dados meteorológicos da sessão selecionada
  useEffect(() => {
    if (!selectedSession) return;

    // Reset current index when changing sessions
    setCurrentIndex(0);
    setIsPlaying(false);

    const fetchWeatherData = async () => {
      const { data, error } = await supabase
        .from('weather_data')
        .select('*')
        .eq('session_id', selectedSession)
        .order('timestamp', { ascending: true });
      
      if (data && !error) {
        setRows(data);
        
        // For the current view when in 'atual' mode
        if (periodFilter === 'atual' && data.length > 0) {
          setWeatherData(data[data.length - 1]);
        } else if (data.length > 0) {
          setWeatherData(data[0]); // Initially show the first data point in historical mode
        }
        
        // Prepare historical data for temperature chart
        const historyData = data.map(item => ({
          time: new Date(item.timestamp).toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          ar: item.air_temp,
          pista: item.track_temp,
          timestamp: new Date(item.timestamp).getTime()
        }));
        
        setTemperatureHistory(historyData);
      }
    };

    fetchWeatherData();

    // Realtime subscription
    const channel = supabase
      .channel('public:weather_data')
      .on(
        'postgres_changes',
        { 
          schema: 'public', 
          table: 'weather_data', 
          event: '*',
          filter: `session_id=eq.${selectedSession}`
        },
        ({ eventType, new: newRow, old: oldRow }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const typedNewRow = newRow as WeatherData;
            
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
            
            // Update current data if in atual mode and it's the latest data
            if (periodFilter === 'atual') {
              setWeatherData(typedNewRow);
            }
            
            // Update temperature history
            setTemperatureHistory(current => {
              const newPoint = {
                time: new Date(typedNewRow.timestamp).toLocaleTimeString('pt-BR', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                }),
                ar: typedNewRow.air_temp,
                pista: typedNewRow.track_temp,
                timestamp: new Date(typedNewRow.timestamp).getTime()
              };
              
              const updatedHistory = [...current];
              const existingIndex = updatedHistory.findIndex(
                item => item.timestamp === newPoint.timestamp
              );
              
              if (existingIndex >= 0) {
                updatedHistory[existingIndex] = newPoint;
              } else {
                updatedHistory.push(newPoint);
                // Sort by timestamp
                updatedHistory.sort((a, b) => a.timestamp - b.timestamp);
              }
              
              return updatedHistory;
            });
          } else if (eventType === 'DELETE') {
            const typedOldRow = oldRow as WeatherData;
            
            // Remove from rows array
            setRows(current => current.filter(r => r.id !== typedOldRow.id));
            
            // Remove from temperature history
            setTemperatureHistory(current => 
              current.filter(item => 
                item.timestamp !== new Date(typedOldRow.timestamp).getTime()
              )
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
          
          // Update the weatherData with the current point during replay
          setWeatherData(rows[nextIndex]);
          return nextIndex;
        });
      }, 1000 / replaySpeed);

      return () => clearInterval(interval);
    }
  }, [isPlaying, rows, replaySpeed]);

  // Effect for handling period filter changes
  useEffect(() => {
    if (rows.length === 0) return;
    
    if (periodFilter === 'atual') {
      // In atual mode, show the latest data point
      setWeatherData(rows[rows.length - 1]);
      setCurrentIndex(rows.length - 1);
    } else {
      // In historico mode, start from the beginning for replay
      setWeatherData(rows[currentIndex]);
    }
  }, [periodFilter, rows, currentIndex]);

  // Formatar data/hora para exibição
  const getFormattedDateTime = () => {
    if (!weatherData) return '';
    
    const date = new Date(weatherData.timestamp);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Obter descrição do vento
  const getWindDescription = (speed: number | undefined) => {
    if (!speed) return 'N/A';
    if (speed < 5) return 'Leve';
    if (speed < 15) return 'Leve';
    if (speed < 25) return 'Moderado';
    if (speed < 35) return 'Forte';
    return 'Muito forte';
  };

  // Obter direção do vento como texto
  const getWindDirectionText = (direction: number | undefined) => {
    if (direction === undefined) return '';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    const index = Math.round((direction % 360) / 45) % 8;
    return directions[index];
  };

  // Determinar se há previsão de chuva (binário)
  const hasRainForecast = () => {
    if (!weatherData) return false;
    return weatherData.rainfall > 0.1; // Considerando chuva se > 0.1mm
  };

  if (!weatherData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-xl">Carregando dados meteorológicos...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-4">
        {/* Cabeçalho e Filtros */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Circuito F1</h1>
            <p className="text-gray-400">{getFormattedDateTime()}</p>
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
                    onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
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
                    onClick={() => setCurrentIndex(Math.min(rows.length - 1, currentIndex + 1))}
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
        

        {/* Painéis de informações (agora abaixo do mapa, em tamanho menor) */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Tendência de temperatura */}
          <div className="md:col-span-3 lg:col-span-3 bg-gray-800 rounded-lg p-3">
            <h3 className="text-sm font-medium mb-1">Tendência de temperatura</h3>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={periodFilter === 'historico' ? 
                    temperatureHistory.slice(0, currentIndex + 1) : 
                    temperatureHistory.slice(-10)}
                  margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#9ca3af" 
                    tick={{ fontSize: 9 }} 
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 9 }} />
                  <Line type="monotone" dataKey="ar" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="pista" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center mt-1 text-xs">
              <div className="flex items-center mr-4">
                <div className="w-2 h-2 rounded-full bg-blue-500 mr-1"></div>
                <span>Ar: {weatherData?.air_temp.toFixed(1)}°C</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-amber-500 mr-1"></div>
                <span>Pista: {weatherData?.track_temp.toFixed(1)}°C</span>
              </div>
            </div>
          </div>
          
          {/* Vento  e chuva*/}
          <div className="bg-gray-800 rounded-lg p-3">
            <h3 className="text-sm font-medium mb-1">Vento</h3>
            <div className="text-2xl font-bold">{weatherData?.wind_speed.toFixed(0)} km/h</div>
            <div className="flex items-center text-xs text-gray-400">
              <span>{getWindDescription(weatherData?.wind_speed)}</span>
              <span className="mx-1">•</span>
              <span>Do {getWindDirectionText(weatherData?.wind_direction)}</span>
              <div 
                className="ml-1 text-blue-300"
                style={{ transform: `rotate(${weatherData?.wind_direction || 0}deg)` }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z"></path>
                </svg>
              </div>
            </div>
           
            <h3 className="text-sm font-medium mt-3 mb-1">Previsão de Chuva</h3>
            <div className="text-2xl font-bold">
              {hasRainForecast() ? 'SIM' : 'NÃO'}
            </div>
            {hasRainForecast() && (
              <div className="text-sm text-gray-400">
                {weatherData.rainfall.toFixed(2)} mm
              </div>
            )}
          </div>          
          
          {/* Umidade e pressão*/}
          <div className="bg-gray-800 rounded-lg p-3">
            <h3 className="text-sm font-medium mb-1">Umidade</h3>
            <div className="text-2xl font-bold">{weatherData?.humidity || 0}%</div>
            <div className="text-xs text-gray-400 mt-1">
              Ponto de condensação: {(weatherData.air_temp - ((100 - weatherData.humidity) / 5)).toFixed(0)}°C
            </div>
            
            <h3 className="text-sm font-medium mt-3 mb-1">Pressão</h3>
            <div className="text-2xl font-bold">{weatherData?.pressure.toFixed(0) || 0}</div>
            <div className="text-xs text-gray-400 mt-1">
              mBar
            </div>
          </div>
          
        </div>
        
        {/* Adicionar tabela de dados no modo histórico */}
        {periodFilter === 'historico' && (
          <div className="mt-6">
            <h3 className="text-xl mb-3">Dados históricos</h3>
            <div className="bg-gray-800 rounded-lg overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-700">
                    <th className="px-3 py-2 text-left text-sm">Timestamp</th>
                    <th className="px-3 py-2 text-left text-sm">Ar (°C)</th>
                    <th className="px-3 py-2 text-left text-sm">Pista (°C)</th>
                    <th className="px-3 py-2 text-left text-sm">Umidade (%)</th>
                    <th className="px-3 py-2 text-left text-sm">Pressão (mBar)</th>
                    <th className="px-3 py-2 text-left text-sm">Chuva (mm)</th>
                    <th className="px-3 py-2 text-left text-sm">Vento (km/h)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(Math.max(0, currentIndex - 5), currentIndex + 1).reverse().map((row) => (
                    <tr key={row.id} className={row.id === weatherData?.id ? "bg-blue-900" : "hover:bg-gray-700"}>
                      <td className="px-3 py-2 text-sm">{new Date(row.timestamp).toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2 text-sm">{row.air_temp.toFixed(1)}</td>
                      <td className="px-3 py-2 text-sm">{row.track_temp.toFixed(1)}</td>
                      <td className="px-3 py-2 text-sm">{row.humidity}</td>
                      <td className="px-3 py-2 text-sm">{row.pressure.toFixed(1)}</td>
                      <td className="px-3 py-2 text-sm">{row.rainfall.toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm">{row.wind_speed.toFixed(1)} ({getWindDirectionText(row.wind_direction)})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};