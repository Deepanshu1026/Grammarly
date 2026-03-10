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
        <div className="popup-container">
            <div className="popup-header">
                <CheckCircle2 className="header-icon" />
                <h1>Grammarly Clone</h1>
                <p>AI Writing Assistant</p>
            </div>

            <div className="popup-body">
                <div className="toggle-row">
                    <div className="toggle-label">
                        <Settings className="toggle-icon" />
                        <span>Enable Checking</span>
                    </div>

                    <button
                        onClick={toggleEnabled}
                        className={`toggle-btn ${enabled ? 'enabled' : 'disabled'}`}
                    >
                        <div className="toggle-knob"></div>
                    </button>
                </div>
                <p className="popup-desc">
                    Automatically analyzes your text for grammar, spelling, and style improvements on any website.
                </p>
            </div>

            <div className="popup-footer">
                Powered by LanguageTool API • Built with Vite & React
            </div>
        </div>
    );
}

export default App;
