import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Area
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

  useEffect(() => {
    // inicial fetch
    supabase
      .from('weather_data')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100)
      .then(({ data }) => data && setRows(data));

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
                return [newRow as WeatherData, ...current];
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

  // latest record for summary
  const latest = rows[0];

  // prepare chart data (last 20 points, oldest first)
  const chartData = useMemo(() => {
    return rows
      .slice(0, 20)
      .reverse()
      .map(r => ({
        time: new Date(r.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        temp: r.air_temp,
        track: r.track_temp,
        rain: r.rainfall,
        hum: r.humidity
      }));
  }, [rows]);

  if (!latest) {
    return <div>Carregando dados...</div>;
  }

  return (
    <div className="space-y-6 p-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 shadow rounded text-center">
          <h3 className="text-sm text-gray-500">Temperatura</h3>
          <p className="text-2xl font-semibold">{latest.air_temp.toFixed(1)}°C</p>
        </div>
        <div className="bg-white p-4 shadow rounded text-center">
          <h3 className="text-sm text-gray-500">Umidade</h3>
          <p className="text-2xl font-semibold">{latest.humidity}%</p>
        </div>
        <div className="bg-white p-4 shadow rounded text-center">
          <h3 className="text-sm text-gray-500">Chuva</h3>
          <p className="text-2xl font-semibold">{latest.rainfall} mm</p>
        </div>
        <div className="bg-white p-4 shadow rounded text-center">
          <h3 className="text-sm text-gray-500">Vento</h3>
          <div className="flex flex-col items-center">
            <p className="text-2xl font-semibold">{latest.wind_speed.toFixed(1)} km/h</p>
            <div
              className="mt-1 transform"
              style={{ transform: `rotate(${latest.wind_direction}deg)` }}
            >
              ▲
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 shadow rounded">
          <h4 className="text-lg mb-2">Temperatura & Pista</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="temp" stroke="#FF5733" dot={false} />
              <Line type="monotone" dataKey="track" stroke="#33A1FF" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-4 shadow rounded">
          <h4 className="text-lg mb-2">Chuva & Umidade</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis yAxisId="left" orientation="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Bar yAxisId="left" dataKey="rain" fill="#8884d8" />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="hum"
                fill="#82ca9d"
                stroke="#82ca9d"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
