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

// Faint waveform behind the pad label. Draws a loaded sample if there is one,
// otherwise the synth voice bounced to a buffer — a synthesized pad shows its
// shape exactly like a sampled one.
window.PadWave = ({ idx, ver, synth }) => {
    const canvasRef = React.useRef(null);
    const [, redraw] = React.useReducer((n) => n + 1, 0);

    // The bounce is async; repaint when this voice's render lands.
    React.useEffect(() => {
        if (!synth) return;
        const onRendered = (e) => { if (e.detail && e.detail.idx === idx) redraw(); };
        window.addEventListener('oa-synth-rendered', onRendered);
        if (window.oaRenderSynthVoice) window.oaRenderSynthVoice(idx);
        return () => window.removeEventListener('oa-synth-rendered', onRendered);
    }, [idx, synth, ver]);

    // Repaint on a theme change — the effect below has no dependency list and
    // so runs on every render, which makes forcing one the whole fix.
    React.useEffect(() => window.oaOnAccent(redraw), []);

    React.useEffect(() => {
        const c = canvasRef.current; if (!c) return;
        c.width = c.clientWidth || 120; c.height = c.clientHeight || 120;
        const cx = c.getContext('2d'); cx.clearRect(0, 0, c.width, c.height);

        let buffer = null;
        if (synth) {
            const r = window.OA_SYNTH_RENDER && window.OA_SYNTH_RENDER[idx];
            buffer = r && r.buffer;
        } else {
            const entry = window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[idx];
            buffer = entry && entry.buffer;
        }
        if (!buffer) return;

        const data = buffer.getChannelData(0);
        const step = Math.max(1, Math.ceil(data.length / c.width));
        const amp = c.height / 2;
        // A synth pad has no accent-coloured sample background behind it, so its
        // trace is the accent itself; a sampled pad already sits on that colour,
        // so its trace is a dark shade of it instead.
        cx.strokeStyle = synth ? window.oaAccentRgba(0, 0.40) : window.oaAccentRgba(-0.78, 0.45);
        cx.beginPath();
        for (let x = 0; x < c.width; x++) {
            let mn = 1, mx = -1;
            for (let j = 0; j < step; j++) { const d = data[x * step + j]; if (d === undefined) break; if (d < mn) mn = d; if (d > mx) mx = d; }
            cx.moveTo(x, (1 + mn) * amp); cx.lineTo(x, (1 + mx) * amp);
        }
        cx.stroke();
    });

    return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
};
