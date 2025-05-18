import { useState } from 'react';
import { WeatherDashboard } from './components/WeatherDashboard';
import CircuitTracker from './components/CircuitTracker';
import TeamRadioDashboard from './components/TeamRadioDashboard';
import RaceControlDashboard from './components/RaceControlDashboard';

function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'circuit' | 'radio' | 'control'>('dashboard');

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Barra de navegação */}
      <nav className="bg-gray-800 p-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center">
          <h1 className="text-white text-xl font-bold mb-4 md:mb-0">F1 Weather Analyzer</h1>
          
          <div className="flex flex-wrap gap-2 justify-center">
            <button 
              onClick={() => setActiveView('dashboard')}
              className={`px-4 py-2 rounded ${activeView === 'dashboard' ? 'bg-blue-600' : 'bg-gray-700'} text-white`}
            >
              Dashboard Clima
            </button>
            <button 
              onClick={() => setActiveView('radio')}
              className={`px-4 py-2 rounded ${activeView === 'radio' ? 'bg-blue-600' : 'bg-gray-700'} text-white`}
            >
              Rádio Equipe
            </button>
            <button 
              onClick={() => setActiveView('circuit')}
              className={`px-4 py-2 rounded ${activeView === 'circuit' ? 'bg-blue-600' : 'bg-gray-700'} text-white`}
            >
              Rastreador de Pilotos
            </button>
            <button 
              onClick={() => setActiveView('control')}
              className={`px-4 py-2 rounded ${activeView === 'control' ? 'bg-blue-600' : 'bg-gray-700'} text-white`}
            >
              Controle de Corrida
            </button>
          </div>
        </div>
      </nav>

      {/* Conteúdo principal */}
      {activeView === 'dashboard' && <WeatherDashboard />}
      {activeView === 'circuit' && <CircuitTracker />}
      {activeView === 'radio' && <TeamRadioDashboard />}
      {activeView === 'control' && <RaceControlDashboard />}
    </div>
  );
}

export default App;