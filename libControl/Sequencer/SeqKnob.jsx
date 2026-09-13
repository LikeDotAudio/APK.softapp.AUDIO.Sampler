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

// Sequencer knob — a label/readout wrapper around the SHARED window.Knob
// (libControl/Knobs/Knob). Face, caps, drag/wheel/ALT-to-default behavior all
// come from the shared component, so a style change there restyles this too.
//
// The drag overlay is hung on the WRAPPER rather than inside the knob: the
// gesture belongs to a third-party component and this is the nearest element
// that both sees the press and knows what the knob is called. The hook watches
// the window for the release, so nothing here has to chase the pointer.
window.SeqKnob = ({ value, min, max, onChange, label, display, size = 60, color = 'var(--accent)', flash, title, step = 1, def }) => {
    const readout = window.useOaReadout({
        label, color,
        display: display !== undefined ? display : Math.round(value),
        pct: ((value - min) / ((max - min) || 1)) * 100,
    });
    return (
        <div title={title}
             onPointerDown={readout.begin}
             style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', filter: flash ? 'drop-shadow(0 0 7px rgba(var(--accent-rgb),0.95))' : 'none', transition: 'filter 0.08s' }}>
            <window.Knob
                value={value}
                onChange={(v) => onChange(Math.round(Math.max(min, Math.min(max, v))))}
                size={size}
                config={{ min, max, step, value_default: def, arc_width: 3, indicator_color: color }}
            />
            <span style={{ fontSize: '10px', color, fontWeight: 'bold', lineHeight: 1 }}>{display !== undefined ? display : Math.round(value)}</span>
            <span style={{ fontSize: '8px', color: '#888', letterSpacing: '0.5px' }}>{label}</span>
        </div>
    );
};
