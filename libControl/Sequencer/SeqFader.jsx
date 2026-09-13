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

window.SeqFader = ({ activeFader }) => {
    if (!activeFader) return null;

    return (
        <div style={{ position: 'fixed', zIndex: 10000, pointerEvents: 'none',
            left: Math.min(activeFader.x + 16, window.innerWidth - 90),
            top: Math.min(Math.max(activeFader.y - 130, 8), window.innerHeight - 260),
            width: '78px', background: '#1c1c1c', border: '1px solid var(--accent)', borderRadius: '6px',
            padding: '10px', boxShadow: '0 8px 30px rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--accent)', lineHeight: 1 }}>{activeFader.vel}</div>
            <div style={{ position: 'relative', width: '30px', height: '200px', background: '#0a0a0a', border: '1px solid #444', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${activeFader.vel}%`, background: 'linear-gradient(to top, var(--accent-s25), var(--accent))' }} />
                <div style={{ position: 'absolute', left: '-2px', right: '-2px', bottom: `calc(${activeFader.vel}% - 2px)`, height: '4px', background: '#fff', borderRadius: '1px' }} />
            </div>
            <div style={{ fontSize: '9px', color: '#888', letterSpacing: '0.5px' }}>VELOCITY</div>
        </div>
    );
};
