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

window.Pad = ({
    padNum, idx, name,
    isToneMode, toneRoot, hasSample, remembered, vel, sampleNames,
    midiNote, noteName,
    onPointerDown, onPointerUp, onPointerLeave, setPadButtonRef,
    PadWave
}) => {
    // Magic numbers for pad rendering and animations extracted here if any
    const baseColor = isToneMode ? 'var(--accent-s25)' : (hasSample ? 'var(--accent)' : '#3a3a3a');
    const restShadow = (hasSample || isToneMode) ? '0 4px 8px rgba(0,0,0,0.4)' : 'inset 0 1px 3px rgba(0,0,0,0.6)';

    const titleText = isToneMode ? `${noteName} — (Tone Mode for Pad ${toneRoot + 1})` : 
        (hasSample ? `${name} — sample: ${(window.OA_DRUM_SAMPLES[idx] && window.OA_DRUM_SAMPLES[idx].name) || sampleNames[idx]}\nALT+click to replace` : 
        (remembered ? `${name} — remembered: ${remembered.name}\n(Restore to re-load, or ALT+click to pick)` : 
        `${name} — synth voice\nALT+click to load a sample`));

    // The accessible NAME, which `title` is not: titleText is multi-line prose
    // carrying ALT+click hints, and a screen reader reads it as one run-on
    // string. This says what the pad IS and what is on it, and nothing else.
    const ariaLabel = isToneMode
        ? `Pad ${padNum}, ${noteName}, tone mode from pad ${toneRoot + 1}`
        : `Pad ${padNum}, ${name}, ${noteName}, ` + (
            hasSample ? `sample ${(window.OA_DRUM_SAMPLES[idx] && window.OA_DRUM_SAMPLES[idx].name) || sampleNames[idx]}`
                      : (remembered ? `sample ${remembered.name} remembered, not loaded` : 'synth voice'));

    // A pad is a momentary trigger, not a toggle, so it carries no aria-pressed
    // of its own -- except in tone mode, where being the root IS a held state
    // the user selected with ctrl+click. `undefined` omits the attribute.
    const pressed = isToneMode ? (toneRoot === idx) : undefined;

    return (
        <button
            ref={setPadButtonRef}
            title={titleText}
            aria-label={ariaLabel}
            aria-pressed={pressed}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
                const peakFile = files.find(f => /\.(peak|json)$/i.test(f.name));
                const audioFile = files.find(f => window.oaIsDroppableAudio(f));

                if (audioFile && window.oaLoadSampleToPad) {
                    await window.oaLoadSampleToPad(idx, audioFile);
                }
                if (peakFile) {
                    try {
                        const text = await peakFile.text();
                        const peakData = JSON.parse(text);
                        // The same normaliser the two global drop targets use —
                        // three `.PEAK` writers spell these fields three ways, and
                        // one copy of that knowledge is the point of the helper.
                        if (window.oaApplyPeakToPad) window.oaApplyPeakToPad(idx, peakData);
                    } catch (err) {
                        console.error("Could not parse sidecar on pad drop:", err);
                    }
                }
                window.dispatchEvent(new CustomEvent('oa-sample-changed', { detail: { idx } }));
            }}
            className="oa-pad"
            style={{
                position: 'relative',
                width: '120px', height: '120px',
                backgroundColor: baseColor,
                border: '1px solid #000',
                borderTop: '1px solid #555',
                borderLeft: '1px solid #444',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: restShadow,
                color: hasSample ? '#000' : '#ccc',
                fontWeight: 'bold',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                textAlign: 'center', padding: '4px',
                transition: 'transform 0.05s, background-color 0.05s, filter 0.05s',
                outline: 'none',
                touchAction: 'none'
            }}
        >
            <style>{`
                @keyframes oaPadGlowBlue {
                    from { box-shadow: 0 0 calc(12px + var(--gi, 0.5) * 48px) calc(3px + var(--gi, 0.5) * 16px) rgba(66, 165, 245, calc(0.5 + var(--gi, 0.5) * 0.5)); }
                    to { box-shadow: 0 0 0 0 rgba(66, 165, 245, 0); }
                }
            `}</style>

            {/* In tone mode every pad plays the root pad's voice pitched, so show
                that one. With no sample loaded the pad is a synth voice — draw
                its rendered waveform just the same. */}
            {(() => {
                const waveIdx = isToneMode ? toneRoot : idx;
                const sampled = !!(window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[waveIdx] && window.OA_DRUM_SAMPLES[waveIdx].buffer);
                return <PadWave idx={waveIdx} ver={sampleNames[waveIdx]} synth={!sampled} />;
            })()}
            <span className="oa-pad-name" style={{ position: 'relative', fontSize: '15px', lineHeight: 1.1, wordBreak: 'break-word', color: isToneMode ? '#fff' : 'inherit' }}>
                {isToneMode ? noteName : name}
            </span>

            <span style={{ position: 'absolute', bottom: '4px', left: '6px', fontSize: '9px', fontWeight: 'bold', opacity: 0.5 }}>
                {padNum}
            </span>

            <span title={`MIDI note ${midiNote}`} style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '8px', fontWeight: 'bold', opacity: 0.6, color: hasSample ? 'var(--accent-s85)' : 'var(--accent-t15)' }}>
                {window.midiNoteName(midiNote)}
            </span>

            {hasSample ? (
                <span style={{ position: 'absolute', bottom: '4px', right: '6px', fontSize: '8px', fontWeight: 'bold', opacity: 0.7, letterSpacing: '0.5px' }}>
                    SMP
                </span>
            ) : (remembered && (
                <span title={`Remembered: ${remembered.name}`} style={{ position: 'absolute', bottom: '3px', right: '5px', fontSize: '10px', fontWeight: 'bold', color: 'var(--accent-t15)', opacity: 0.8 }}>
                    ○
                </span>
            ))}

            {vel > 0 && (
                <span style={{ position: 'absolute', top: '4px', right: '6px', fontSize: '10px', fontWeight: 'bold', color: hasSample ? 'var(--accent-s85)' : 'var(--accent)', opacity: 0.9 }}>
                    {vel}
                </span>
            )}
        </button>
    );
};
