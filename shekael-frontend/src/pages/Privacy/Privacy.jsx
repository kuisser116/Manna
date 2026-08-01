import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import styles from './Privacy.module.css';

export default function Privacy() {
  return (
    <div className={styles.container}>
      <Link to="/" className={styles.backLink}>
        <ArrowLeft size={16} /> Volver a Shekael
      </Link>

      <h1 className={styles.title}>Política de Privacidad</h1>
      <p className={styles.updated}>Última actualización: 1 de Agosto de 2026</p>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Introducción</h2>
        <p className={styles.paragraph}>
          En Shekael nos tomamos tu privacidad en serio. Esta política explica qué información
          recopilamos, cómo la usamos y qué derechos tienes sobre ella, en cumplimiento con la
          Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) de México.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Información que recopilamos</h2>
        <ul className={styles.list}>
          <li><strong>Cuenta:</strong> nombre, correo electrónico y foto de perfil (vía Google Sign-In).</li>
          <li><strong>Contenido:</strong> publicaciones, comentarios, mensajes de chat cifrados y archivos que subas.</li>
          <li><strong>Wallet:</strong> la clave pública de tu wallet Stellar (las claves privadas se cifran con tu PIN y nunca salen de tu dispositivo).</li>
          <li><strong>Uso:</strong> interacciones con publicaciones, tiempo de visualización, preferencias de contenido.</li>
          <li><strong>Técnica:</strong> dirección IP, tipo de navegador/dispositivo, ubicación aproximada (solo para funciones de comercios cercanos).</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Cómo usamos tu información</h2>
        <ul className={styles.list}>
          <li>Para operar la plataforma: mostrarte el feed, notificaciones, chat y wallet.</li>
          <li>Para mejorar el algoritmo de contenido que ves.</li>
          <li>Para mostrarte publicidad relevante y medir su efectividad.</li>
          <li>Para cumplir obligaciones legales y prevenir fraude o abuso.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Publicidad</h2>
        <p className={styles.paragraph}>
          Shekael muestra anuncios a través de proveedores de publicidad (incluidos Google AdSense
          y similares). Estos proveedores pueden usar cookies o tecnologías similares para mostrar
          anuncios basados en tus intereses. Puedes configurar tus preferencias de anuncios en
          <a href="https://adssettings.google.com" target="_blank" rel="noreferrer"> adssettings.google.com</a>.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Seguridad de tus datos</h2>
        <p className={styles.paragraph}>
          Tus mensajes de chat están cifrados de extremo a extremo (E2EE). Tu clave de recuperación
          se cifra con tu PIN y solo tú puedes descifrarla. Usamos cifrado en tránsito (HTTPS/TLS)
          y aplicamos controles de acceso estrictos a los datos.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>6. Compartición con terceros</h2>
        <p className={styles.paragraph}>
          No vendemos tus datos personales. Solo compartimos información con:
        </p>
        <ul className={styles.list}>
          <li>Proveedores de servicios que nos ayudan a operar (hosting, almacenamiento, pagos).</li>
          <li>Proveedores de publicidad, de forma agregada o anónima.</li>
          <li>Autoridades, cuando la ley lo exige.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>7. Tus derechos (ARCO)</h2>
        <p className={styles.paragraph}>
          Puedes solicitar el Acceso, Rectificación, Cancelación u Oposición (derechos ARCO) de tus
          datos personales en cualquier momento contactándonos. También puedes solicitar la
          eliminación de tu cuenta y sus datos.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>8. Retención de datos</h2>
        <p className={styles.paragraph}>
          Conservamos tus datos mientras tu cuenta esté activa. Al eliminar tu cuenta, tus datos
          personales se borran (los registros de aceptación de términos se conservan por razones
          legales, con valor probatorio).
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>9. Menores de edad</h2>
        <p className={styles.paragraph}>
          Shekael está dirigida a mayores de 13 años. No recopilamos intencionalmente datos de
          menores sin consentimiento parental.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>10. Contacto</h2>
        <div className={styles.contact}>
          <p className={styles.paragraph}>
            <strong>Shekael</strong><br />
            Ciudad de México, México<br />
            <a href="mailto:soporte@shekael.com">soporte@shekael.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
