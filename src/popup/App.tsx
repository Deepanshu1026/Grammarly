import { useState, useEffect } from 'react';
import { CheckCircle2, Settings } from 'lucide-react';

function App() {
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        chrome.storage?.sync?.get(['enabled'], (result) => {
            if (result.enabled !== undefined) {
                setEnabled(result.enabled);
            }
        });
    }, []);

    const toggleEnabled = () => {
        const newState = !enabled;
        setEnabled(newState);
        chrome.storage?.sync?.set({ enabled: newState });
    };

    return (
        <div className="w-full h-full bg-gray-50 text-gray-800 flex flex-col">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-6 text-white text-center shadow-sm">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2" />
                <h1 className="text-xl font-bold tracking-tight">Grammarly Clone</h1>
                <p className="text-sm opacity-90 mt-1">AI Writing Assistant</p>
            </div>

            <div className="p-6 bg-white border-b flex-1">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                        <Settings className="w-5 h-5 text-gray-500" />
                        <span className="font-semibold">Enable Checking</span>
                    </div>

                    <button
                        onClick={toggleEnabled}
                        className={`shrink-0 cursor-pointer w-12 h-6 rounded-full relative transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">
                    Automatically analyzes your text for grammar, spelling, and style improvements on any website.
                </p>
            </div>

            <div className="p-4 text-center text-xs text-gray-400">
                Powered by LanguageTool API • Built with Vite & React
            </div>
        </div>
    );
}

export default App;
