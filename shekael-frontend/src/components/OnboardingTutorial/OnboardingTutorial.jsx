import React, { useState } from 'react';
import { Shield, Key, Smartphone, AlertTriangle, CheckCircle, ChevronRight, ChevronLeft, Download } from 'lucide-react';
import styles from './OnboardingTutorial.module.css';

const STEPS = [
    {
        icon: Shield,
        title: 'Bienvenido a Shekael',
        description: 'Tu dinero, tu control. Antes de empezar, necesitas completar 3 pasos de seguridad.',
        highlight: 'Sin estos pasos, NO podrás recuperar tu cuenta si pierdes tu teléfono.',
    },
    {
        icon: Key,
        title: 'Paso 1: Tu Clave Secreta',
        description: 'Shekael te ha generado una clave secreta única (empieza con S...). Esta clave ES tu cuenta.',
        highlight: 'Sin esta clave, nadie —ni Shekael— puede recuperar tu dinero.',
        action: 'Ir a guardar mi clave',
    },
    {
        icon: Smartphone,
        title: 'Paso 2: Tu PIN de Seguridad',
        description: 'Crea un PIN de 6 dígitos para proteger tu app. Este PIN NO recupera tu cuenta, solo desbloquea la app.',
        highlight: 'Si olvidas tu PIN, necesitarás tu clave secreta (Paso 1) para restablecerlo.',
    },
    {
        icon: AlertTriangle,
        title: 'Paso 3: Respaldo en Papel',
        description: 'Escribe tu clave secreta en papel y guárdala en un lugar seguro. NO en fotos. NO en la nube.',
        highlight: 'Shekael NO puede recuperar tu cuenta. El respaldo es TU responsabilidad.',
        action: 'Descargar guía de respaldo',
    },
    {
        icon: CheckCircle,
        title: 'Listo para empezar',
        description: 'Has completado la configuración de seguridad. Recuerda: tu clave secreta es lo único que necesitas si pierdes tu teléfono.',
        highlight: null,
    },
];

export default function OnboardingTutorial({ onComplete, onSkip }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    const step = STEPS[currentStep];
    const Icon = step.icon;
    const isLast = currentStep === STEPS.length - 1;
    const isFirst = currentStep === 0;

    const handleNext = () => {
        if (isLast) {
            onComplete?.();
        } else {
            setCurrentStep(c => c + 1);
        }
    };

    const handleBack = () => {
        setCurrentStep(c => Math.max(0, c - 1));
    };

    if (dismissed) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                {/* Progress */}
                <div className={styles.progressBar}>
                    {STEPS.map((_, i) => (
                        <div key={i} className={`${styles.progressDot} ${i <= currentStep ? styles.progressActive : ''}`} />
                    ))}
                </div>

                {/* Content */}
                <div className={styles.content}>
                    <Icon size={48} className={styles.stepIcon} />
                    <h2 className={styles.title}>{step.title}</h2>
                    <p className={styles.description}>{step.description}</p>
                    
                    {step.highlight && (
                        <div className={styles.highlightBox}>
                            <AlertTriangle size={16} />
                            <span>{step.highlight}</span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className={styles.actions}>
                    {!isFirst && (
                        <button className={styles.secondaryBtn} onClick={handleBack}>
                            <ChevronLeft size={16} /> Anterior
                        </button>
                    )}
                    
                    <button className={styles.primaryBtn} onClick={handleNext}>
                        {isLast ? 'Comenzar' : 'Siguiente'} <ChevronRight size={16} />
                    </button>
                </div>

                {/* Skip */}
                {!isLast && (
                    <button className={styles.skipBtn} onClick={() => setDismissed(true)}>
                        Omitir tutorial
                    </button>
                )}
            </div>
        </div>
    );
}
