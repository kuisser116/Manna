-- Migración: Almacenar texto íntegro de cada versión de Términos
-- Ejecutar en Supabase SQL Editor
-- Esto permite verificar el hash SHA-256 registrado en terms_acceptance_log
-- contra el texto exacto que el usuario aceptó

-- 1. Crear tabla de versiones de términos
CREATE TABLE IF NOT EXISTS terms_versions (
  version TEXT PRIMARY KEY,
  full_text TEXT NOT NULL,
  hash_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at TIMESTAMPTZ
);

-- 2. Insertar v1.4 (versión actual)
INSERT INTO terms_versions (version, full_text, hash_sha256)
SELECT 'v1.4', 
  $terms$
Términos y Condiciones de Shekael v1.4
Última actualización: 30 de Julio de 2026

1. ACEPTACIÓN. Al registrarte y usar Shekael aceptas estos Términos. Si no aceptas, no uses la app. Shekael puede modificarlos; los cambios se notifican en la app y requieren aceptación explícita.

2. ELEGIBILIDAD. Debes tener 13+ años (13-18 requieren autorización parental). No debes estar en listas OFAC/sanciones. Si fuiste suspendido previamente por violar términos, no puedes registrarte de nuevo sin autorización.

3. SERVICIO. Shekael es una red social con ecosistema digital propio basado en la red Stellar (actualmente testnet, migrable a mainnet). Incluye: publicaciones, chat privado cifrado, apoyos entre usuarios, bono promocional de $20 MXN, recompensas por anuncios, pagos QR en comercios afiliados, y Fondo Regional (10% de comisión en apoyos).

4. USDC — TOKEN DIGITAL, NO MONEDA. USDC es un token digital emitido en Stellar. NO es moneda de curso legal, NO está respaldado por ningún gobierno, NO está asegurado por FDIC/IPAB/nadie, NO está registrado como valor (security). No tiene valor garantizado. Su valor percibido depende de oferta/demanda dentro del ecosistema. No genera intereses ni rendimientos. No puede ser canjeado por efectivo a través de Shekael. Cualquier equivalencia en MXN es aspiracional y no vinculante.

5. BONO PROMOCIONAL $20 MXN. Usuarios nuevos reciben un bono virtual de $20 MXN. Se libera $1 MXN (en USDC equivalente) por cada post aprobado por Shekael, máximo 1 por día, hasta 20 liberaciones. El bono expira 70 días después del primer post aprobado; los fondos no reclamados vuelven al Fondo Regional. Shekael puede modificar, suspender o cancelar este programa en cualquier momento.

6. APOYOS (SUPPORTS). Los usuarios pueden enviar apoyos económicos a creadores. Cada apoyo genera una comisión del 10% que se deposita en el Fondo Regional. Las transacciones son irrevocables en la red Stellar. Shekael no garantiza la recepción del apoyo por parte del destinatario.

7. WALLET STELLAR. Shekael genera y custodia claves Stellar cifradas por usuario con PIN. Shekael NO puede recuperar claves perdidas. La pérdida de acceso a tu cuenta de Google o PIN resulta en pérdida permanente de acceso a tus USDC. Shekael no garantiza la seguridad absoluta del sistema de encriptación.

8. RECOMPENSAS POR ANUNCIOS. Shekael puede mostrar anuncios recompensados. Al verlos completos ganas USDC. Shekael puede modificar las tasas, requisitos y disponibilidad en cualquier momento sin responsabilidad.

9. SERVICIOS DE TERCEROS. Depósitos, retiros y swaps ocurren en exchanges, anchors (MoneyGram) o el DEX de Stellar — todos externos. Shekael no opera, controla ni es responsable por ellos. El usuario asume todo riesgo.

10. CONTENIDO. Shekael defiende la libertad de expresión. No censura temas controversiales. Está prohibido: contenido ilegal, spam, estafas, incitación a violencia, discriminación. Shekael usa filtro automatizado + detección NSFW local. Violaciones pueden resultar en suspensión. En suspensión definitiva, los USDC acumulados pasan al Fondo Regional sin compensación.

11. PROPIEDAD INTELECTUAL. El usuario conserva derechos de su contenido, otorgando a Shekael licencia para operar la plataforma. La marca Shekael, logo y código son propiedad exclusiva de Shekael.

12. PRIVACIDAD. Shekael recopila: email, nombre, avatar, contenido publicado, datos de uso, ubicación aproximada (solo para comercios cercanos), IP, user-agent. No comparte datos con terceros sin consentimiento. Cumple con LFPDPPP mexicana. Puedes solicitar eliminación de tus datos contactando a soporte.

13. RIESGOS. USDC puede volverse cero. Transacciones en Stellar son irreversibles. La red Stellar puede sufrir forks, ataques o fallas. El marco regulatorio de tokens está en evolución. No hay seguro ni protección al consumidor. Al usar Shekael ACEPTAS TODOS ESTOS RIESGOS EXPRESAMENTE.

14. LIMITACIÓN DE RESPONSABILIDAD. Shekael NO es responsable por: daños directos/indirectos por uso de la plataforma, pérdida de USDC por errores técnicos o de red, contenido de usuarios, pérdida de acceso a cuenta, interrupciones del servicio. El software se proporciona "tal cual", sin garantía. Responsabilidad máxima acumulada limitada al USDC que el usuario haya recibido en los últimos 12 meses.

15. EVIDENCIA. Cada aceptación de términos registra: versión, hash SHA-256 del texto exacto, timestamp, IP, user-agent, user_id. Este registro tiene valor probatorio y se conserva indefinidamente. Shekael almacena el texto íntegro de cada versión para su verificación.

16. LEY Y JURISDICCIÓN. Ley aplicable: México (Ciudad de México). Renuncia expresa a acción colectiva (class action). Cualquier disputa se resolverá en tribunales de la CDMX.

Al usar Shekael aceptas estos términos v1.4.
  $terms$,
  (SELECT crypt('Términos y Condiciones de Shekael v1.4\nÚltima actualización: 30 de Julio de 2026\n...', gen_salt('bf')))
WHERE NOT EXISTS (SELECT 1 FROM terms_versions WHERE version = 'v1.4');

-- 3. Nota: el hash SHA-256 debe computarse desde el backend (auth.routes.js)
-- y almacenarse aquí manualmente después de obtenerlo.
-- Ejecutar después: UPDATE terms_versions SET hash_sha256 = '<hash>' WHERE version = 'v1.4';

-- 4. Índice para búsquedas
CREATE INDEX IF NOT EXISTS idx_terms_versions_version ON terms_versions(version);
