import { refineText } from '../services/sarvam';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    console.log('[Background] Received request:', request.action);
    if (request.action === 'checkGrammar') {
        const text = request.text;

        if (!text || text.trim().length === 0) {
            sendResponse({ success: true, data: { matches: [] } });
            return true;
        }

        // Safety Limit: Prevent checking text inputs larger than 5,000 characters
        const safeText = text.length > 5000 ? text.substring(0, 5000) : text;

        // Skip single words (usually just names or labels)
        const wordCount = safeText.trim().split(/\s+/).length;
        if (wordCount < 2) {
            sendResponse({ success: true, data: { matches: [] } });
            return true;
        }

        refineText(safeText)
            .then(refinedText => {
                console.log(`[Background] Input: "${safeText}" -> Result: "${refinedText}"`);
                // If AI returned something different than what we sent
                if (refinedText && refinedText.trim() !== safeText.trim()) {
                    // Return a single match that covers the whole text for "Enhance & Fix All"
                    const response = {
                        success: true,
                        data: {
                            matches: [
                                {
                                    offset: 0,
                                    length: safeText.length,
                                    replacements: [{ value: refinedText }],
                                    message: "Refined by Sarvam AI",
                                    rule: { id: "SARVAM_REFINEMENT" }
                                }
                            ]
                        }
                    };
                    sendResponse(response);
                } else {
                    sendResponse({ success: true, data: { matches: [] } });
                }
            })
            .catch(error => {
                console.error('Sarvam Refinement Error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep message channel open for async response
    }
});
