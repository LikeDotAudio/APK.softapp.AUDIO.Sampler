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

// The input meters. A segmented bar per channel, painted straight through DOM
// refs from an animation frame — level is a per-block quantity arriving 12 times
// a second, and routing it through React state would re-render the recorder on
// every one of them.
//
// `levelsRef.current[ch]` is filled in by whoever owns the audio: {peak, rms},
// both linear 0..1. Nothing here reaches into the graph.

const OA_METER_MIN_DB = -54;      // the left end of the scale
const OA_METER_SEGS = 32;

// Where the coloured zones start. Green is "you have signal", amber is "you are
// close to the top", red is the last 3dB before the converter clips.
const OA_METER_AMBER = -12;
const OA_METER_RED = -3;

const oaDbOf = (lin) => (lin > 1e-6 ? 20 * Math.log10(lin) : -120);
const oaMeterFrac = (db) => Math.max(0, Math.min(1, (db - OA_METER_MIN_DB) / (0 - OA_METER_MIN_DB)));

window.OaLevelMeter = ({ levelsRef, channels = 1, labels }) => {
    const segsRef = React.useRef({});
    const holdRef = React.useRef({});
    const clipRef = React.useRef({});

    React.useEffect(() => {
        // Peak hold: the bright pip that sticks at the loudest thing it has seen
        // and then falls. Without it a transient is one frame tall and you never
        // see how close you actually came.
        const hold = [];       // per channel: {v, until}
        const clipUntil = [];
        let raf = null;

        const tick = () => {
            const now = performance.now();
            for (let c = 0; c < channels; c++) {
                const lv = (levelsRef.current && levelsRef.current[c]) || { peak: 0, rms: 0 };
                const els = segsRef.current[c];
                if (!els) continue;

                const rmsF = oaMeterFrac(oaDbOf(lv.rms));
                const peakF = oaMeterFrac(oaDbOf(lv.peak));

                const h = hold[c] || (hold[c] = { v: 0, until: 0 });
                if (peakF >= h.v) { h.v = peakF; h.until = now + 1100; }
                else if (now > h.until) h.v = Math.max(peakF, h.v - 0.012);

                // Anything at or above digital full scale is a clip. It latches
                // for a moment because a single clipped block is over before
                // your eye gets to the meter.
                if (lv.peak >= 0.997) clipUntil[c] = now + 1600;
                const clipped = now < (clipUntil[c] || 0);

                const bodyLit = Math.round(rmsF * OA_METER_SEGS);
                const holdSeg = h.v > 0 ? Math.max(0, Math.round(h.v * OA_METER_SEGS) - 1) : -1;

                for (let i = 0; i < OA_METER_SEGS; i++) {
                    const el = els[i];
                    if (!el) continue;
                    const db = OA_METER_MIN_DB + (i / (OA_METER_SEGS - 1)) * (0 - OA_METER_MIN_DB);
                    const hue = db >= OA_METER_RED ? '#e5533d' : (db >= OA_METER_AMBER ? '#f4b02c' : '#4caf50');
                    const on = i < bodyLit;
                    const isHold = i === holdSeg;
                    el.style.background = isHold ? '#fff' : (on ? hue : '#20242a');
                    el.style.boxShadow = (on || isHold) ? `0 0 4px ${isHold ? '#fff' : hue}` : 'none';
                }
                const cl = clipRef.current[c];
                if (cl) {
                    cl.style.background = clipped ? '#ff2d16' : '#2a1512';
                    cl.style.boxShadow = clipped ? '0 0 7px rgba(255,45,22,0.9)' : 'none';
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [channels, levelsRef]);

    const row = (c) => (
        <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '9px', color: '#888', width: '10px', fontWeight: 'bold' }}>
                {labels ? labels[c] : (channels > 1 ? (c === 0 ? 'L' : 'R') : 'M')}
            </span>
            <div style={{ flex: 1, display: 'flex', gap: '1px', minWidth: 0 }}>
                {Array.from({ length: OA_METER_SEGS }, (_, i) => (
                    <i key={i}
                       ref={(el) => { const s = segsRef.current[c] || (segsRef.current[c] = []); s[i] = el; }}
                       style={{ flex: 1, height: '9px', background: '#20242a', borderRadius: '1px', display: 'block', minWidth: 0 }} />
                ))}
            </div>
            <i ref={(el) => { clipRef.current[c] = el; }}
               title="Clip — the signal hit the top of the scale"
               style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#2a1512', display: 'block', flexShrink: 0 }} />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {Array.from({ length: channels }, (_, c) => row(c))}
            {/* The scale, positioned so each number sits under its own segment. */}
            <div style={{ display: 'flex', marginLeft: '15px', marginRight: '14px', position: 'relative', height: '10px' }}>
                {[-54, -40, -30, -20, -12, -6, -3, 0].map((db) => (
                    <span key={db} style={{
                        position: 'absolute', left: `${oaMeterFrac(db) * 100}%`, transform: 'translateX(-50%)',
                        fontSize: '8px', color: db >= OA_METER_RED ? '#e5533d' : '#666', whiteSpace: 'nowrap'
                    }}>{db}</span>
                ))}
            </div>
        </div>
    );
};
