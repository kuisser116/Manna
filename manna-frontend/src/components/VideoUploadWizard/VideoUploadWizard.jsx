import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, Film, CheckCircle2, Eye,
    Upload, X, Tag, ChevronRight, ChevronLeft,
    Globe, Lock, CalendarClock, Image as ImageIcon
} from 'lucide-react';
import styles from './VideoUploadWizard.module.css';

const STEPS = [
    { id: 1, label: 'Detalles', icon: FileText },
    { id: 2, label: 'Elementos', icon: Film },
    { id: 3, label: 'Comprobación', icon: CheckCircle2 },
    { id: 4, label: 'Visibilidad', icon: Eye },
];

const VISIBILITY_OPTIONS = [
    {
        value: 'private',
        label: 'Privado',
        icon: Lock,
        desc: 'Solo tú puedes ver este video',
    },
    {
        value: 'public',
        label: 'Público',
        icon: Globe,
        desc: 'Todo el mundo puede ver el video',
    },
];

const DEFAULT_FORM = {
    title: '',
    description: '',
    tags: '',
    thumbnailFile: null,
    thumbnailPreview: null,
    videoFile: null,
    videoPreview: null,
    visibility: 'public',
    schedule: false,
    scheduledAt: '',
};

/**
 * VideoUploadWizard
 * Props:
 *   onPublish({ videoFile, thumbnailFile, title, description, tags, visibility, scheduledAt })
 *   onCancel()
 */
