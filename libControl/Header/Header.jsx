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

const Header = ({ activeTabs, toggleTab, deferredPrompt, installApp }) => {
    const btnStyle = (tab, isLast = false) => {
        const open = activeTabs.includes(tab);
        const onTop = activeTabs[0] === tab;   // the panel stuck under the header
        return {
            flex: 1,
            padding: '8px 16px',
            background: open ? 'var(--accent)' : 'var(--strip)',
            color: open ? '#06222e' : 'var(--text)',
            border: 'none',
            borderRight: isLast ? 'none' : '1px solid #3a3f49',
            borderRadius: 0,
            cursor: 'pointer',
            fontWeight: onTop ? '900' : '600',
            fontSize: '14px',
            opacity: open ? 1 : 0.6
        };
    };

    return (
        <header className="app-header">
            <style>{`
                .app-header {
                    display: flex; align-items: center; gap: 14px;
                    padding: 10px 16px; background: var(--panel);
                    box-shadow: 0 2px 8px #0006; z-index: 10; flex-wrap: wrap;
                    justify-content: space-between;
                }
                .header-logo {
                    font-size: 18px; margin: 0; font-weight: 400; letter-spacing: 2px; color: var(--accent);
                }
                .header-tabs {
                    display: flex; gap: 0; flex: 1; margin-left: 20px; border-radius: 6px; overflow: hidden; border: 1px solid #3a3f49;
                }
                @media (max-width: 800px) {
                    .app-header {
                        flex-direction: column;
                        justify-content: center;
                        gap: 10px;
                    }
                    .header-logo {
                        font-size: 14px;
                        text-align: center;
                        width: 100%;
                    }
                    .header-tabs {
                        margin-left: 0;
                        width: 100%;
                    }
                }
            `}</style>
            {/* Not a link — the GitHub link lives on the footer credit. */}
            <h1 className="header-logo">
                <b style={{ fontWeight: 800 }}>SAMPLER</b>.LIKE.AUDIO
            </h1>
            
            <div className="header-tabs">
                <button onClick={() => toggleTab('PADS')} style={btnStyle('PADS')}>PADS</button>
                <button onClick={() => toggleTab('SEQ')} style={btnStyle('SEQ')}>SEQ</button>
                <button onClick={() => toggleTab('SONG')} style={btnStyle('SONG')}>SONG</button>
                <button onClick={() => toggleTab('EDITOR')} style={btnStyle('EDITOR')}>EDITOR</button>
                <button onClick={() => toggleTab('MIXER')} style={btnStyle('MIXER')}>MIXER</button>
                <button onClick={() => toggleTab('LENSES')} style={btnStyle('LENSES', true)}>🔭 LENSES</button>
            </div>
            {deferredPrompt && (
                <button onClick={installApp} style={{ padding: '8px 16px', background: '#388e3c', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', marginLeft: 'auto' }}>
                    ⬇ INSTALL APP
                </button>
            )}
        </header>
    );
};

window.Header = Header;
