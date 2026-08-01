import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import styles from '../styles/pages/Terms.module.css';
import useStore from '../store';

const API_URL = import.meta.env.VITE_API_URL || location.origin;

export default function Terms() {
  const navigate = useNavigate();
  const { user, token, acceptTerms } = useStore();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [termsVersion, setTermsVersion] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');

  // Si hay token pero user aún no carga, esperar
  const storedToken = localStorage.getItem('Shekael_token');
  const isLoadingUser = !!storedToken && !user;

  // Fetch versión actual desde el backend al montar
  useEffect(() => {
    fetch(`${API_URL}/auth/terms/current`)
      .then(r => r.json())
      .then(data => {
        setTermsVersion(data.version);
        setLastUpdated(data.last_updated ? new Date(data.last_updated).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
        void('[Terms] backend version:', data.version);
      })
      .catch(err => {
        console.error('[Terms] error fetching version:', err);
        setTermsVersion('v1.3'); // fallback a hardcode
        setLastUpdated('12 de Julio de 2026');
      });
  }, []);

  // Verificar aceptación contra la versión del backend
  const hasAccepted = user && termsVersion ? user.terms_version === termsVersion : false;

  void('[Terms] user:', !!user, 'terms_version:', user?.terms_version, 'backendVersion:', termsVersion, 'hasAccepted:', hasAccepted);

  // Redirigir al feed si ya aceptó
  useEffect(() => {
    void('[Terms] hasAccepted changed:', hasAccepted, 'navigating to feed?', hasAccepted);
    if (hasAccepted) {
      navigate('/feed');
    }
  }, [hasAccepted, navigate]);

  // Bloquear navegación hacia atrás si no ha aceptado
  useEffect(() => {
    if (hasAccepted) return;
    const handler = (e) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [hasAccepted]);

  const handleAccept = async () => {
    if (!termsVersion) {
      console.error('[Terms] No termsVersion available');
      setError('Error al obtener versión de términos. Intenta de nuevo.');
      return;
    }
    setAccepting(true);
    setError('');
    void('[Terms] handleAccept called with version:', termsVersion, 'token:', !!token);
    try {
      const result = await acceptTerms(termsVersion);
      void('[Terms] acceptTerms success, result:', JSON.stringify(result));
      // Flag localStorage para UX instantánea entre recargas
      const flagKey = 'shekael_terms_' + termsVersion + '_accepted';
      localStorage.setItem(flagKey, 'true');
      void('[Terms] Flag set:', flagKey, '= true');
      setAccepted(true);
      setTimeout(() => {
        void('[Terms] Navigating to /feed');
        navigate('/feed');
      }, 500);
    } catch (err) {
      console.error('[Terms] acceptTerms FAILED:', err.message);
      setError(err.message || 'Error al aceptar términos');
    } finally {
      setAccepting(false);
    }
  };

  if (isLoadingUser) {
    return (
      <div className={styles.page}>
        <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <Loader2 size={32} className={styles.spinner} />
        </div>
      </div>
    );
  }

  // Si acaba de aceptar, mostrar pantalla de éxito
  if (accepted) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <motion.div className={styles.acceptedBox}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <CheckCircle2 size={48} color="#16a34a" />
            <h2>¡Términos aceptados!</h2>
            <p>Gracias por confiar en Shekael.</p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <motion.div
          className={styles.header}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {hasAccepted && (
            <Link to="/feed" className={styles.backLink}>
              <ArrowLeft size={20} />
              <span>Volver al inicio</span>
            </Link>
          )}
          <h1 className={styles.title}>Términos y Condiciones de Shekael</h1>
          <p className={styles.lastUpdated}>Versión {termsVersion || 'v1.3'} · Última actualización: {lastUpdated || '15 de Julio de 2026'}</p>
        </motion.div>

        <motion.div
          className={styles.content}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className={styles.summary}>
            <strong>Resumen:</strong> Shekael es una red social con un ecosistema digital propio (USDC). 
            USDC es un token digital emitido en la red Stellar (testnet). No está garantizado, asegurado 
            ni regulado por ninguna autoridad financiera. Su valor depende del mercado y de la comunidad. 
            Al usar Shekael aceptas estos términos.
          </div>

          <section className={styles.section}>
            <h2>1. Aceptación de los Términos</h2>
            <p>
              Al registrarte, acceder o utilizar Shekael ("la Plataforma"), aceptas estar legalmente 
              vinculado por estos Términos y Condiciones ("Términos"). Si no estás de acuerdo, no utilices 
              la Plataforma. Te notificaremos sobre cambios materiales con al menos 15 días de antelación 
              mediante un aviso en la app o por correo electrónico.
            </p>
          </section>

          <section className={styles.section}>
            <h2>2. Elegibilidad</h2>
            <p>Para usar Shekael debes:</p>
            <ul>
              <li>Tener al menos <strong>13 años</strong> de edad. Si tienes entre 13 y 18 años, debes contar con autorización de tus padres o tutores.</li>
              <li>No estar sujeto a sanciones económicas o listas de vigilancia internacional.</li>
              <li>No haber sido suspendido previamente de la Plataforma por violación de estos Términos.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>3. Descripción del Servicio</h2>
            <p>
              Shekael es una red social con ecosistema digital propio basado en la red Stellar
              (actualmente en testnet, migrable a mainnet en el futuro). Incluye las siguientes funcionalidades:
            </p>
            <ul>
              <li><strong>Publicaciones</strong> de texto, imágenes, video y micro-contenido.</li>
              <li><strong>Chat privado cifrado</strong> entre usuarios.</li>
              <li><strong>Apoyos (Supports)</strong> — transferencias económicas entre usuarios por contenido.</li>
              <li><strong>Bono Promocional</strong> de $20 MXN para nuevos usuarios.</li>
              <li><strong>Recompensas por Anuncios</strong> — ganas USDC viendo anuncios completos.</li>
              <li><strong>Pagos QR</strong> en comercios afiliados dentro de la Plataforma.</li>
              <li><strong>Fondo Regional</strong> — comisión del 10% en apoyos para beneficios comunitarios.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>4. USDC — Token Digital, No Moneda</h2>
            <p>
              USDC es un <strong>token digital</strong> emitido en la red Stellar (código de activo <strong>USDC</strong>).
              Opera sobre una blockchain pública y puede transferirse entre usuarios dentro de la Plataforma.
            </p>
            <p className={styles.highlight}>
              <strong>USDC NO es moneda de curso legal, no está respaldado por ningún gobierno,
              no está asegurado por FDIC, IPAB ni ninguna institución, y no está registrado
              como valor (security) ante ninguna autoridad regulatoria.</strong>
            </p>
            <p>Al usar Shekael, reconoces y aceptas expresamente que:</p>
            <ul>
              <li>USDC <strong>no tiene valor garantizado</strong>. Su valor percibido depende de oferta y demanda dentro del ecosistema.</li>
              <li>Cualquier equivalencia en MXN es <strong>aspiracional y no vinculante</strong>.</li>
              <li>USDC <strong>no genera intereses ni rendimientos</strong> de ninguna naturaleza.</li>
              <li>No puede ser <strong>canjeado por efectivo</strong> a través de Shekael.</li>
              <li>Shekael <strong>no es institución financiera</strong>, banco, casa de cambio ni FinTech regulada.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>5. Bono Promocional $20 MXN</h2>
            <p>
              Los usuarios nuevos reciben un bono virtual de <strong>$20 MXN</strong>. Este bono se libera
              a razón de <strong>$1 MXN</strong> (en USDC) por cada post aprobado por la administración de Shekael,
              con un máximo de un post aprobado por día. El bono expira <strong>70 días</strong> después del
              primer post aprobado; los fondos no reclamados regresan al Fondo Regional.
            </p>
            <p>
              Shekael puede modificar, suspender o cancelar este programa promocional en cualquier momento
              sin responsabilidad hacia los usuarios. Este bono no constituye un derecho adquirido,
              un salario, un rendimiento financiero ni una obligación contractual.
            </p>
          </section>

          <section className={styles.section}>
            <h2>6. Apoyos (Supports) y Fondo Regional</h2>
            <p>
              Los usuarios pueden enviar apoyos económicos a creadores dentro de la Plataforma usando USDC.
              Cada apoyo genera una comisión del <strong>10%</strong> que se deposita en el Fondo Regional
              para beneficios comunitarios determinados unilateralmente por Shekael.
            </p>
            <p>
              Las transacciones en la red Stellar son <strong>irreversibles</strong>. No existe chargeback,
              reembolso forzoso ni reversión de transacciones confirmadas. Shekael no garantiza la recepción
              del apoyo por parte del destinatario ni se hace responsable por errores en las transacciones.
            </p>
          </section>

          <section className={styles.section}>
            <h2>7. Wallet Stellar y Seguridad</h2>
            <p>
              Shekael genera y custodia claves Stellar cifradas por usuario mediante PIN. Cada wallet se encripta
              con un identificador único asociado a tu cuenta, no con una llave maestra compartida.
            </p>
            <p className={styles.highlight}>
              <strong>Shekael no puede recuperar claves perdidas.</strong> La pérdida de acceso a tu cuenta de Google
              o a tu PIN resultará en la pérdida permanente del acceso a tus USDC. Eres el único responsable
              de mantener tu cuenta segura.
            </p>
          </section>

          <section className={styles.section}>
            <h2>8. Recompensas por Anuncios</h2>
            <p>
              Shekael puede mostrar anuncios recompensados. Al ver un anuncio completo, recibes USDC
              (token de recompensa). Shekael puede modificar las tasas y requisitos de las recompensas
              en cualquier momento sin responsabilidad hacia los usuarios.
            </p>
          </section>

          <section className={styles.section}>
            <h2>9. Depósitos, Retiros y Servicios de Terceros</h2>
            <p>
              Depósitos, retiros y swaps ocurren en exchanges, anchors (MoneyGram) o el DEX de Stellar.
              Shekael <strong>no opera, controla ni es responsable</strong> por estos servicios de terceros.
              El usuario asume todo riesgo asociado.
            </p>
            <p className={styles.highlight}>
              Shekael no recibe, custodia ni procesa depósitos en moneda fiduciaria. Todo intercambio
              USDC/MXN debe ocurrir a través de servicios externos bajo tu propio riesgo.
            </p>
          </section>

          <section className={styles.section}>
            <h2>10. Contenido y Moderación</h2>
            <p>
              Shekael cree en la <strong>libertad de expresión como principio fundamental</strong>. 
              No censuramos temas sensibles, controversiales o incómodos. Creemos que la conciencia 
              se construye hablando, no callando. Todo contenido que no sea ilegal tiene espacio 
              en Shekael, y la comunidad decide su valor con likes, supports y comentarios.
            </p>
            <p>Sin embargo, para proteger a la comunidad, está prohibido:</p>
            <ul>
              <li>Contenido ilegal (abuso infantil, trata de personas, venta de drogas/armas, apología del delito).</li>
              <li>Spam o publicación automatizada que degrade la experiencia de todos.</li>
              <li>Estafas o esquemas fraudulentos (Ponzi, pirámides).</li>
              <li>Incitación a la violencia, amenazas o terrorismo.</li>
              <li>Discriminación por raza, etnia, religión u origen nacional (según la ley mexicana).</li>
            </ul>
            <p>
              Shekael utiliza un <strong>filtro automatizado de palabras clave</strong> que bloquea
              contenido ilegal al momento de publicar. Este filtro no censura temas controversiales,
              solo lo que está expresamente prohibido por la ley. Si el filtro rechaza tu contenido,
              recibirás un mensaje claro del motivo.
            </p>
            <p>
              Además, las imágenes publicadas se analizan con un <strong>modelo de detección
              NSFW</strong> que corre localmente en tu navegador (sin enviar la imagen a servidores
              externos). Si se detecta contenido sensible, se te notifica y la publicación puede ser
              marcada para revisión manual antes de aparecer en el feed.
            </p>
            <p>
              Si un usuario considera que algo cruza la línea, puede reportarlo y se revisará
              manualmente. Shekael no eliminará contenido solo por ser incómodo, controversial
              o impopular.
            </p>
            <p className={styles.highlight}>
              Shekael se reserva el derecho de suspender cuentas que infrinjan estas normas
              mínimas. En caso de suspensión definitiva, los USDC acumulados serán redirigidos
              al Fondo Regional de Shekael.
            </p>
          </section>

          <section className={styles.section}>
            <h2>11. Propiedad Intelectual</h2>
            <p>
              El usuario conserva todos los derechos de propiedad intelectual sobre el contenido que publique 
              en Shekael. Al publicar contenido, otorgas a Shekael una licencia mundial, no exclusiva, 
              gratuita y transferible para usar, reproducir, distribuir y mostrar dicho contenido dentro 
              de la Plataforma con el propósito de operar y promover Shekael.
            </p>
            <p>
              Todos los derechos de propiedad intelectual de la Plataforma misma (código, marca, diseño, 
              nombre "Shekael", logo) son propiedad exclusiva de Shekael y sus desarrolladores.
            </p>
          </section>

          <section className={styles.section}>
            <h2>12. Privacidad y Datos (LFPDPPP)</h2>
            <p>
              Shekael recopila y procesa tu información de acuerdo con nuestra Política de Privacidad. 
              Al usar la Plataforma, consientes la recopilación y uso de tu información según lo descrito 
              en dicha política. Los datos que recopilamos incluyen:
            </p>
            <ul>
              <li>Información de perfil (nombre, correo electrónico) proporcionada por tu cuenta de Google.</li>
              <li>Contenido que publicas voluntariamente en la Plataforma.</li>
              <li>Datos de uso e interacción con la app.</li>
              <li>Información del dispositivo y ubicación aproximada (para funciones de comercios cercanos).</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>13. Riesgos (Blockchain y Volatilidad)</h2>
            <p className={styles.highlight}>
              Al usar USDC, reconoces que los tokens digitales y las redes blockchain conllevan 
              riesgos inherentes. Shekael <strong>no garantiza</strong> la estabilidad, disponibilidad 
              o valor futuro de USDC. Aceptas expresamente que:
            </p>
            <ul>
              <li>El valor de USDC puede <strong>volverse cero</strong> en cualquier momento debido a 
              condiciones de mercado, cambios regulatorios, fallas técnicas o decisiones de la comunidad.</li>
              <li>Las transacciones en la red Stellar son <strong>irreversibles</strong>. No existe 
              chargeback, reembolso forzoso ni reversión de transacciones confirmadas.</li>
              <li>La red Stellar puede experimentar <strong>congestión, bifurcaciones (forks), 
              ataques de seguridad o fallas</strong> que afecten la disponibilidad o integridad de los tokens.</li>
              <li>El marco regulatorio mexicano e internacional sobre tokens digitales y activos 
              virtuales está en evolución. Cambios regulatorios podrían afectar la operación de USDC 
              o su clasificación legal.</li>
              <li>No existe <strong>ningún seguro, fondo de garantía ni protección al consumidor</strong> 
              que cubra pérdidas relacionadas con USDC.</li>
              <li>La pérdida de acceso a tu cuenta de Google o a tus claves Stellar resultará en la 
              <strong>pérdida permanente</strong> del acceso a tus tokens USDC.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>14. Limitación de Responsabilidad</h2>
            <p className={styles.highlight}>
              Shekael NO será responsable por:
            </p>
            <ul>
              <li>Daños directos, indirectos, incidentales o consecuentes derivados del uso o la imposibilidad de uso de la Plataforma.</li>
              <li>Pérdida de USDC debido a errores técnicos, fallas de la red Stellar, o acciones de terceros.</li>
              <li>Contenido publicado por usuarios que viole derechos de terceros o leyes aplicables.</li>
              <li>Pérdida de acceso a tu cuenta de Google u otros métodos de autenticación externos.</li>
              <li>Interrupciones del servicio, caídas del servidor, o mantenimiento no programado.</li>
            </ul>
            <p>
              El USDC se proporciona "tal cual" y "según disponibilidad", sin garantía de ningún tipo. 
              El valor máximo de la responsabilidad acumulada de Shekael hacia cualquier usuario no excederá 
              el equivalente en USDC que el usuario haya obtenido en los últimos 12 meses.
            </p>
          </section>

          <section className={styles.section}>
            <h2>15. Terminación y Suspensión</h2>
            <p>
              Puedes dejar de usar Shekael en cualquier momento. Shekael puede suspender o terminar tu acceso 
              si violas estos Términos. Al terminar tu relación con Shekael:
            </p>
            <ul>
              <li>Tu acceso a la Plataforma será revocado.</li>
              <li>Los USDC en tu cuenta serán redirigidos al Fondo Regional.</li>
              <li>Shekael no tiene obligación de mantener, devolver ni compensar los USDC acumulados.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>16. Evidencia, Ley y Jurisdicción</h2>
            <p>
              <strong>Registro de Evidencia.</strong> Cada aceptación de estos Términos registra en la base de datos:
              versión exacta aceptada, hash SHA-256 del texto íntegro, timestamp de aceptación,
              dirección IP del usuario, user-agent del navegador/dispositivo, y el identificador único del usuario.
              Este registro tiene valor probatorio y se conserva indefinidamente.
            </p>
            <p>
              Shekael almacena el texto íntegro de cada versión de los Términos para permitir su verificación
              contra el hash registrado. Cualquier discrepancia entre el texto almacenado y el hash registrado
              será considerada evidencia de manipulación.
            </p>
            <p>
              <strong>Ley Aplicable.</strong> Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos.
              Cualquier controversia será sometida a los tribunales competentes de la Ciudad de México,
              renunciando a cualquier otro fuero.
            </p>
            <p className={styles.highlight}>
              <strong>Renuncia a Acción Colectiva.</strong> AL ACEPTAR ESTOS TÉRMINOS, RENUNCIAS EXPRESAMENTE
              A PARTICIPAR EN CUALQUIER ACCIÓN COLECTIVA (CLASS ACTION) CONTRA SHEKAEL. Cualquier disputa
              será resuelta de manera individual.
            </p>
          </section>
          <section className={styles.section}>
            <h2>17. Contacto</h2>
            <p>
              Para preguntas, aclaraciones o notificaciones relacionadas con estos Términos, puedes 
              contactarnos a través de los medios dispuestos en la Plataforma.
            </p>
          </section>
        </motion.div>

        {!hasAccepted && (
          <motion.div className={styles.acceptBar}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {error && (
              <div className={styles.errorMsg}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            <button
              className={styles.acceptBtn}
              onClick={handleAccept}
              disabled={accepting}
            >
              {accepting ? (
                <><Loader2 size={18} className={styles.spinner} /> Aceptando...</>
              ) : (
                <><CheckCircle2 size={18} /> Acepto los Términos y Condiciones</>
              )}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
