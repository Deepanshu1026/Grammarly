import React from 'react';
import ReactDOM from 'react-dom/client';
import ContentApp from './ContentApp';
import '../content.css'; // Don't use index.css; that contains global resets that break the host site.


const init = () => {
    const rootElement = document.createElement('div');
    rootElement.id = 'grammarly-clone-root';
    document.body.appendChild(rootElement);

    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <ContentApp />
        </React.StrictMode>
    );
};

// Only initialize if we're in a browser environment (just to be safe)
if (typeof document !== 'undefined') {
    init();
}
