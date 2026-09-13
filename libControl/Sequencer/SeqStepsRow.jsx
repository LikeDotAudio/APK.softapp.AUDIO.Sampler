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

// Dedicated row component for Pattern steps / extensions
window.SeqStepsRow = ({ steps, setSteps, doubleTo, clearPattern }) => {
    const SeqButton = window.SeqButton;
    const STEP_OPTIONS = window.OA_STEP_OPTIONS;

    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#aaa', marginTop: '6px' }}>Steps:</span>
            {STEP_OPTIONS.map((n, i) => (
                <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <SeqButton label={String(n)} active={steps === n} onClick={() => setSteps(n)} />
                    {i > 0 && (
                        <SeqButton
                            label={`+${n / 2}`}
                            onClick={() => doubleTo(n)}
                            color="#26323a" textColor="var(--accent-t15)"
                            title={`Extend to ${n} steps: copy the first ${n / 2} onto the second ${n / 2}`}
                            style={{ border: '1px solid #3a4a58' }}
                        />
                    )}
                </div>
            ))}
            <div style={{ marginLeft: 'auto' }}>
                <SeqButton
                    label="Clear"
                    onClick={() => {
                        if (window.confirm("Are you sure you want to clear the entire pattern?")) {
                            clearPattern();
                        }
                    }}
                    style={{ padding: '6px 12px', border: 'none' }}
                />
            </div>
        </div>
    );
};
