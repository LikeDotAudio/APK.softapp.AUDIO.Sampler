// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
// https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
//
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// Every visual representation in this project is an HOMAGE to classic hardware.
// There is no affiliation with, or endorsement by, any of the original designers
// or manufacturers; their layouts appear here only because they are familiar
// interfaces, and every name they are known by remains the property of its owner.
// ─────────────────────────────────────────────────────────────────────────────

// Extracted from index.html: stand-in Knob and OcaButton primitives.
        // --- Mock Components for Knob and OcaButton ---
        
        window.Knob = function Knob({ value, onChange, size, config }) {
            const min = config?.min ?? 0;
            const max = config?.max ?? 100;
            const step = config?.step ?? 1;
            const sz = size || 60;
            
            // A simple range input styled to look reasonably compact
            return (
                <input 
                    type="range" 
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(e) => onChange(Number(e.target.value))}
                    style={{ 
                        width: `${sz}px`, 
                        accentColor: config?.indicator_color || 'var(--accent)',
                        margin: '5px 0'
                    }}
                />
            );
        };

        window.OcaButton = function OcaButton({ label, onClick, title, disabled, color, style }) {
            const defaultStyle = {
                backgroundColor: color || '#333',
                color: '#fff',
                border: 'none',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                ...style
            };
            return (
                <button onClick={onClick} title={title} disabled={disabled} style={defaultStyle}>
                    {label}
                </button>
            );
        };
