import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import styles from '../styles/pages/Terms.module.css';

export default function Terms() {
    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <motion.div
                    className={styles.header}
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <Link to="/" className={styles.backLink}>
                        <ArrowLeft size={20} />
                        <span>Volver</span>
                    </Link>
                    <h1 className={styles.title}>Términos de Servicio y Aviso de Privacidad</h1>
                    <p className={styles.lastUpdated}>Última actualización: Marzo 2026</p>
                </motion.div>

                <motion.div
                    className={styles.content}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    <section className={styles.section}>
                        <h2>1. Depósito de Confianza y Participación en la Red</h2>
                        <p>
                            Al registrarte en Aseria, tu monedero custodial recibirá un fondeo inicial. El usuario comprende y
                            acepta que los <strong>0.5 XLM</strong> proporcionados al inicio no constituyen una inversión,
                            un activo financiero, ni una compra. Este monto funciona exclusivamente como un <em>"depósito de buena fe"</em> destinado
                            a habilitar la capacidad de interacción dentro de la red descentralizada y mantener la integridad de la comunidad.
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>2. Política de Tolerancia Cero y Moderación de la Comunidad</h2>
                        <p>
                            Aseria se reserva el derecho unilateral e inapelable de suspender, limitar o eliminar
                            permanentemente el acceso a cualquier cuenta que infrinja las Normas de la Comunidad.
                            Las infracciones incluyen, de manera enunciativa mas no limitativa:
                        </p>
                        <ul>
                            <li>Generación de Spam o manipulación automatizada de la red (Ataques Sybil).</li>
                            <li>Difusión de discursos de odio, discriminación, acoso o violencia.</li>
                            <li>Plagio o violación de derechos de propiedad intelectual de terceros.</li>
                        </ul>
                        <p className={styles.highlight}>
                            <strong>En caso de suspensión definitiva por violación a estas normas, el usuario acepta de manera irrevocable que el depósito de confianza inicial y los balances asociados a actividades ilícitas serán retenidos y redirigidos en su totalidad al "Fondo Regional" (fondo de donaciones sociales de Aseria), como medida de reparación a la red.</strong>
                        </p>
                    </section>

                    <section className={styles.section}>
                        <h2>3. Naturaleza Tecnológica del Servicio (Exención de Responsabilidad Web3)</h2>
                        <p>
                            Aseria opera como una interfaz de software (dApp) que facilita la interacción con redes blockchain
                            descentralizadas (como Stellar e IPFS). Por consiguiente, el usuario reconoce que:
                        </p>
                        <ul>
                            <li>Aseria no es una institución bancaria, fiduciaria ni proveedora de servicios financieros tradicionales.</li>
                            <li>Aseria no asume responsabilidad por pérdidas derivadas de fallas, bifurcaciones (forks) o caídas en la red subyacente de Stellar.</li>
                            <li>El acceso a los fondos alojados depende de la autenticación de terceros (ej. Google). Si el usuario pierde el acceso a dicha cuenta externa, Aseria carece de la capacidad técnica y legal para recuperar o reponer los activos digitales.</li>
                        </ul>
                    </section>

                    <section className={styles.section}>
                        <h2>4. Privacidad y Permanencia de Datos (Almacenamiento Descentralizado)</h2>
                        <p>
                            La identidad del usuario se vincula a su proveedor de autenticación. Aseria resguarda las llaves encriptadas
                            en bases de datos seguras; sin embargo, el contenido público generado se almacena en IPFS (InterPlanetary File System).
                            Al utilizar la plataforma, el usuario acepta y comprende la naturaleza inmutable de la tecnología blockchain y las redes descentralizadas, reconociendo que el contenido publicado puede no ser susceptible de eliminación total una vez emitido en dichos nodos públicos.
                        </p>
                    </section>
                </motion.div>
            </div>
        </div>
    );
}
