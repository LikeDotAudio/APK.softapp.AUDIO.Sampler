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

/**
 * Global transport keys — live wherever you are in the app.
 *
 *   Space          play / stop
 *   Ctrl+Space     stopped -> arm record AND start rolling
 *                  playing -> toggle record without interrupting playback
 *
 * Bound to the window so it works from any tab, but never while typing into a
 * field — Space belongs to the text box then.
 */
window.useSeqTransportKeys = (isPlaying, togglePlayback, recording, toggleRecording) => {
    // Refs so the handler is bound once and still sees current state.
    const stateRef = React.useRef({});
    stateRef.current = { isPlaying, togglePlayback, recording, toggleRecording };

    React.useEffect(() => {
        const onKey = (e) => {
            if (e.code !== 'Space') return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            // Let the browser's own shortcuts through.
            if (e.altKey || e.metaKey || e.repeat) return;

            const s = stateRef.current;
            e.preventDefault();

            if (e.ctrlKey) {
                if (s.isPlaying) {
                    // Already rolling: arm or disarm without breaking the take.
                    s.toggleRecording();
                } else {
                    // From a standstill: arm first, then roll, so the very first
                    // bar is captured rather than starting a beat late.
                    if (!s.recording) s.toggleRecording();
                    s.togglePlayback();
                }
                return;
            }

            s.togglePlayback();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
};
