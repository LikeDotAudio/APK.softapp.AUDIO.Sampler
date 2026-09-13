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
 * Preview transport for the browser, and the chop that goes with it.
 *
 * The four points — IN, OUT and a fade at each end — are held here rather than
 * in the component, because they are not decoration: the preview PLAYS them.
 * A sound is chopped by ear, so what you hear while you drag a handle has to be
 * the sound you are about to load, tail cut and fades and all. They travel to
 * the pad with the file (SoundBrowser → handleFile → oaSetDrumSample).
 */
window.useSoundBrowseAudio = (buffer, autoPreview) => {
    const [playing, setPlaying] = React.useState(false);
    const [loop, setLoop] = React.useState(false);
    const [pos, setPos] = React.useState(0);

    const srcRef = React.useRef(null);
    const gainRef = React.useRef(null);
    const startTimeRef = React.useRef(0);
    const offsetRef = React.useRef(0);
    const rafRef = React.useRef(null);

    const duration = buffer ? buffer.duration : 0;

    // The chop, in seconds of the source. Kept in a ref as well as rendered,
    // because a new file resets it and the auto-preview for that same file
    // fires on the very same commit — state would still be the OLD file's
    // points when the preview starts, so it would play from a mark belonging to
    // a sound that is no longer on screen.
    const bufRef = React.useRef(null);
    const trimRef = React.useRef({ in: 0, out: 0, fadeIn: 0, fadeOut: 0 });
    const [, setTrimVer] = React.useState(0);
    if (bufRef.current !== buffer) {
        bufRef.current = buffer;
        trimRef.current = { in: 0, out: duration, fadeIn: 0, fadeOut: 0 };
    }
    const trim = trimRef.current;

    /** Move one of 'in' | 'out' | 'fadeIn' | 'fadeOut' to `sec` (a time in the file). */
    const setTrimPoint = (which, sec) => {
        const d = bufRef.current ? bufRef.current.duration : 0;
        if (!d) return;
        trimRef.current = window.oaTrimMove(trimRef.current, which, sec, d);
        setTrimVer((n) => n + 1);
    };

    /** Back to the whole file, no fades. */
    const resetTrim = () => {
        trimRef.current = { in: 0, out: bufRef.current ? bufRef.current.duration : 0, fadeIn: 0, fadeOut: 0 };
        setTrimVer((n) => n + 1);
    };

    const trimmed = window.oaTrimmed(trim, duration);

    const stopSrc = () => {
        if (srcRef.current) { try { srcRef.current.stop(); } catch (e) {} srcRef.current = null; }
        if (gainRef.current) { try { gainRef.current.disconnect(); } catch (e) {} gainRef.current = null; }
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };

    const playFrom = (frac) => {
        if (!buffer) return;
        stopSrc();
        const t = trimRef.current;
        const inS = Math.max(0, Math.min(t.in, buffer.duration));
        const outS = Math.max(inS + 0.001, Math.min(t.out || buffer.duration, buffer.duration));
        const span = outS - inS;

        const ctx = window.oaAudioCtx();
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        src.buffer = buffer; src.loop = loop;
        src.connect(g); g.connect(ctx.destination);

        // Scrubbing outside the kept region drops you at its start rather than
        // playing audio that is about to be thrown away.
        let start = Math.max(0, Math.min(0.999, frac)) * buffer.duration;
        if (start < inS || start >= outS) start = inS;
        if (loop) { src.loopStart = inS; src.loopEnd = outS; }

        const now = ctx.currentTime;
        const region = outS - start;
        // The fade-in is joined partway up if you started inside it.
        const fadeInEnd = inS + t.fadeIn;
        if (t.fadeIn > 0 && start < fadeInEnd) {
            g.gain.setValueAtTime(Math.max(0.0001, (start - inS) / t.fadeIn), now);
            g.gain.linearRampToValueAtTime(1, now + (fadeInEnd - start));
        } else {
            g.gain.setValueAtTime(1, now);
        }
        // A looping preview keeps its level — a fade-out per lap would need the
        // envelope rescheduled every time round, and the point of the loop here
        // is to judge the seam.
        if (t.fadeOut > 0 && !loop) {
            const fadeAt = now + Math.max(0, region - t.fadeOut);
            g.gain.setValueAtTime(1, fadeAt);
            g.gain.linearRampToValueAtTime(0.0001, now + region);
        }

        if (loop) src.start(0, start);
        else src.start(0, start, region);
        srcRef.current = src; gainRef.current = g;
        startTimeRef.current = ctx.currentTime; offsetRef.current = start;
        src.onended = () => { if (srcRef.current === src) { srcRef.current = null; if (!loop) setPlaying(false); } };
        setPlaying(true);
        const update = () => {
            if (!srcRef.current) return;
            let at = offsetRef.current + (ctx.currentTime - startTimeRef.current);
            if (loop && span > 0) at = inS + ((at - inS) % span);
            setPos(buffer.duration ? Math.min(1, at / buffer.duration) : 0);
            rafRef.current = requestAnimationFrame(update);
        };
        rafRef.current = requestAnimationFrame(update);
    };

    const togglePlay = () => { if (playing) { stopSrc(); setPlaying(false); } else { playFrom(pos); } };
    const rewind = () => {
        // "Back to the start" means the start of the CHOP, which is the only
        // start the pad will ever hear.
        const frac = duration ? trimRef.current.in / duration : 0;
        setPos(frac);
        if (playing) playFrom(frac);
    };
    const scrub = (e) => {
        if (!duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setPos(frac);
        if (playing) playFrom(frac);
    };

    React.useEffect(() => { if (srcRef.current) srcRef.current.loop = loop; }, [loop]);
    React.useEffect(() => () => stopSrc(), []);

    // Auto-preview the first 5 seconds when a new buffer is ready.
    React.useEffect(() => {
        if (!buffer || !autoPreview) return;
        playFrom(0);
        const stop = setTimeout(() => { stopSrc(); setPlaying(false); }, 5000);
        return () => clearTimeout(stop);
    }, [buffer, autoPreview]);

    return {
        playing, loop, setLoop, pos, setPos, duration, togglePlay, rewind, scrub,
        trim, trimmed, setTrimPoint, resetTrim,
    };
};
