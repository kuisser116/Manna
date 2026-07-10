import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import styles from '../styles/pages/Terms.module.css';
import useStore from '../store';

const LAST_UPDATED = '10 de Julio de 2026';

export default function Terms() {
  const navigate = useNavigate();
  const { user, token, acceptTerms } = useStore();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  const hasAccepted = user?.terms_accepted_at;

  const handleAccept = async () => {
    setAccepting(true);
    setError('');
    try {
      await acceptTerms();
      setAccepted(true);
      setTimeout(() => navigate('/feed'), 500);
    } catch (err) {
      setError(err.message || 'Error al aceptar términos');
    } finally {
      setAccepting(false);
    }
  };

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
          {hasAccepted ? (
            <Link to="/feed" className={styles.backLink}>
              <ArrowLeft size={20} />
              <span>Volver al inicio</span>
            </Link>
          ) : (
            <Link to="/" className={styles.backLink}>
              <ArrowLeft size={20} />
              <span>Volver</span>
            </Link>
          )}
          <h1 className={styles.title}>Términos y Condiciones de Shekael</h1>
          <p className={styles.lastUpdated}>Última actualización: {LAST_UPDATED}</p>
        </motion.div>

        <motion.div
          className={styles.content}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className={styles.summary}>
            <strong>Resumen:</strong> Shekael es una red social que ofrece un sistema de puntos de lealtad (MXNe). 
            MXNe no es dinero real, no tiene valor fuera de la app, y no puede ser canjeado por efectivo. 
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
            <h2>3. Naturaleza de MXNe (Puntos de Lealtad)</h2>
            <p className={styles.highlight}>
              <strong>MXNe NO es dinero real, una criptomoneda, un activo financiero, ni una inversión.</strong>
            </p>
            <p>MXNe es un sistema de puntos de lealtad virtual que funciona exclusivamente dentro del ecosistema Shekael. Al aceptar estos términos, reconoces y aceptas que:</p>
            <ul>
              <li>MXNe <strong>no tiene valor monetario</strong> fuera de la Plataforma.</li>
              <li>MXNe <strong>no puede ser canjeado por efectivo, pesos mexicanos, ni ninguna moneda fiduciaria</strong>.</li>
              <li>MXNe <strong>no puede ser transferido a cuentas bancarias, tarjetas, ni ningún sistema de pago externo</strong>.</li>
              <li>MXNe solo puede ser utilizado para pagar productos y servicios en comercios afiliados que acepten MXNe como método de pago.</li>
              <li>Shekael no es una institución financiera, banco, casa de cambio, ni proveedor de servicios de pago electrónico regulado.</li>
              <li>Shekael no otorga créditos, préstamos, ni garantías financieras de ningún tipo.</li>
              <li>Los saldos de MXNe no generan intereses, rendimientos, ni ganancias de capital.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>4. Descuento del 5% en Comercios</h2>
            <p>
              Shekael ofrece un beneficio promocional de <strong>5% de descuento</strong> (con tope de $50 MXNe por transacción) 
              en compras realizadas en comercios afiliados mediante pago con QR. Este descuento:
            </p>
            <ul>
              <li>Es un beneficio promocional, no un derecho adquirido.</li>
              <li>Puede ser modificado, suspendido o cancelado en cualquier momento sin responsabilidad para Shekael.</li>
              <li>Está sujeto a disponibilidad del Fondo Regional correspondiente.</li>
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
            <h2>6. Libertad de Expresión y Moderación</h2>
            <p>
              Shekael cree en la <strong>libertad de expresión como principio fundamental</strong>. 
              No censuramos temas sensibles, controversiales o incómodos. Creemos que la conciencia 
              se construye hablando, no callando. Todo contenido que no sea ilegal tiene espacio 
              en Shekael, y la comunidad decide su valor con likes, supports y comentarios.
            </p>
            <p>Sin embargo, para proteger a la comunidad, está prohibido:</p>
            <ul>
              <li>Contenido ilegal (abuso infantil, trata de personas, venta de drogas/armas).</li>
              <li>Spam o publicación automatizada que degrade la experiencia de todos.</li>
              <li>Estafas o esquemas fraudulentos (Ponzi, pirámides).</li>
            </ul>
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
            <h2>7. Propiedad Intelectual</h2>
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
            <h2>8. Privacidad y Datos</h2>
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
            <h2>9. Limitación de Responsabilidad</h2>
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
            <h2>10. Terminación</h2>
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
            <h2>11. Ley Aplicable y Jurisdicción</h2>
            <p>
              Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia 
 relacionada con estos Términos será sometida a la jurisdicción de los tribunales competentes de la 
              Ciudad de México, renunciando a cualquier otro fuero que pudiera corresponder.
            </p>
          </section>

          <section className={styles.section}>
            <h2>12. Contacto</h2>
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
