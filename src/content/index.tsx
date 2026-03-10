import React from 'react';
import ReactDOM from 'react-dom/client';
import ContentApp from './ContentApp.tsx';
// @ts-ignore
import styles from '../content.css?inline'; // Import CSS as a string 


const init = () => {
    // 1. Create a host element for the Shadow DOM
    const hostElement = document.createElement('div');
    hostElement.id = 'grammarly-clone-host';

    // Position it at the fixed (0,0) coordinate of the viewport.
    hostElement.style.position = 'fixed';
    hostElement.style.top = '0';
    hostElement.style.left = '0';
    hostElement.style.width = '100vw';
    hostElement.style.height = '100vh';
    hostElement.style.pointerEvents = 'none'; // so clicks pass through!
    hostElement.style.zIndex = '2147483647'; // Maximum z-index
    document.documentElement.appendChild(hostElement);

    // 2. Attach Shadow DOM
    const shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // 3. Inject our custom CSS inside the Shadow DOM
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    shadowRoot.appendChild(styleElement);

    // 4. Inject our React App root inside the Shadow DOM
    const rootElement = document.createElement('div');
    rootElement.id = 'grammarly-clone-root';
    rootElement.style.pointerEvents = 'auto'; // Re-enable pointer events for our app React components
    shadowRoot.appendChild(rootElement);

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
