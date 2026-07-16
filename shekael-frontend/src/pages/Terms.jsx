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
        setTermsVersion('v1.2'); // fallback a hardcode
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
          <p className={styles.lastUpdated}>Versión {termsVersion || 'v1.2'} · Última actualización: {lastUpdated || '12 de Julio de 2026'}</p>
        </motion.div>

        <motion.div
          className={styles.content}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className={styles.summary}>
            <strong>Resumen:</strong> Shekael es una red social con un ecosistema digital propio (MXNe). 
            MXNe es un token digital emitido en la red Stellar (testnet). No está garantizado, asegurado 
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
            <h2>3. Naturaleza de MXNe (Token Digital)</h2>
            <p>
              MXNe es un <strong>token digital</strong> emitido en la red Stellar (actualmente en testnet), 
              con código de activo <strong>MXNe</strong>. A diferencia de sistemas de puntos de lealtad 
              tradicionales, MXNe opera sobre una blockchain pública y puede ser transferido entre 
              usuarios dentro de la Plataforma.
            </p>
            <p className={styles.highlight}>
              <strong>MXNe NO es una moneda de curso legal, no está respaldado por ningún gobierno, 
              no está asegurado por ninguna institución financiera (incluyendo FDIC o IPAB), 
              y no está registrado como valor (security) ante ninguna autoridad regulatoria.</strong>
            </p>
            <p>Al aceptar estos términos, reconoces y aceptas expresamente que:</p>
            <ul>
              <li>MXNe <strong>no tiene un valor garantizado</strong>. Su valor percibido depende exclusivamente 
              de la oferta y demanda dentro del ecosistema Shekael y del mercado secundario voluntario.</li>
              <li>MXNe <strong>no está pegado 1:1 a ninguna moneda fiduciaria</strong>. Cualquier referencia a 
              un valor equivalente en MXN es aspiracional y no constituye una obligación contractual.</li>
              <li>La red Stellar es una red pública descentralizada. Shekael no controla, no garantiza 
              y no se hace responsable por fallas, congestiones, ataques o pérdidas ocurridas en dicha red.</li>
              <li>Eres el <strong>único responsable de tus claves privadas</strong> y de la seguridad de tu 
              cuenta en la red Stellar. Shekael no tiene acceso a tus claves ni puede recuperarlas.</li>
              <li>Los tokens MXNe están sujetos a <strong>volatilidad de mercado</strong>. Su valor puede 
              incrementarse o reducirse drásticamente, incluso hasta cero.</li>
              <li>Shekael <strong>no es una institución financiera</strong>, banco, casa de bolsa, casa de cambio, 
              fondo de inversión, ni proveedor de servicios de activos virtuales regulado.</li>
              <li>Shekael <strong>no otorga créditos, préstamos, rendimientos, intereses ni garantías financieras</strong> 
              de ningún tipo.</li>
              <li>Los saldos de MXNe <strong>no generan intereses ni rendimientos</strong> de ninguna naturaleza.</li>
              <li>MXNe <strong>no puede ser canjeado por efectivo</strong> directamente a través de Shekael. 
              Cualquier intercambio MXNe/MXN deberá ocurrir a través de servicios externos no afiliados 
              y bajo tu propio riesgo.</li>
              <li>En caso de suspensión definitiva de tu cuenta por violación de estos Términos, 
              los MXNe acumulados serán redirigidos al Fondo Regional de Shekael sin compensación.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>4. Descuento Promocional en Comercios</h2>
            <p>
              Shekael puede ofrecer un beneficio promocional de descuento (actualmente <strong>5%</strong> con tope de 
              <strong>50 MXNe por transacción</strong>) en compras realizadas en comercios afiliados mediante pago con 
              QR dentro de la Plataforma. Este descuento:
            </p>
            <ul>
              <li>Es un beneficio promocional, no un derecho adquirido ni un rendimiento financiero.</li>
              <li>Puede ser modificado, suspendido o cancelado en cualquier momento sin responsabilidad para Shekael.</li>
              <li>Está sujeto a disponibilidad de fondos en el Fondo Regional correspondiente.</li>
              <li>No aplica en combinación con otras promociones u ofertas.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>5. Obtención de MXNe</h2>
            <p>Los usuarios pueden obtener MXNe únicamente a través de:</p>
            <ul>
              <li>Participar en actividades promocionales designadas por Shekael (ej. visualización de anuncios).</li>
              <li>Recibir transferencias de MXNe de otros usuarios dentro de la Plataforma.</li>
              <li>Bonos o promociones especiales que Shekael determine unilateralmente.</li>
            </ul>
            <p>
              Shekael se reserva el derecho de ajustar las tasas de obtención de MXNe, los requisitos de participación 
              y las condiciones de las promociones en cualquier momento.
            </p>
          </section>

          <section className={styles.section}>
            <h2>6. Seguridad de tu Billetera Stellar</h2>
            <p>
              Shekael utiliza un sistema de <strong>encriptación por-usuario</strong> para proteger
              las claves privadas de tu billetera Stellar. Cada wallet se encripta con un identificador
              único asociado a tu cuenta, no con una llave maestra compartida.
            </p>
            <p>
              Adicionalmente, se genera un <strong>backup de recuperación</strong> encriptado con una
              llave maestra interna. Este backup solo se utiliza en casos de emergencia o migración
              de base de datos, y nunca está disponible para terceros.
            </p>
            <p>
              <strong>Importante:</strong> Aunque Shekael toma medidas para proteger tus claves,
              <strong>no podemos garantizar la recuperación de wallets</strong> si ocurre un error
              grave en el sistema de encriptación. Eres responsable de mantener tu cuenta segura
              y de no compartir tu información de inicio de sesión.
            </p>
            <p className={styles.highlight}>
              En caso de pérdida de acceso a tu billetera por causas imputables a Shekael,
              haremos todo lo posible por restaurarla, pero <strong>no nos hacemos responsables
              por fondos perdidos debido a errores del sistema</strong>, cambios en las claves de
              encriptación o fallos técnicos fuera de nuestro control.
            </p>
            <p>
              La billetera Stellar opera actualmente en <strong>testnet</strong>. Los MXNe obtenidos
              no tienen valor real y son exclusivamente para fines de prueba y desarrollo.
              Al migrar a mainnet, se implementarán medidas adicionales de seguridad.
            </p>
          </section>

          <section className={styles.section}>
            <h2>7. Libertad de Expresión y Moderación</h2>
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
              mínimas. En caso de suspensión definitiva, los MXNe acumulados serán redirigidos
              al Fondo Regional de Shekael.
            </p>
          </section>

          <section className={styles.section}>
            <h2>8. Propiedad Intelectual</h2>
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
            <h2>9. Privacidad y Datos</h2>
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
            <h2>10. Riesgos Asociados a Tokens Digitales</h2>
            <p className={styles.highlight}>
              Al usar MXNe, reconoces que los tokens digitales y las redes blockchain conllevan 
              riesgos inherentes. Shekael <strong>no garantiza</strong> la estabilidad, disponibilidad 
              o valor futuro de MXNe. Aceptas expresamente que:
            </p>
            <ul>
              <li>El valor de MXNe puede <strong>volverse cero</strong> en cualquier momento debido a 
              condiciones de mercado, cambios regulatorios, fallas técnicas o decisiones de la comunidad.</li>
              <li>Las transacciones en la red Stellar son <strong>irreversibles</strong>. No existe 
              chargeback, reembolso forzoso ni reversión de transacciones confirmadas.</li>
              <li>La red Stellar puede experimentar <strong>congestión, bifurcaciones (forks), 
              ataques de seguridad o fallas</strong> que afecten la disponibilidad o integridad de los tokens.</li>
              <li>El marco regulatorio mexicano e internacional sobre tokens digitales y activos 
              virtuales está en evolución. Cambios regulatorios podrían afectar la operación de MXNe 
              o su clasificación legal.</li>
              <li>No existe <strong>ningún seguro, fondo de garantía ni protección al consumidor</strong> 
              que cubra pérdidas relacionadas con MXNe.</li>
              <li>La pérdida de acceso a tu cuenta de Google o a tus claves Stellar resultará en la 
              <strong>pérdida permanente</strong> del acceso a tus tokens MXNe.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>11. Limitación de Responsabilidad</h2>
            <p className={styles.highlight}>
              Shekael NO será responsable por:
            </p>
            <ul>
              <li>Daños directos, indirectos, incidentales o consecuentes derivados del uso o la imposibilidad de uso de la Plataforma.</li>
              <li>Pérdida de MXNe debido a errores técnicos, fallas de la red Stellar, o acciones de terceros.</li>
              <li>Contenido publicado por usuarios que viole derechos de terceros o leyes aplicables.</li>
              <li>Pérdida de acceso a tu cuenta de Google u otros métodos de autenticación externos.</li>
              <li>Interrupciones del servicio, caídas del servidor, o mantenimiento no programado.</li>
            </ul>
            <p>
              El MXNe se proporciona "tal cual" y "según disponibilidad", sin garantía de ningún tipo. 
              El valor máximo de la responsabilidad acumulada de Shekael hacia cualquier usuario no excederá 
              el equivalente en MXNe que el usuario haya obtenido en los últimos 12 meses.
            </p>
          </section>

          <section className={styles.section}>
            <h2>12. Terminación</h2>
            <p>
              Puedes dejar de usar Shekael en cualquier momento. Shekael puede suspender o terminar tu acceso 
              si violas estos Términos. Al terminar tu relación con Shekael:
            </p>
            <ul>
              <li>Tu acceso a la Plataforma será revocado.</li>
              <li>Los MXNe en tu cuenta serán redirigidos al Fondo Regional.</li>
              <li>Shekael no tiene obligación de mantener, devolver ni compensar los MXNe acumulados.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>13. Ley Aplicable y Jurisdicción</h2>
            <p>
              Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia 
 relacionada con estos Términos será sometida a la jurisdicción de los tribunales competentes de la 
              Ciudad de México, renunciando a cualquier otro fuero que pudiera corresponder.
            </p>
          </section>

          <section className={styles.section}>
            <h2>14. Contacto</h2>
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
