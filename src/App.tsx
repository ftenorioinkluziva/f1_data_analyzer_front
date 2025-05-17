import { useState } from 'react';
import { WeatherDashboard } from './components/WeatherDashboard';
import CircuitTracker from './components/CircuitTracker';

function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'circuit' | 'tracker'>('dashboard');

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
              Dashboard Detalhado
            </button>
            <button 
              onClick={() => setActiveView('tracker')}
              className={`px-4 py-2 rounded ${activeView === 'tracker' ? 'bg-blue-600' : 'bg-gray-700'} text-white`}
            >
              Rastreador de Pilotos
            </button>
          </div>
        </div>
      </nav>

      {/* Conteúdo principal */}
      {activeView === 'dashboard' && <WeatherDashboard />}
      {activeView === 'tracker' && <CircuitTracker />}
    </div>
  );
}

export default App;