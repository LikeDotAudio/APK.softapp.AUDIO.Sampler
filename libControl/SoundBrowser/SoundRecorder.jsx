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
 * SoundRecorder.jsx — capture a sample from whatever the device is listening
 * with, and keep it.
 *
 * Two separate states, because they are two separate decisions: OPEN INPUT
 * starts the mic and the meters so you can set a level, and RECORD starts
 * writing the blocks down. Every recorder that folds those together makes you
 * throw away a take to find out you were 20dB too quiet.
 *
 * Capture is raw float blocks off a ScriptProcessor rather than MediaRecorder.
 * MediaRecorder would hand back lossy WebM/Opus; a sample gets pitched and
 * chopped, so it is worth the bytes to keep the PCM and write a real WAV.
 */
const OA_REC_BLOCK = 4096;

const oaFmtTime = (sec) => {
    const s = Math.max(0, sec);
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 10))}`;
};

window.SoundRecorder = ({ onSaved }) => {
    const [devices, setDevices] = React.useState([]);
    const [deviceId, setDeviceId] = React.useState('');
    const [open, setOpen] = React.useState(false);
    const [recording, setRecording] = React.useState(false);
    const [channels, setChannels] = React.useState(1);
    const [err, setErr] = React.useState('');
    const [elapsed, setElapsed] = React.useState(0);
    const [gain, setGain] = React.useState(1);
    const [monitor, setMonitor] = React.useState(false);
    const [take, setTake] = React.useState(null);      // { blob, buffer, seconds }
    const [name, setName] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    const levelsRef = React.useRef([{ peak: 0, rms: 0 }, { peak: 0, rms: 0 }]);
    const nodesRef = React.useRef(null);
    const streamRef = React.useRef(null);
    const chunksRef = React.useRef([]);
    const framesRef = React.useRef(0);
    const recordingRef = React.useRef(false);
    const gainRef = React.useRef(1);
    const waveRef = React.useRef(null);

    // The stop path is shared by the button, the length cap and unmount, so it
    // lives in a ref — the audio callback cannot see fresh state.
    const stopRecRef = React.useRef(() => {});

    React.useEffect(() => { gainRef.current = gain; if (nodesRef.current) nodesRef.current.gain.gain.value = gain; }, [gain]);
    React.useEffect(() => { if (nodesRef.current) nodesRef.current.monitor.gain.value = monitor ? 1 : 0; }, [monitor]);

    // Device labels are blank until the page has been granted the mic once, so
    // this is worth re-running after the stream opens.
    const listDevices = React.useCallback(async () => {
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            setDevices(all.filter((d) => d.kind === 'audioinput'));
        } catch (e) { /* not permitted yet — the default device still works */ }
    }, []);
    React.useEffect(() => { listDevices(); }, [listDevices]);

    // ---- the graph ---------------------------------------------------------
    const teardown = React.useCallback(() => {
        const n = nodesRef.current;
        if (n) {
            n.proc.onaudioprocess = null;
            try { n.src.disconnect(); n.gain.disconnect(); n.proc.disconnect(); n.sink.disconnect(); n.monitor.disconnect(); } catch (e) {}
        }
        nodesRef.current = null;
        if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
        levelsRef.current = [{ peak: 0, rms: 0 }, { peak: 0, rms: 0 }];
        recordingRef.current = false;
        setOpen(false); setRecording(false);
    }, []);
    React.useEffect(() => teardown, [teardown]);

    const openInput = async () => {
        setErr('');
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setErr('This browser has no microphone access. A secure page (https or localhost) is required.');
                return;
            }
            // The three processing flags are off on purpose: they are tuned for
            // speech on a call, and they will duck a decaying tail, notch out a
            // steady tone and ride the level of the very transient you are
            // trying to sample.
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: false, noiseSuppression: false, autoGainControl: false,
                    channelCount: { ideal: 2 },
                },
            });
            streamRef.current = stream;

            const ctx = window.oaAudioCtx();
            if (ctx.state === 'suspended') await ctx.resume();
            const track = stream.getAudioTracks()[0];
            const settings = (track && track.getSettings && track.getSettings()) || {};
            const ch = Math.max(1, Math.min(2, settings.channelCount || 1));

            const src = ctx.createMediaStreamSource(stream);
            const g = ctx.createGain(); g.gain.value = gainRef.current;
            const proc = ctx.createScriptProcessor(OA_REC_BLOCK, ch, ch);
            // A ScriptProcessor only runs while its output is routed somewhere,
            // so it feeds a silent gain node — the meters would otherwise sit
            // dead at the bottom of the scale.
            const sink = ctx.createGain(); sink.gain.value = 0;
            const mon = ctx.createGain(); mon.gain.value = monitor ? 1 : 0;

            src.connect(g);
            g.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
            g.connect(mon); mon.connect(ctx.destination);

            const maxFrames = window.OA_REC_MAX_SECONDS * ctx.sampleRate;
            proc.onaudioprocess = (e) => {
                const inb = e.inputBuffer;
                const n = inb.length;
                for (let c = 0; c < ch; c++) {
                    const d = inb.getChannelData(c);
                    let peak = 0, sum = 0;
                    for (let i = 0; i < n; i++) {
                        const v = d[i], a = v < 0 ? -v : v;
                        if (a > peak) peak = a;
                        sum += v * v;
                    }
                    levelsRef.current[c] = { peak, rms: Math.sqrt(sum / n) };
                    // getChannelData hands back a view onto a buffer the graph
                    // reuses next block, so the copy is not optional.
                    if (recordingRef.current) chunksRef.current[c].push(new Float32Array(d));
                }
                if (recordingRef.current) {
                    framesRef.current += n;
                    if (framesRef.current >= maxFrames) stopRecRef.current(true);
                }
            };

            nodesRef.current = { src, gain: g, proc, sink, monitor: mon, ctx, ch };
            setChannels(ch);
            setOpen(true);
            listDevices();
        } catch (e) {
            setErr(e && e.name === 'NotAllowedError'
                ? 'Microphone permission was refused. Allow it for this page and open the input again.'
                : `Could not open the input: ${(e && e.message) || e}`);
            teardown();
        }
    };

    // ---- recording ---------------------------------------------------------
    const startRec = () => {
        const n = nodesRef.current;
        if (!n) return;
        setTake(null); setErr('');
        chunksRef.current = Array.from({ length: n.ch }, () => []);
        framesRef.current = 0;
        recordingRef.current = true;
        setRecording(true);
    };

    const finishRec = React.useCallback(async (hitCap) => {
        if (!recordingRef.current) return;
        recordingRef.current = false;
        setRecording(false);
        const n = nodesRef.current;
        // The capture context's rate, falling back to the app's rather than to a
        // literal — a WAV header that disagrees with the samples in it plays back
        // at the wrong speed and nothing says why. See oaAudioRate.js.
        const rate = window.oaSampleRate(n && n.ctx);
        const ch = chunksRef.current.length;
        const total = framesRef.current;
        if (!ch || total < rate * 0.02) { setErr('That take was too short to keep.'); return; }

        const merged = [];
        for (let c = 0; c < ch; c++) {
            const out = new Float32Array(total);
            let o = 0;
            for (const block of chunksRef.current[c]) {
                // The last block can run past the cap; keep only what fits.
                const len = Math.min(block.length, total - o);
                if (len <= 0) break;
                out.set(len === block.length ? block : block.subarray(0, len), o);
                o += len;
            }
            merged.push(out);
        }
        chunksRef.current = [];

        const blob = window.oaEncodeWavFromChannels(merged, rate);
        let buffer = null;
        try { buffer = await window.oaDecodeAudio(window.oaAudioCtx(), await blob.arrayBuffer()); } catch (e) {}
        const stamp = new Date();
        const p2 = (v) => String(v).padStart(2, '0');
        setTake({ blob, buffer, seconds: total / rate, rate, channels: ch });
        setName(`REC ${p2(stamp.getHours())}${p2(stamp.getMinutes())}${p2(stamp.getSeconds())}.wav`);
        if (hitCap) setErr(`Stopped at the ${window.OA_REC_MAX_SECONDS}s limit.`);
    }, []);
    stopRecRef.current = finishRec;

    // The running time comes off the frame counter rather than a clock, so it
    // is the length of the audio actually captured.
    React.useEffect(() => {
        if (!recording) return;
        const rate = window.oaSampleRate(nodesRef.current && nodesRef.current.ctx);
        const id = setInterval(() => setElapsed(framesRef.current / rate), 80);
        return () => clearInterval(id);
    }, [recording]);

    React.useEffect(() => {
        if (take && take.buffer) window.drawWave(waveRef.current, take.buffer, '#4caf50');
    }, [take]);

    const save = async () => {
        if (!take) return;
        setSaving(true);
        try {
            const clean = (name.trim() || 'RECORDING').replace(/[\\/:*?"<>|]/g, '-');
            const entry = await window.oaRecSave(/\.wav$/i.test(clean) ? clean : clean + '.wav', take.blob, {
                ms: Math.round(take.seconds * 1000), rate: take.rate, channels: take.channels,
            });
            setTake(null); setName('');
            if (onSaved) onSaved(entry);
        } catch (e) {
            setErr(`Could not save: ${(e && e.message) || e}`);
        }
        setSaving(false);
    };

    const btn = (extra) => ({
        background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '3px',
        padding: '6px 12px', cursor: 'pointer', fontSize: '12px', ...extra,
    });

    return (
        <div style={{ borderBottom: '1px solid #2a2a2a', padding: '10px 12px', background: '#171717' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '9px' }}>
                <select
                    value={deviceId}
                    onChange={(e) => { setDeviceId(e.target.value); if (open) { teardown(); } }}
                    title="Which input to record from"
                    style={{ background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '3px', padding: '5px 6px', fontSize: '12px', maxWidth: '230px' }}
                >
                    <option value="">Default input</option>
                    {devices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Input ${i + 1}`}</option>
                    ))}
                </select>

                {!open ? (
                    <button onClick={openInput} style={btn({ background: 'var(--accent)', color: '#111', border: 'none', fontWeight: 'bold' })}>
                        🎙 Open input
                    </button>
                ) : (
                    <>
                        <button onClick={recording ? () => finishRec(false) : startRec}
                            style={btn({ background: recording ? '#c62828' : '#388e3c', border: 'none', fontWeight: 'bold', padding: '6px 16px' })}>
                            {recording ? '■ Stop' : '● Record'}
                        </button>
                        <span style={{ fontSize: '12px', color: recording ? '#ff6b52' : '#888', fontVariantNumeric: 'tabular-nums', minWidth: '54px' }}>
                            {oaFmtTime(recording ? elapsed : (take ? take.seconds : 0))}
                        </span>
                        <button onClick={teardown} style={btn()}>Close input</button>
                    </>
                )}

                <label style={{ fontSize: '12px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '5px' }}
                       title="Hear the input while you record — use headphones, or the speakers will feed back into the mic">
                    <input type="checkbox" checked={monitor} onChange={(e) => setMonitor(e.target.checked)} /> Monitor
                </label>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '6px' }}
                       title="Gain applied before the meters, so what you see is what gets written">
                    Gain
                    <input type="range" min="0" max="4" step="0.05" value={gain}
                           onChange={(e) => setGain(Number(e.target.value))} style={{ width: '90px' }} />
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: '#888', width: '38px' }}>
                        {gain === 0 ? '−∞' : `${(20 * Math.log10(gain)).toFixed(1)}`} dB
                    </span>
                </label>
            </div>

            <window.OaLevelMeter levelsRef={levelsRef} channels={channels} />

            {err && <div style={{ color: '#f88', fontSize: '11px', marginTop: '7px' }}>⚠️ {err}</div>}

            {!open && !err && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '7px' }}>
                    Open the input to see the meters, set the gain so peaks land in the amber, then record.
                    Takes are saved on this device and behave like any other sample — load them to a pad, favorite them, drop them on a track.
                </div>
            )}

            {take && (
                <div style={{ marginTop: '9px', padding: '8px', background: '#101510', border: '1px solid #2e4a2e', borderRadius: '4px' }}>
                    <canvas ref={waveRef} style={{ width: '100%', height: '44px', display: 'block', background: '#0a0a0a', border: '1px solid #333' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                               placeholder="Name this take" style={{ background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '3px', padding: '5px 8px', fontSize: '12px', flex: 1, minWidth: '140px' }} />
                        <span style={{ fontSize: '11px', color: '#888' }}>
                            {take.seconds.toFixed(2)}s · {take.channels === 2 ? 'stereo' : 'mono'} · {Math.round(take.rate / 100) / 10}kHz · {Math.round(take.blob.size / 1024)}KB
                        </span>
                        <button onClick={save} disabled={saving}
                            style={btn({ background: '#4caf50', border: 'none', fontWeight: 'bold', color: '#0d1a0d' })}>
                            {saving ? 'Saving…' : '⭳ Keep it'}
                        </button>
                        <button onClick={() => { setTake(null); setErr(''); }} style={btn()}>Discard</button>
                    </div>
                </div>
            )}
        </div>
    );
};
