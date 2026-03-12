const API_KEY = (import.meta as any).env.VITE_SARVAM_API_KEY;

/**
 * Converts speech to text using Sarvam AI Saaras v3
 * @param {Blob} audioBlob - The recorded audio blob
 * @param {string} languageCode - Preferred language code (e.g., 'hi-IN')
 */
export const speechToText = async (audioBlob: Blob, languageCode = 'hi-IN') => {
    try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('model', 'saaras:v1');
        formData.append('language_code', languageCode);

        const response = await fetch('https://api.sarvam.ai/v1/speech-to-text-translate', {
            method: 'POST',
            headers: {
                'api-subscription-key': API_KEY
            },
            body: formData
        });

        if (!response.ok) throw new Error('STT Request failed');
        const data = await response.json();
        return data.transcript || data.text;
    } catch (error) {
        console.error('Sarvam STT Error:', error);
        throw error;
    }
};

/**
 * Converts text to speech using Sarvam AI Bulbul v3
 * @param {string} text - The text to convert
 * @param {string} languageCode - Target language (e.g., 'hi-IN')
 * @param {string} speaker - Voice choice ('meera', 'pavithra', 'mahesh', etc.)
 */
export const textToSpeech = async (text: string, languageCode = 'hi-IN', speaker = 'meera') => {
    try {
        const response = await fetch('https://api.sarvam.ai/v1/text-to-speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-subscription-key': API_KEY
            },
            body: JSON.stringify({
                inputs: [text],
                target_language_code: languageCode,
                speaker: speaker,
                pitch: 0.5,
                pace: 1.0,
                loudness: 1.5,
                speech_sample_rate: 22050,
                enable_preprocessing: true,
                model: 'bulbul:v1'
            })
        });

        if (!response.ok) throw new Error('TTS Request failed');
        const data = await response.json();

        if (data.audios && data.audios[0]) {
            return `data:audio/wav;base64,${data.audios[0]}`;
        }
        return null;
    } catch (error) {
        console.error('Sarvam TTS Error:', error);
        throw error;
    }
};

/**
 * Refines text (grammar correction, clarity) using Sarvam AI model
 * @param {string} text - The text to refine
 */
export const refineText = async (text: string) => {
    try {
        const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-subscription-key': API_KEY
            },
            body: JSON.stringify({
                model: 'sarvam-30b', // Use the stable 30B chat model
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional editor. If the input is a sentence fragment, complete it or make it more professional. If it has grammar/spelling issues, fix them. If the text is already a perfect, complete, and professional sentence, return it exactly as is. Return ONLY the refined text.'
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Sarvam AI Error Response:', errorText);
            throw new Error(`Refinement Request failed: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || text;
    } catch (error) {
        console.error('Sarvam Refinement Error:', error);
        // Fallback to original text or a basic fix if the API is down
        return text;
    }
};
