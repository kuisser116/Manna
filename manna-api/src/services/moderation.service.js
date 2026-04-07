import fetch from 'node-fetch';

/**
 * Analiza contenido (texto o descripción de imagen/video) usando Gemini Flash (Free Tier).
 * @param {string} content - El texto a analizar.
 * @param {string} type - Tipo de contenido (micro-text, image, video).
 */
export async function analyzeContentWithAI(content, type, textContent = null) {
    const groqKey = process.env.GROQ_API_KEY;
    
    if (!groqKey) {
        console.warn('[AI] GROQ_API_KEY no encontrada. Usando moderación básica.');
        return basicModeration(textContent || content, type);
    }

    try {
        console.log(`[AI] Analizando contenido (${type}) con Groq...`);
        let result = null;
        
        // 1. Analizar imagen/video si aplica (soporta URL o Base64)
        if ((type === 'image' || type === 'video') && (content?.startsWith('http') || content?.startsWith('data:image'))) {
            result = await callGroqVision(groqKey, content, type);
            // Si es rechazado, no necesitamos seguir analizando el texto
            if (result && result.verdict === 'rejected') {
                console.log(`[AI Vision] Rechazado: ${result.reason}`);
                return result;
            }
        }

        // 2. Analizar texto (si es tipo micro-text O si hay textContent adicional para imagen/video)
        const textToAnalyze = textContent || (type === 'micro-text' ? content : null);
        
        if (textToAnalyze && textToAnalyze.trim().length > 0) {
            const textResult = await callGroq(groqKey, textToAnalyze, type);
            
            if (textResult && textResult.verdict === 'rejected') {
                console.log(`[AI Text] Rechazado: ${textResult.reason}`);
                return textResult;
            }
            
            // Si no hay resultado de visión previo, usamos el de texto
            if (!result) result = textResult;
        }

        if (result) {
            console.log(`[AI] Veredicto Final: ${result.verdict} | Confianza: ${result.confidence} | Razón: ${result.reason}`);
            return result;
        }
    } catch (err) {
        console.warn('[AI] Error con Groq:', err.message);
    }

    console.warn('[AI] Fallo en la IA. Usando moderación básica.');
    return basicModeration(textContent || content, type);
}

async function callGroq(apiKey, content, type) {
    const prompt = `Eres un moderador experto para la red social "Manná". 
    Analiza el siguiente contenido (${type}) y decide si infringe las normas de la comunidad (odio, acoso, sexualidad explícita, estafas/scams o spam).
    
    Responde ÚNICAMENTE con un objeto JSON válido con esta estructura:
    {"verdict": "approved" | "rejected" | "uncertain", "confidence": 0.95, "reason": "breve explicación en español"}.
    
    Contenido: ${content}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2
        })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    if (data.choices && data.choices.length > 0) {
        return JSON.parse(data.choices[0].message.content);
    }
    return null;
}

async function callGroqVision(apiKey, imageUrl, type) {
    const prompt = `Analiza esta ${type === 'video' ? 'miniatura de video' : 'imagen'} para la red social "Manná". 
    Determina si infringe las normas críticas: 
    1. Desnudez o contenido sexual.
    2. Violencia explícita o sangre.
    3. Símbolos de odio o racismo.
    4. Juegos de azar, CASINOS, apuestas o contenido de fraude/estafas.
    
    Responde ÚNICAMENTE con un JSON: {"verdict": "approved" | "rejected", "confidence": 0.9, "reason": "explicación en español"}.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: imageUrl } }
                    ]
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
        })
    });

    const data = await response.json();
    if (data.error) {
        console.error('[AI Vision Error]', data.error);
        throw new Error(data.error.message);
    }

    if (data.choices && data.choices.length > 0) {
        return JSON.parse(data.choices[0].message.content);
    }
    console.error('[AI Vision Error] No choices in response', data);
    return null;
}


function basicModeration(content, type) {
    const forbiddenKeywords = ['spam', 'escándalo', 'estafa', 'fraude', 'scam', 'desnudo', '🔞', 'casino'];
    const lowerContent = String(content || '').toLowerCase();
    const foundKeywords = forbiddenKeywords.filter(word => lowerContent.includes(word));
    
    if (foundKeywords.length > 0) {
        return { verdict: 'rejected', confidence: 0.9, reason: `Palabras prohibidas: ${foundKeywords.join(', ')}` };
    }
    return { verdict: 'approved', confidence: 0.8, reason: 'Pasa filtro básico' };
}

