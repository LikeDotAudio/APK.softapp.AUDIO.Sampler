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

// Dedicated row component for Render loops/stems and clear pattern buttons
window.SeqRenderRow = ({ rendering, renderLoop, renderStems }) => {
    const SeqButton = window.SeqButton;
    const [renderMode, setRenderMode] = React.useState('mix'); // 'mix' | 'stems'

    const handleRender = (loops) => {
        if (renderMode === 'stems') {
            if (renderStems) renderStems(loops);
        } else {
            if (renderLoop) renderLoop(loops);
        }
    };

    return (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ccc', cursor: 'pointer', userSelect: 'none', background: '#222', padding: '5px 10px', borderRadius: '4px', border: '1px solid #444' }}>
                <input
                    type="checkbox"
                    checked={renderMode === 'stems'}
                    onChange={(e) => setRenderMode(e.target.checked ? 'stems' : 'mix')}
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 'bold', color: renderMode === 'stems' ? 'var(--accent)' : '#aaa' }}>
                    Render Stems (ZIP)
                </span>
            </label>

            <SeqButton
                label={rendering ? '…rendering' : (renderMode === 'stems' ? '📦 RENDER 1 LOOP STEMS' : '⭳ RENDER 1 LOOP MIX')}
                onClick={() => handleRender(1)}
                disabled={rendering}
                color={renderMode === 'stems' ? '#00695c' : '#7b1fa2'} textColor="#fff"
                title={renderMode === 'stems' ? "Render 1 pass of stems to a ZIP archive" : "Render 1 pass of the mix to a WAV file"}
                style={{ padding: '6px 12px', border: 'none', cursor: rendering ? 'wait' : 'pointer' }}
            />
            <SeqButton
                label={rendering ? '…rendering' : (renderMode === 'stems' ? '📦 RENDER 8 LOOPS STEMS' : '⭳ RENDER 8 LOOPS MIX')}
                onClick={() => handleRender(8)}
                disabled={rendering}
                color={renderMode === 'stems' ? '#004d40' : '#4a148c'} textColor="#fff"
                title={renderMode === 'stems' ? "Render 8 passes of stems to a ZIP archive" : "Render 8 passes of the mix to a WAV file"}
                style={{ padding: '6px 12px', border: 'none', cursor: rendering ? 'wait' : 'pointer' }}
            />
        </div>
    );
};
