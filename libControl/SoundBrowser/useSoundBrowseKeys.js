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

window.useSoundBrowseKeys = (shown, selectedIndex, selectFileByIndex, chooseIt, onClose, gridScrollRef, selectedThumbRef, chop) => {
    // Keep the selected thumbnail centered in the grid as you browse.
    React.useEffect(() => {
        const el = selectedThumbRef.current, cont = gridScrollRef.current;
        if (!el || !cont) return;
        const cr = cont.getBoundingClientRect(), er = el.getBoundingClientRect();
        const delta = (er.top - cr.top) - (cont.clientHeight / 2 - el.clientHeight / 2);
        if (Math.abs(delta) > 2) cont.scrollTo({ top: cont.scrollTop + delta, behavior: 'smooth' });
    }, [selectedIndex, gridScrollRef, selectedThumbRef]);

    const chopRef = React.useRef(chop); chopRef.current = chop;

    // Arrow-key navigation across the thumbnail grid; Enter = Load.
    React.useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); e.preventDefault(); return; }
            if (e.target && (e.target.tagName === 'INPUT')) return;  // don't hijack the filter box

            // I and O drop the in- and out-point on the playhead — the tape-machine
            // marks, so a sound can be chopped while it plays instead of by
            // aiming at a 2px handle. Shift takes the fade to the same spot.
            // Read through the ref: the playhead moves every frame, and this
            // listener must not be torn down and re-added at that rate.
            const c = chopRef.current;
            if (c && c.duration && (e.key === 'i' || e.key === 'I' || e.key === 'o' || e.key === 'O')) {
                e.preventDefault();
                const isIn = (e.key === 'i' || e.key === 'I');
                c.setTrimPoint(e.shiftKey ? (isIn ? 'fadeIn' : 'fadeOut') : (isIn ? 'in' : 'out'), c.at);
                return;
            }

            if (!shown.length) return;
            let d = 0;
            // Snake traversal: forward advances one (…over, over, over, down a row),
            // back reverses, both wrapping around the whole grid.
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') d = 1;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') d = -1;
            else if (e.key === 'Enter') { chooseIt(); e.preventDefault(); return; }
            else return;
            e.preventDefault();
            const n = shown.length;
            const base = selectedIndex < 0 ? (d > 0 ? -1 : 0) : selectedIndex;
            selectFileByIndex(((base + d) % n + n) % n);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [shown, selectedIndex, selectFileByIndex, chooseIt, onClose]);
};
