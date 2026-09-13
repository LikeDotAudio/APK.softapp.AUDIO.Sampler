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

// Dedicated row component for pattern preset buttons in the library
window.SeqPatternChipsRow = ({ library, loadPattern, deletePattern, setSongItems, song }) => {
    if (library.length === 0) {
        return (
            <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                No saved patterns yet — build a beat and hit Save.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {library.map((entry) => (
                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', background: '#2a2a2a', borderRadius: '3px', border: '1px solid #444', overflow: 'hidden' }}>
                    <button
                        onClick={() => {
                            loadPattern(entry);
                            window.dispatchEvent(new CustomEvent('oa-open-tab', { detail: { tab: 'SEQ' } }));
                        }}
                        onContextMenu={(e) => { e.preventDefault(); if (window.confirm(`Delete pattern "${entry.name}"?`)) deletePattern(entry.name); }}
                        title={`Load "${entry.name}"${entry.bpm ? ` @ ${entry.bpm} BPM` : ''} into the sequencer to edit · right-click to delete`}
                        style={{ background: 'transparent', color: 'var(--accent)', border: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}
                    >
                        {entry.name}
                    </button>
                    <button
                        onClick={() => setSongItems([...song, entry.name])}
                        title={`Append "${entry.name}" to the song`}
                        style={{ background: 'transparent', color: '#8bc34a', border: 'none', borderLeft: '1px solid #444', padding: '5px 8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    >
                        ＋
                    </button>
                </div>
            ))}
        </div>
    );
};
