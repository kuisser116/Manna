import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL y SUPABASE_KEY son requeridos en el archivo .env');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(60000) })
  }
});

/**
 * Retorna el cliente de Supabase para interactuar con la base de datos.
 * Reemplaza la funcionalidad de SQLite (better-sqlite3) por PostgreSQL en la nube.
 */
export function getDB() {
  return supabase;
}

export default getDB;
