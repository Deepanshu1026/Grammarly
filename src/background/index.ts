/// <reference types="chrome" />

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'checkGrammar') {
        let text = request.text;

        // Safety Limit: Prevent checking text inputs larger than 5,000 characters
        // to avoid crashing the extension or getting IP-banned by LanguageTool API limits.
        if (text && text.length > 5000) {
            text = text.substring(0, 5000); // Truncate to safety limit
        }

        const url = 'https://api.languagetool.org/v2/check';

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `text=${encodeURIComponent(text)}&language=en-US`
        })
            .then(response => response.json())
            .then(data => {
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                console.error('API Error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep message channel open for async response
    }
});
