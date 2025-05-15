import { useState } from 'react';
import { WeatherDashboard } from './components/WeatherDashboard';
import { CircuitMap } from './components/CircuitMap';

function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'circuit'>('dashboard');

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Barra de navegação */}
      <nav className="bg-gray-800 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-white text-xl font-bold">F1 Weather Analyzer</h1>
          
          <div className="flex space-x-4">
            <button 
              onClick={() => setActiveView('dashboard')}
              className={`px-4 py-2 rounded ${activeView === 'dashboard' ? 'bg-blue-600' : 'bg-gray-700'} text-white`}
            >
              Dashboard Detalhado
            </button>
            <button 
              onClick={() => setActiveView('circuit')}
              className={`px-4 py-2 rounded ${activeView === 'circuit' ? 'bg-blue-600' : 'bg-gray-700'} text-white`}
            >
              Mapa do Circuito
            </button>
          </div>
        </div>
      </nav>

      {/* Conteúdo principal */}
      {activeView === 'dashboard' ? <WeatherDashboard /> : <CircuitMap />}
    </div>
  );
}

export default App;