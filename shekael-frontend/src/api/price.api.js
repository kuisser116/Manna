import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

let cachedRate = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function getMxnRate() {
  const now = Date.now();
  if (cachedRate && (now - lastFetch) < CACHE_TTL) return cachedRate;
  
  try {
    const { data } = await axios.get(`${API_URL}/price/usd-mxn`);
    cachedRate = data.rate;
    lastFetch = now;
    return data.rate;
  } catch {
    return 18.50;
  }
}

export async function mxnToUsdc(mxnAmount) {
  const rate = await getMxnRate();
  return parseFloat(mxnAmount || 0) / rate;
}

export async function usdcToMxn(usdcAmount) {
  const rate = await getMxnRate();
  return parseFloat(usdcAmount || 0) * rate;
}

export default { getMxnRate, mxnToUsdc, usdcToMxn };