export default function VideoUploadWizard({ onPublish, onCancel }) {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(DEFAULT_FORM);
    const videoInputRef = useRef(null);
    const thumbInputRef = useRef(null);

    // ── helpers ──────────────────────────────────────────────
    const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

    const handleVideoSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        set('videoFile', file);
        set('videoPreview', URL.createObjectURL(file));
    };

    const handleThumbSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        set('thumbnailFile', file);
        set('thumbnailPreview', URL.createObjectURL(file));
    };

    const removeVideo = () => {
        set('videoFile', null);
        set('videoPreview', null);
        if (videoInputRef.current) videoInputRef.current.value = '';
    };

    const removeThumb = () => {
        set('thumbnailFile', null);
        set('thumbnailPreview', null);
        if (thumbInputRef.current) thumbInputRef.current.value = '';
    };

    const canGoNext = () => {
        if (step === 1) return form.title.trim().length > 0;
        if (step === 2) return !!form.videoFile;
        return true;
    };

    const handlePublish = () => {
        onPublish({
            videoFile: form.videoFile,
            thumbnailFile: form.thumbnailFile,
            title: form.title.trim(),
            description: form.description.trim(),
            tags: form.tags.trim(),
            visibility: form.visibility,
            scheduledAt: form.schedule && form.visibility === 'public' ? form.scheduledAt : null,
        });
    };

    // ── step panels ──────────────────────────────────────────
    const renderStep = () => {
        switch (step) {
            case 1: return <StepDetalles form={form} set={set} thumbInputRef={thumbInputRef} onThumbSelect={handleThumbSelect} onRemoveThumb={removeThumb} />;
            case 2: return <StepElementos form={form} videoInputRef={videoInputRef} onVideoSelect={handleVideoSelect} onRemoveVideo={removeVideo} />;
            case 3: return <StepComprobacion form={form} />;
            case 4: return <StepVisibilidad form={form} set={set} />;
            default: return null;
        }
    };

    return (
        <div className={styles.wizard}>
            {/* Progress bar */}
            <div className={styles.stepper}>
                {STEPS.map((s, i) => {
                    const done = step > s.id;
                    const active = step === s.id;
                    const Icon = s.icon;
                    return (
                        <div key={s.id} className={styles.stepItem}>
                            <div className={`${styles.stepCircle} ${active ? styles.stepActive : ''} ${done ? styles.stepDone : ''}`}>
                                {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                            </div>
                            <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ''}`}>{s.label}</span>
                            {i < STEPS.length - 1 && <div className={`${styles.stepLine} ${done ? styles.stepLineDone : ''}`} />}
                        </div>
                    );
                })}
            </div>

            {/* Panel */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    className={styles.panel}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.2 }}
                >
                    {renderStep()}
                </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className={styles.nav}>
                <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={step === 1 ? onCancel : () => setStep(s => s - 1)}
                >
                    <ChevronLeft size={16} />
                    {step === 1 ? 'Cancelar' : 'Atrás'}
                </button>

                {step < 4 ? (
                    <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={() => setStep(s => s + 1)}
                        disabled={!canGoNext()}
                    >
                        Siguiente
                        <ChevronRight size={16} />
                    </button>
                ) : (
                    <button
                        type="button"
                        className={styles.btnPublish}
                        onClick={handlePublish}
                        disabled={!form.videoFile || !form.title.trim()}
                    >
                        Publicar
                        <CheckCircle2 size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Step 1: Detalles ─────────────────────────────────────────
function StepDetalles({ form, set, thumbInputRef, onThumbSelect, onRemoveThumb }) {
    return (
        <div className={styles.stepContent}>
            <h3 className={styles.stepTitle}>Detalles</h3>
            <p className={styles.stepSub}>Añade un título y descripción que enganchen a tu audiencia.</p>

            <label className={styles.fieldLabel}>Título <span className={styles.required}>*</span></label>
            <input
                className={styles.input}
                type="text"
                maxLength={100}
                placeholder="Dale un título a tu video"
                value={form.title}
                onChange={e => set('title', e.target.value)}
            />
            <div className={styles.charHint}>{form.title.length}/100</div>

            <label className={styles.fieldLabel}>Descripción</label>
            <textarea
                className={styles.textarea}
                rows={4}
                maxLength={500}
                placeholder="Cuéntale al mundo de qué trata..."
                value={form.description}
                onChange={e => set('description', e.target.value)}
            />
            <div className={styles.charHint}>{form.description.length}/500</div>

            <label className={styles.fieldLabel}>
                <Tag size={14} style={{ marginRight: 4 }} />
                Etiquetas
            </label>
            <input
                className={styles.input}
                type="text"
                placeholder="musica, arte, aseria  (separadas por coma)"
                value={form.tags}
                onChange={e => set('tags', e.target.value)}
            />

            <label className={styles.fieldLabel}>
                <ImageIcon size={14} style={{ marginRight: 4 }} />
                Miniatura (opcional)
            </label>
            <p className={styles.fieldHint}>Si no subes una, se generará automáticamente del video</p>
            {form.thumbnailPreview ? (
                <div className={styles.thumbPreviewWrap}>
                    <img src={form.thumbnailPreview} alt="Miniatura" className={styles.thumbPreview} />
                    <button type="button" className={styles.removeBtn} onClick={onRemoveThumb}>
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <label className={styles.uploadZone}>
                    <ImageIcon size={22} />
                    <span>Sube una miniatura (opcional)</span>
                    <span className={styles.uploadHint}>JPG, PNG o WebP · Recomendado 1280×720<br/>Si no subes, se generará automáticamente del segundo 3 del video</span>
                    <input ref={thumbInputRef} type="file" accept="image/*" onChange={onThumbSelect} hidden />
                </label>
            )}
        </div>
    );
}

// ── Step 2: Elementos del video ──────────────────────────────
function StepElementos({ form, videoInputRef, onVideoSelect, onRemoveVideo }) {
    const sizeMB = form.videoFile ? (form.videoFile.size / (1024 * 1024)).toFixed(1) : 0;

    return (
        <div className={styles.stepContent}>
            <h3 className={styles.stepTitle}>Elementos del video</h3>
            <p className={styles.stepSub}>Selecciona el archivo de video que quieres subir.</p>

            {form.videoPreview ? (
                <div className={styles.videoPreviewWrap}>
                    <video src={form.videoPreview} className={styles.videoPreview} controls />
                    <div className={styles.videoMeta}>
                        <span className={styles.videoName}>{form.videoFile?.name}</span>
                        <span className={styles.videoBadge}>{sizeMB} MB</span>
                    </div>
                    <button type="button" className={styles.removeBtn} onClick={onRemoveVideo}>
                        <X size={14} /> Cambiar video
                    </button>
                </div>
            ) : (
                <label className={styles.uploadZone} style={{ minHeight: '180px' }}>
                    <Upload size={28} />
                    <span>Haz clic o arrastra tu video aquí</span>
                    <span className={styles.uploadHint}>MP4 o WebM · Máximo 50 MB</span>
                    <span className={styles.uploadBadge}>Streaming Livepeer · Almacenaje R2</span>
                    <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/mp4,video/webm"
                        onChange={onVideoSelect}
                        hidden
                    />
                </label>
            )}
        </div>
    );
}

// ── Step 3: Comprobación ─────────────────────────────────────
function StepComprobacion({ form }) {
    const checks = [
        { label: 'Título', ok: form.title.trim().length > 0, value: form.title || '—' },
        { label: 'Video', ok: !!form.videoFile, value: form.videoFile?.name || '—' },
        { label: 'Miniatura', ok: !!form.thumbnailFile, value: form.thumbnailFile?.name || 'Se generará automáticamente' },
        { label: 'Etiquetas', ok: form.tags.trim().length > 0, value: form.tags || 'Sin etiquetas (opcional)' },
    ];

    return (
        <div className={styles.stepContent}>
            <h3 className={styles.stepTitle}>Comprobación inicial</h3>
            <p className={styles.stepSub}>Revisa los detalles antes de continuar.</p>

            <div className={styles.checkList}>
                {checks.map(c => (
                    <div key={c.label} className={`${styles.checkRow} ${c.ok ? styles.checkOk : styles.checkWarn}`}>
                        <CheckCircle2 size={16} className={styles.checkIcon} />
                        <div>
                            <span className={styles.checkLabel}>{c.label}</span>
                            <span className={styles.checkValue}>{c.value}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.infoBox}>
                🔒 Al publicar, el video se guarda en <strong>R2</strong> y se registra su autoría en <strong>Stellar</strong>.
                Cuando supere las 50 vistas se transcodificará automáticamente vía <strong>Livepeer</strong> (HLS).
            </div>
        </div>
    );
}

// ── Step 4: Visibilidad ──────────────────────────────────────
function StepVisibilidad({ form, set }) {
    return (
        <div className={styles.stepContent}>
            <h3 className={styles.stepTitle}>Visibilidad</h3>
            <p className={styles.stepSub}>Elige cuándo se publica el video y quién puede verlo.</p>

            <div className={styles.visibilityGroup}>
                {VISIBILITY_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const active = form.visibility === opt.value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            className={`${styles.visCard} ${active ? styles.visCardActive : ''}`}
                            onClick={() => set('visibility', opt.value)}
                        >
                            <Icon size={18} className={styles.visIcon} />
                            <div>
                                <div className={styles.visLabel}>{opt.label}</div>
                                <div className={styles.visDesc}>{opt.desc}</div>
                            </div>
                            <div className={`${styles.visRadio} ${active ? styles.visRadioActive : ''}`} />
                        </button>
                    );
                })}
            </div>

            {form.visibility === 'public' && (
                <div className={styles.scheduleWrap}>
                    <label className={styles.scheduleToggle}>
                        <input
                            type="checkbox"
                            checked={form.schedule}
                            onChange={e => set('schedule', e.target.checked)}
                        />
                        <CalendarClock size={15} />
                        Programar publicación
                    </label>

                    {form.schedule && (
                        <input
                            className={styles.input}
                            type="datetime-local"
                            value={form.scheduledAt}
                            onChange={e => set('scheduledAt', e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
