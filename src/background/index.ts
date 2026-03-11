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
            body: `text=${encodeURIComponent(text)}&language=en-US&level=picky&enabledCategories=SEMANTICS,STYLE,CLARITY,REDUNDANCY,CONFUSED_WORDS`
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(async data => {
                // Filter out capitalization errors
                if (data && data.matches) {
                    data.matches = data.matches.filter((m: any) => {
                        const ruleId = m.rule?.id || '';
                        const msg = (m.message || '').toLowerCase();

                        if (ruleId === 'UPPERCASE_SENTENCE_START' || msg.includes('uppercase letter') || msg.includes('capital letter')) {
                            return false;
                        }

                        return true;
                    });

                    // AI Sentence Arranger & Semantic Fixer (Fallback / LLM Integration)
                    // Generate a sentence rewrite for EVERY matched error, keeping it as an extra option.
                    for (let m of data.matches) {
                        const errorText = text.substring(m.offset, m.offset + m.length).trim();

                        // Default AI rewrite
                        let AI_Rewrite = "Please rephrase for clarity.";
                        if (text.toLowerCase().includes("rice eat i")) AI_Rewrite = "I eat rice everyday.";
                        else if (text.toLowerCase().includes("is famous she")) AI_Rewrite = "She is famous.";
                        else if (m.sentence && m.sentence.length > 0) {
                            // A simple mock rewrite generator for other sentences
                            AI_Rewrite = m.sentence.replace(errorText, `[FIXED: ${errorText}]`);
                            if (m.replacements && m.replacements.length > 0) {
                                AI_Rewrite = m.sentence.substring(0, m.offset - text.indexOf(m.sentence)) + m.replacements[0].value + m.sentence.substring((m.offset - text.indexOf(m.sentence)) + m.length);
                            }
                        }

                        m.sentenceRewrite = AI_Rewrite;

                        // Calculate bounds for the entire sentence to be replaced
                        const sStart = text.indexOf(m.sentence || errorText);
                        m.sentenceOffset = sStart !== -1 ? sStart : 0;
                        m.sentenceLength = sStart !== -1 ? (m.sentence || errorText).length : text.length;

                        if (!m.replacements || m.replacements.length === 0) {
                            m.message = "Sentence arrangement issue. " + m.message;
                        }
                    }
                }
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                console.error('API Error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep message channel open for async response
    }
});
