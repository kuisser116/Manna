import React, { useState } from 'react';
import { Shield, Key, Smartphone, AlertTriangle, CheckCircle, ChevronRight, ChevronLeft, Download, FileText } from 'lucide-react';
import styles from './SecurityTutorial.module.css';

const STEPS = [
    {
        icon: Shield,
        title: 'Protege tu Cuenta',
        description: 'Antes de usar Shekael, completa estos 3 pasos. Sin ellos, NO podrás recuperar tu dinero si pierdes tu teléfono.',
        highlight: 'Shekael NO puede recuperar tu cuenta por ti.',
    },
    {
        icon: Key,
        title: 'Paso 1: Tu Clave Secreta',
        description: 'Tu cuenta tiene una clave secreta única (empieza con S...). Esta clave ES tu wallet.',
        highlight: 'Sin esta clave, nadie puede recuperar tu dinero. Ni siquiera Shekael.',
        action: 'Ir a guardar mi clave',
    },
    {
        icon: Smartphone,
        title: 'Paso 2: Tu PIN de Seguridad',
        description: 'Crea un PIN de 6 dígitos para desbloquear la app. Este PIN protege tu app pero NO recupera tu cuenta.',
        highlight: 'Si olvidas tu PIN, necesitarás tu clave secreta (Paso 1) para crear uno nuevo.',
    },
    {
        icon: AlertTriangle,
        title: 'Paso 3: Respaldo en Papel',
        description: 'Escribe tu clave secreta en papel físico. Guárdala en un lugar seguro de tu casa.',
        highlight: 'NO la guardes en fotos. NO en la nube. SOLO papel físico.',
        action: 'Descargar guía de respaldo',
    },
    {
        icon: CheckCircle,
        title: 'Listo para Empezar',
        description: 'Has completado la configuración de seguridad. Tu dinero está protegido. Recuerda: tu clave secreta en papel es tu único respaldo.',
        highlight: null,
    },
];

export default function SecurityTutorial({ onComplete }) {
    const [currentStep, setCurrentStep] = useState(0);

    const step = STEPS[currentStep];
    const Icon = step.icon;
    const isLast = currentStep === STEPS.length - 1;
    const isFirst = currentStep === 0;

    const handleNext = () => {
        if (isLast) {
            localStorage.setItem('shekael_security_tutorial_seen', 'true');
            onComplete?.();
        } else {
            setCurrentStep(c => c + 1);
        }
    };

    const handleBack = () => {
        setCurrentStep(c => Math.max(0, c - 1));
    };

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
            </div>
        </div>
    );
}
