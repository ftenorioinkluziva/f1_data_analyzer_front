import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart
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
  const [rows, setRows] = useState<WeatherData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);


  useEffect(() => {
    // inicial fetch
    supabase
      .from('weather_data')
      .select('*')
      .order('timestamp', { ascending: true }) // Ordenar por timestamp em ordem crescente
      .limit(100)
      .then(({ data }) => {
        if (data) {
          setRows(data);
        }
      });

    // realtime subscription
    const channel = supabase
      .channel('public:weather_data')
      .on(
        'postgres_changes',
        { schema: 'public', table: 'weather_data', event: '*' },
        ({ eventType, new: newRow, old: oldRow }) => {
          setRows(current => {
            switch (eventType) {
              case 'INSERT':
                return [...current, newRow as WeatherData].sort((a, b) => 
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
              case 'UPDATE':
                return current.map(r => (r.id === (newRow as WeatherData).id ? (newRow as WeatherData) : r));
              case 'DELETE':
                return current.filter(r => r.id !== (oldRow as WeatherData).id);
              default:
                return current;
            }
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Setup replay functionality
  useEffect(() => {
    if (isPlaying && rows.length > 0) {
      const interval = setInterval(() => {
        setCurrentIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= rows.length) {
            setIsPlaying(false);
            return prevIndex;
          }
          return nextIndex;
        });
      }, 1000 / replaySpeed);

      return () => clearInterval(interval);
    }
  }, [isPlaying, rows.length, replaySpeed]);

  // Get current data point
  const currentData = rows.length > 0 ? rows[currentIndex] : null;

  // prepare forecast data (next 8 hours or available data points)
  const forecastData = useMemo(() => {
    if (!rows.length) return [];
    
    const startIdx = currentIndex;
    const endIdx = Math.min(startIdx + 8, rows.length);
    
    return rows.slice(startIdx, endIdx).map((row, idx) => {
      const date = new Date(row.timestamp);
      return {
        time: idx === 0 ? 'Agora' : date.getHours().toString().padStart(2, '0') + ':00',
        humidity: row.humidity,
        rainfall: row.rainfall,
        windSpeed: row.wind_speed,
        windDirection: row.wind_direction,
        hour: date.getHours()
      };
    });
  }, [rows, currentIndex]);

  // Format date for display
  const formattedDate = currentData ? new Date(currentData.timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }) : '';

  // Format time for display
  const formattedTime = currentData ? new Date(currentData.timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  }) : '';

  // Get wind description based on speed
  const getWindDescription = (speed: number) => {
    if (speed < 5) return 'Leve';
    if (speed < 15) return 'Leve';
    if (speed < 25) return 'Moderado';
    if (speed < 35) return 'Forte';
    return 'Muito forte';
  };

  // Get wind direction description
  const getWindDirectionText = (direction: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    const index = Math.round(direction / 45) % 8;
    return directions[index];
  };

  if (!currentData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-xl">Carregando dados meteorológicos...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* Data/Horário e Controles de Replay */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">{formattedDate}</h1>
            <p className="text-gray-400">Sessão #{currentData.session_id} - {formattedTime}</p>
          </div>
          
          <div className="flex items-center space-x-4">
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
        

        {/* Condições Atuais */}
        <h2 className="text-xl mb-4">Condições climáticas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="mb-2">Vento</h3>
            <div className="text-3xl font-bold">{currentData.wind_speed.toFixed(0)} km/h</div>
            <div className="flex items-center text-gray-400">
              <span>{getWindDescription(currentData.wind_speed)}</span>
              <span className="mx-2">•</span>
              <span>Do {getWindDirectionText(currentData.wind_direction)}</span>
              <div 
                className="ml-3 text-blue-300"
                style={{ transform: `rotate(${currentData.wind_direction}deg)` }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z"></path>
                </svg>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="mb-2">Umidade</h3>
            <div className="text-3xl font-bold">{currentData.humidity}%</div>
            <div className="text-gray-400 flex items-center">
              <span>Ponto de condensação {(currentData.air_temp - ((100 - currentData.humidity) / 5)).toFixed(0)}°</span>
              <div className="ml-auto">
                <div className="h-8 w-4 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="bg-orange-500 w-full"
                    style={{ 
                      height: `${currentData.humidity}%`,
                      marginTop: `${100 - currentData.humidity}%`
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="mb-2">Pressão</h3>
            <div className="text-3xl font-bold">{currentData.pressure.toFixed(0)}</div>
            <div className="flex items-center justify-between text-gray-400">
              <span>mBar</span>
              <div className="w-12 h-12">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#374151" strokeWidth="10" />
                  <path 
                    d={`M50 50 L50 5 A45 45 0 ${currentData.pressure < 1013 ? '0' : '1'} 1 ${50 + 45 * Math.sin((currentData.pressure - 980) / 70 * Math.PI)} ${50 - 45 * Math.cos((currentData.pressure - 980) / 70 * Math.PI)} Z`} 
                    fill="#3b82f6"
                  />
                  <circle cx="50" cy="50" r="5" fill="white" />
                </svg>
              </div>
              <div className="text-xs flex justify-between w-full">
                <span>Baixa</span>
                <span>Alta</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Gráficos e Tendências */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="mb-4">Tendência de temperatura</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart 
                data={rows.slice(Math.max(0, currentIndex - 20), currentIndex + 1).map(r => ({
                  time: new Date(r.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                  ar: r.air_temp,
                  pista: r.track_temp
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }} />
                <Line type="monotone" dataKey="ar" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="pista" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex justify-center mt-2 text-sm">
              <div className="flex items-center mr-4">
                <div className="w-3 h-3 rounded-full bg-amber-500 mr-1"></div>
                <span>Ar: {currentData.air_temp.toFixed(1)}°C</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-1"></div>
                <span>Pista: {currentData.track_temp.toFixed(1)}°C</span>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="mb-4">Previsão de chuva</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={forecastData}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }} />
                <Area type="monotone" dataKey="rainfall" stroke="#8884d8" fill="#8884d8" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabela de dados */}
        <h2 className="text-xl mb-4">Registro de dados</h2>
        <div className="bg-gray-800 rounded-lg overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-700">
                <th className="px-4 py-2 text-left">Timestamp</th>
                <th className="px-4 py-2 text-left">Ar (°C)</th>
                <th className="px-4 py-2 text-left">Pista (°C)</th>
                <th className="px-4 py-2 text-left">Umidade (%)</th>
                <th className="px-4 py-2 text-left">Pressão (mBar)</th>
                <th className="px-4 py-2 text-left">Chuva (mm)</th>
                <th className="px-4 py-2 text-left">Vento (km/h)</th>
                <th className="px-4 py-2 text-left">Direção</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(Math.max(0, currentIndex - 10), currentIndex + 1).reverse().map((row) => (
                <tr key={row.id} className={row.id === currentData.id ? "bg-blue-900" : "hover:bg-gray-700"}>
                  <td className="px-4 py-2">{new Date(row.timestamp).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2">{row.air_temp.toFixed(1)}</td>
                  <td className="px-4 py-2">{row.track_temp.toFixed(1)}</td>
                  <td className="px-4 py-2">{row.humidity}</td>
                  <td className="px-4 py-2">{row.pressure.toFixed(1)}</td>
                  <td className="px-4 py-2">{row.rainfall.toFixed(2)}</td>
                  <td className="px-4 py-2">{row.wind_speed.toFixed(1)}</td>
                  <td className="px-4 py-2">{row.wind_direction}° ({getWindDirectionText(row.wind_direction)})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};