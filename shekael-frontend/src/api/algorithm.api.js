const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getToken() {
    return localStorage.getItem('Shekael_token');
}

async function trackSignal(postId, signalType, source = 'shekael') {
    const token = getToken();
    if (!token) return;
    try {
        await fetch(`${API_URL}/algorithm/signal`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ postId, signalType, source })
        });
    } catch (e) {
        // Silently fail — tracking no debe romper la UX
    }
}

async function getRankedFeed({ limit = 50, offset = 0, filter = 'all' } = {}) {
    const token = getToken();
    const res = await fetch(
        `${API_URL}/algorithm/ranked?limit=${limit}&offset=${offset}&filter=${filter}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return res.json();
}

async function getPostScores(postIds) {
    const token = getToken();
    const res = await fetch(
        `${API_URL}/algorithm/scores?postIds=${postIds.join(',')}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return res.json();
}

export { trackSignal, getRankedFeed, getPostScores };
