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

// Shared footprint for every button in the app footer (Rec/Play/TAP/Config/
// Save Pattern/Sets/MIDI) so the row reads as one evenly sized set of controls.
window.OA_FOOTER_BTN = { padding: '5px 12px', fontSize: '12px', fontWeight: 'bold', borderRadius: '3px' };

// Sequencer button — the SHARED window.OcaButton (libControl/buttons/Button)
// compacted for the toolbar. Style tweaks to OcaButton flow in here.
window.SeqButton = ({ label, onClick, active, color = '#333', activeColor = 'var(--accent)', textColor, title, disabled, style }) => (
    <window.OcaButton
        label={label}
        onClick={onClick}
        title={title}
        disabled={disabled}
        color={active ? activeColor : color}
        style={Object.assign(
            { padding: '4px 9px', fontSize: '12px', borderRadius: '3px', border: '1px solid #444', boxShadow: 'none', color: textColor || (active ? '#111' : '#ccc') },
            style
        )}
    />
);
