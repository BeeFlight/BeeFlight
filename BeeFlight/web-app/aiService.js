// aiService.js - Strict Adapter Pattern for Multi-Provider AI Routing

// Internal helper for API fetch
async function _fetchCompletion(url, headers, payload, provider) {
    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`${provider} API ${response.status}: ${await response.text()}`);
    }

    return await response.json();
}

/**
 * Normalizes different API response formats into a standard string.
 */
function _normalizeResponse(providerType, data) {
    try {
        if (providerType === 'google') {
            return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
        if (['openai', 'grok', 'groq'].includes(providerType)) {
            return data?.choices?.[0]?.message?.content || '';
        }
        if (providerType === 'anthropic') {
            return data?.content?.[0]?.text || '';
        }
    } catch (e) {
        console.error("Failed to parse AI response payload:", e, data);
    }
    return '';
}

/**
 * Generate an AI response using the strict adapter pattern.
 * @param {string} providerType - The provider key: 'google', 'openai', 'groq', 'grok', 'anthropic'
 * @param {string} modelId - The model identifier string
 * @param {string} systemPrompt - System instructions
 * @param {string} userText - User message content
 * @param {string} apiKey - The API key for the provider
 * @returns {Promise<string>} The AI response text
 */
async function generateAIResponse(providerType, modelId, systemPrompt, userText, apiKey) {
    if (!providerType || !modelId) {
        throw new Error("AI provider or model not selected.");
    }
    if (!apiKey) {
        throw new Error("API Key is missing for the selected provider.");
    }

    let url = '';
    let headers = {};
    let payload = {};

    switch (providerType) {
        case 'google':
            url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            };
            payload = {
                "systemInstruction": { "parts": [{ "text": systemPrompt }] },
                "contents": [{ "role": "user", "parts": [{ "text": userText }] }]
            };
            break;

        case 'openai':
        case 'grok':
        case 'groq':
            if (providerType === 'openai') url = 'https://api.openai.com/v1/chat/completions';
            if (providerType === 'grok') url = 'https://api.x.ai/v1/chat/completions';
            if (providerType === 'groq') url = 'https://api.groq.com/openai/v1/chat/completions';

            headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            };
            // Use the correct model ID for Groq
            const actualModel = providerType === 'groq' ? 'llama-3.3-70b-versatile' : modelId;
            payload = {
                "model": actualModel,
                "messages": [
                    { "role": "system", "content": systemPrompt },
                    { "role": "user", "content": userText }
                ],
                "max_tokens": 2048
            };
            break;

        case 'anthropic':
            url = 'https://api.anthropic.com/v1/messages';
            headers = {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
                "anthropic-dangerous-direct-browser-access": "true"
            };
            payload = {
                "model": modelId,
                "max_tokens": 2048,
                "system": systemPrompt,
                "messages": [{ "role": "user", "content": userText }]
            };
            break;

        default:
            throw new Error(`Unsupported AI Provider: ${providerType}`);
    }

    const responseJSON = await _fetchCompletion(url, headers, payload, providerType);
    return _normalizeResponse(providerType, responseJSON);
}

// Attach to window for global access
window.generateAIResponse = generateAIResponse;
