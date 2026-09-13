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

const Mixer = () => {
    const { trackVol, setTrackVol, trackPan, setTrackPan, mutes, toggleMute, solos, toggleSolo, clearSolos, masterVol, setMasterVol, clickVol, setClickVol, recording, bpm } = window.useSeqState('Pattern Sequencer', 16, window.OA_DRUM_KIT || []);
    const tracks = window.OA_DRUM_KIT || [];
    // One strip per pad — a bigger grid grows the mixer with it.
    window.useOaPadGrid();

    // Sixteen near-neighbours of the accent, so adjacent channel strips are
    // distinguishable without any of them looking like a different theme.
    // Built as tints and shades of var(--accent) rather than fixed oranges:
    // pick a blue in Config and the whole rack turns blue together.
    const PALETTE = ["var(--accent)", "var(--accent-t15)", "var(--accent-s15)", "var(--accent)",
                     "var(--accent-t25)", "var(--accent-s25)", "var(--accent)", "var(--accent-s15)",
                     "var(--accent-t15)", "var(--accent)", "var(--accent-s25)", "var(--accent-t25)",
                     "var(--accent)", "var(--accent-t15)", "var(--accent-s15)", "var(--accent)"];

    // Display-only lift on the effect-return meters. See where it is applied.
    const FX_METER_GAIN = 2;

    const isAnySolo = solos.some(v => v);

    const meterRefs = React.useRef([]);
    const clickMeterRef = React.useRef(null);

    // Which channel's SYNTH panel is open, and a re-render when samples change
    // so a channel that just got a sample loses its SYNTH button.
    const [synthPad, setSynthPad] = React.useState(null);
    const [eqPad, setEqPad] = React.useState(null);
    const [gatePad, setGatePad] = React.useState(null);
    const [samplerPad, setSamplerPad] = React.useState(null);
    const [drivePad, setDrivePad] = React.useState(null);
    const [compPad, setCompPad] = React.useState(null);
    const [varcUnit, setVarcUnit] = React.useState(null);
    const [tapeUnit, setTapeUnit] = React.useState(null);
    const [chorusUnit, setChorusUnit] = React.useState(null);
    // The master buss compressor. Not a channel, so it takes no index — there
    // is one of it, on the strip at the end.
    const [bussOpen, setBussOpen] = React.useState(false);
    const [, forceSamples] = React.useReducer((n) => n + 1, 0);
    React.useEffect(() => {
        const onSample = () => forceSamples();
        // The Sequencer's track names open the same editor — the Mixer hosts it
        // because it is always mounted, and the panel portals to <body>.
        const onOpen = (e) => { if (e.detail && e.detail.idx != null) { setDrivePad(null); setCompPad(null); setSynthPad(e.detail.idx); } };
        window.addEventListener('oa-sample-changed', onSample);
        window.addEventListener('oa-open-synth', onOpen);
        return () => {
            window.removeEventListener('oa-sample-changed', onSample);
            window.removeEventListener('oa-open-synth', onOpen);
        };
    }, []);
    const hasSample = (i) => !!(window.OA_DRUM_SAMPLES && window.OA_DRUM_SAMPLES[i] && window.OA_DRUM_SAMPLES[i].buffer);

    // Every effect return, in strip order: the two reverbs, then the four tape
    // delays. One list drives the send knobs, the meters and the return strips,
    // so the three can never disagree about what exists.
    const FX = React.useMemo(() => [
        ...window.OA_REVERB_UNITS.map((m, i) => ({
            kind: 'rv', i, key: `rv${i}`, name: m.name, color: m.color,
            short: 'R' + String.fromCharCode(65 + i),
        })),
        ...window.OA_DELAY_UNITS.map((m, i) => ({
            kind: 'dl', i, key: `dl${i}`, name: m.name, color: m.color,
            short: 'D' + (i + 1),
        })),
    ], []);

    const sendOf = (fx, ch) => {
        const unit = fx.kind === 'rv' ? window.oaReverbUnit(fx.i) : window.oaDelayUnit(fx.i);
        return (unit.sends && unit.sends[ch]) || 0;
    };
    const setSend = (fx, ch, v) => (fx.kind === 'rv' ? window.oaSetReverbSend : window.oaSetDelaySend)(fx.i, ch, v);

    // The effect state lives outside React (the audio graph reads it directly),
    // so mirror its changes back into a render.
    const [, forceFx] = React.useReducer((n) => n + 1, 0);
    React.useEffect(() => {
        const onFx = () => forceFx();
        window.addEventListener('oa-reverb-changed', onFx);
        window.addEventListener('oa-delay-changed', onFx);
        window.addEventListener('oa-drive-changed', onFx);
        window.addEventListener('oa-comp-changed', onFx);
        window.addEventListener('oa-buss-changed', onFx);
        return () => {
            window.removeEventListener('oa-reverb-changed', onFx);
            window.removeEventListener('oa-delay-changed', onFx);
            window.removeEventListener('oa-drive-changed', onFx);
            window.removeEventListener('oa-comp-changed', onFx);
            window.removeEventListener('oa-buss-changed', onFx);
        };
    }, []);

    // A head locked to the grid is stored as a count of 16ths, so a tempo change
    // has to re-derive its time. The Mixer is where the two meet: it is always
    // mounted and it already reads the transport.
    React.useEffect(() => { window.oaResyncDelays(bpm); }, [bpm]);

    // The audio layer's copy of the channel faders. A voice's fader is a NODE
    // now — it has to be, or a pre-fader send has nothing to tap ahead of — and
    // the value lives in React state, so it has to be handed over. Also the
    // reason a pad hit and an offline bounce finally honour the fader at all:
    // only the sequencer used to multiply it in.
    React.useEffect(() => {
        if (window.oaSetTrackFader) window.oaSetTrackFader(trackVol);
    }, [trackVol]);

    // RECORD ARMS THE BYPASS — but not from here. Setting it in this component
    // meant the signal path depended on the Mixer being mounted AND on its own
    // copy of `recording` being the one that moved, and neither was true. It is
    // set where the button is now, in useSeqState's toggleRecording(); this only
    // READS it, so the desk greys itself whether or not anyone is looking at it.
    const bypassed = window.useOaFxBypass ? window.useOaFxBypass() : false;
    const veil = window.oaBypassVeil ? window.oaBypassVeil(bypassed) : null;

    // A tail and a tape repeat decay on their own schedule, so unlike the
    // per-hit track meters these come off each plugin's telemetry frame.
    const fxMeterRefs = React.useRef({});
    // The gain-reduction readout on each channel's COMPRESS button.
    const grRefs = React.useRef({});
    // …and the attenuation readout on each channel's GATE button. Two refs
    // rather than one keyed map, because the two buttons meter different
    // plugins and a shared map would make which one silent depend on render
    // order.
    const gateRefs = React.useRef({});

    // The Mixer used to do this by hand: reach into ctx.__oaReverbs, find the
    // bus, pull 1024 floats out of its analyser into a scratch array, reduce
    // them to a peak, and do the same again for every delay — sixty times a
    // second, in parallel with CompressorEditor and VarcRemote doing the same
    // work on the same analysers. Now the back end measures once and every
    // display reads the answer.
    //
    // The other thing this buys: the four shared slots mean the loop below does
    // not care WHICH effect it is metering. A reverb and a tape are read by the
    // same three lines, and a plugin added later is metered without touching
    // this file.
    React.useEffect(() => {
        // TWO SUBSCRIPTIONS, AND THEY ARE NOT THE SAME THING. `oaPluginAttach`
        // starts the pump that fills the frames; `oaPluginOnFrame` says redraw
        // me once it has. This used to run its own requestAnimationFrame, which
        // meant a 120 Hz panel drove the pump 120 times AND this loop 120 times
        // for a needle nobody resolves past ~30 (PLAN-18.09). Reading on the
        // pump's own clock also removes the race: the frames are never half
        // filled when this runs, because the pass has already returned.
        const detach = window.oaPluginAttach();
        const S = window.OA_SLOT;

        const tick = () => {
            // Only channels whose compressor has actually been built have a
            // number to show; everything else is a wire and stays blank.
            Object.keys(grRefs.current).forEach((k) => {
                const el = grRefs.current[k];
                if (!el) return;
                const frame = window.oaPluginFrame('comp', k | 0);
                const L = window.oaPluginLayout('comp');
                const gr = frame && frame[S.ACTIVE] ? frame[L.GR] : 0;
                const text = gr > 0.15 ? '-' + gr.toFixed(1) : '';
                if (el.textContent !== text) el.textContent = text;
            });

            // The gate on the front of the channel, read the same way — one
            // frame, one slot, no arithmetic. GR is written straight into the
            // DOM because a number that moves on the meter clock must not
            // re-render sixteen strips to do it.
            Object.keys(gateRefs.current).forEach((k) => {
                const el = gateRefs.current[k];
                if (!el) return;
                const frame = window.oaPluginFrame('gate', k | 0);
                const L = window.oaPluginLayout('gate');
                const gr = frame && frame[S.ACTIVE] ? frame[L.GR] : 0;
                const text = gr > 0.15 ? '-' + gr.toFixed(1) : '';
                if (el.textContent !== text) el.textContent = text;
            });

            // The master bus meters itself, so the strip on the right is reading
            // the same numbers the buss compressor's own panel is — one
            // measurement, filled once by the back end, however many displays
            // are watching it.
            const bFrame = window.oaPluginFrame('buss', 0);
            const bL = window.oaPluginLayout('buss');
            if (bFrame) {
                [S.PEAK_L, S.PEAK_R].forEach((slot, ch) => {
                    const el = masterRefs.current[ch];
                    if (!el) return;
                    el.style.height = `${Math.max(0, (1 - Math.min(1, bFrame[slot])) * 100)}%`;
                });
                const el = bussGrRef.current;
                if (el) {
                    const gr = bFrame[S.ACTIVE] ? bFrame[bL.GR] : 0;
                    const text = gr > 0.15 ? '-' + gr.toFixed(1) : '';
                    if (el.textContent !== text) el.textContent = text;
                }
            }

            FX.forEach((fx) => {
                const els = fxMeterRefs.current[fx.key];
                if (!els) return;
                const frame = window.oaPluginFrame(fx.kind === 'rv' ? 'reverb' : 'delay', fx.i);
                if (!frame) return;
                // The decay is applied where the peak is WRITTEN, so two panels
                // reading the same frame cannot decay it twice as fast as one.
                //
                // FX_METER_GAIN is a DISPLAY-ONLY lift, and the returns need it:
                // a reverb tail and a tape repeat are quiet by nature, so against
                // the same scale the channel strips use they sit at the bottom of
                // the meter and flicker there. At 2x a typical return lands in the
                // middle of the scale, which is where a meter is actually worth
                // reading. Nothing downstream hears the difference — the same lift
                // the VARC's own dot meter applies, for the same reason.
                [S.PEAK_L, S.PEAK_R].forEach((slot, ch) => {
                    const el = els[ch];
                    if (!el) return;
                    const lit = Math.min(1, frame[slot] * FX_METER_GAIN);
                    el.style.height = `${Math.max(0, (1 - lit) * 100)}%`;
                });
            });

        };

        const stop = window.oaPluginOnFrame(tick);
        tick();                       // paint now rather than a slot from now
        return () => {
            stop();
            detach();
        };
    }, [FX]);

    const masterRefs = React.useRef([null, null]);
    // The buss compressor's live gain reduction, written straight into the
    // master strip's button.
    const bussGrRef = React.useRef(null);

    const stateRef = React.useRef({ trackVol, mutes, solos, isAnySolo, trackPan });
    React.useEffect(() => {
        stateRef.current = { trackVol, mutes, solos, isAnySolo, trackPan };
    }, [trackVol, mutes, solos, isAnySolo, trackPan]);

    React.useEffect(() => {
        // The meters follow every voice trigger, wherever it came from:
        //   oa-drum-play — sequencer steps
        //   oa-drum-hit  — pad strikes (mouse, keyboard, MIDI)
        //   oa-tone-hit  — tone-mode strikes, metered on their root track
        const onPlay = (e) => {
            const d = e.detail || {};
            const idx = d.idx != null ? d.idx : d.rootIdx;
            if (idx == null) return;
            const el = meterRefs.current[idx];
            if (!el) return;

            const { trackVol: tVol, mutes: tMutes, solos: tSolos, isAnySolo: tAnySolo } = stateRef.current;
            const vol = tVol[idx] == null ? 1 : tVol[idx];

            if (tMutes[idx] || (tAnySolo && !tSolos[idx]) || vol === 0) return;

            const i = Math.max(0, Math.min(1, ((e.detail.velocity || 0) / 100) * vol));
            const targetHeight = (1 - i) * 100;

            el.style.transition = 'none';
            el.style.height = `${targetHeight}%`;

            // 1. Animate Individual Track Meter
            el.style.transition = 'none';
            el.style.height = `${targetHeight}%`;
            void el.offsetHeight;
            el.style.transition = 'height 0.3s cubic-bezier(0.2, 1, 0.3, 1)';
            el.style.height = '100%';

            // The MASTER meters used to be accumulated here too — every trigger
            // adding its velocity through an equal-power pan approximation, so
            // the reading was an ESTIMATE of what the mix ought to be doing
            // rather than a measurement of what it was. It could not see a
            // reverb tail, a tape repeat, a channel compressor's makeup gain or
            // the buss compressor itself, and it went on estimating while the
            // fade took the output to silence. There is a real master bus now,
            // and it meters itself; the loop above reads that.
        };
        // The click track gets its own meter — it bypasses the track strips entirely.
        const onClick = (e) => {
            const el = clickMeterRef.current;
            if (!el) return;
            const i = Math.max(0, Math.min(1, ((e.detail && e.detail.velocity) || 0) / 100));
            el.style.transition = 'none';
            el.style.height = `${(1 - i) * 100}%`;
            void el.offsetHeight;
            el.style.transition = 'height 0.3s cubic-bezier(0.2, 1, 0.3, 1)';
            el.style.height = '100%';
        };

        const EVENTS = ['oa-drum-play', 'oa-drum-hit', 'oa-tone-hit'];
        EVENTS.forEach(name => window.addEventListener(name, onPlay));
        window.addEventListener('oa-click', onClick);
        return () => {
            EVENTS.forEach(name => window.removeEventListener(name, onPlay));
            window.removeEventListener('oa-click', onClick);
        };
    }, []);

    const panLabel = v => Math.abs(v) < 0.02 ? "C" : (v < 0 ? "L" + Math.round(-v * 100) : "R" + Math.round(v * 100));

    // A pair of meter bars for one effect return, gradient-tinted to the unit.
    /**
     * The head of an effect-return strip: the name IS the power button, and KILL
     * sits under it — the same two controls a channel gets, because a return is
     * a channel of the wet path and people reach for the same things.
     *
     * It is coloured in the RETURN's own colour rather than the app accent, so
     * the button, the meter, the send knob on every channel and the panel that
     * opens from it are all visibly the same effect. A channel strip is orange
     * because a channel has no identity of its own; a return does.
     *
     * The two are not the same control, and the hardware they come from does not
     * treat them as one either:
     *
     *   POWER  persistent. Out of circuit until pressed again, and it survives a
     *          reload — the machine is not part of the mix at all.
     *   KILL   momentary in spirit: the return is silenced, the tail keeps
     *          ringing behind it, and letting go brings it back where it got to.
     *          What you hit when the reverb is suddenly wrong in a take.
     *
     * Either one alone silences the return, and neither cancels the other.
     */
    const fxHead = (fx) => {
        const rv = fx.kind === 'rv';
        const unit = rv ? window.oaReverbUnit(fx.i) : window.oaDelayUnit(fx.i);
        const on = !unit.standby;
        const killed = rv ? window.oaReverbMuted(fx.i) : window.oaDelayMuted(fx.i);
        const power = () => (rv ? window.oaSetReverbStandby : window.oaSetDelayStandby)(fx.i, on);
        const kill = () => (rv ? window.oaMuteReverb : window.oaMuteDelay)(fx.i, !killed);
        return (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '3px' }}>
                <button
                    onClick={power}
                    title={`${fx.name} — ${on ? 'in circuit; click to take it out' : 'out of circuit; click to bring it back'}`}
                    style={{
                        width: '100%', padding: '7px 2px', textAlign: 'center', borderRadius: '4px',
                        border: `1px solid ${on ? fx.color : '#444b57'}`,
                        // The strip's own colour, dimmed to a plate rather than
                        // used flat: a lit button that IS the colour fights the
                        // meter beside it, which is the same colour and moving.
                        background: on ? 'color-mix(in srgb, ' + fx.color + ' 22%, #23262b)' : '#353b45',
                        color: on ? fx.color : 'var(--muted)',
                        cursor: 'pointer', fontSize: '10px', fontWeight: '700', letterSpacing: '1px',
                        textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}
                >
                    {fx.name}
                </button>
                <button
                    onClick={kill}
                    title={killed ? 'Killed — click to let it back in' : 'Kill this return; the tail keeps ringing behind it'}
                    style={{
                        width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                        border: `1px solid ${killed ? '#e5533d' : '#444b57'}`,
                        background: killed ? '#5c1d14' : '#353b45',
                        color: killed ? '#ffd9d2' : 'var(--muted)',
                        cursor: 'pointer', fontSize: '9px', fontWeight: '600', letterSpacing: '.5px'
                    }}
                >
                    KILL
                </button>
            </div>
        );
    };

    const fxMeters = (fx) => (
        <React.Fragment>
            {[0, 1].map((ch) => (
                <div key={ch} style={{
                    width: '6px', borderRadius: '2px', position: 'relative', overflow: 'hidden', border: '1px solid #0008',
                    background: `linear-gradient(to top, #1e2430 0%, ${fx.color} 74%, ${fx.color} 88%, #ffffff 100%)`
                }}>
                    <i ref={(el) => {
                        const slot = fxMeterRefs.current[fx.key] || (fxMeterRefs.current[fx.key] = [null, null]);
                        slot[ch] = el;
                    }}
                       style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', background: '#15171b' }}></i>
                </div>
            ))}
        </React.Fragment>
    );

    return (
        <div className="chunky-scrollbar" style={{ display: 'flex', gap: 0, padding: 0, overflowX: 'auto', alignItems: 'stretch', justifyContent: 'safe center', backgroundColor: 'var(--bg)' }}>
            {tracks.map((track, i) => {
                const color = PALETTE[i % PALETTE.length];
                const isMuted = mutes[i];
                const isSolo = solos[i];
                const vol = trackVol[i] == null ? 1 : trackVol[i];
                const pan = trackPan[i] || 0;

                // If solos are active, mute non-soloed tracks locally in UI (fader opacity)
                const mutedBySolo = isAnySolo && !isSolo;

                return (
                    <div key={i}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'copy';
                        }}
                        onDrop={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const files = e.dataTransfer ? e.dataTransfer.files : [];
                            if (files && files.length > 0 && window.oaLoadSampleToPad) {
                                await window.oaLoadSampleToPad(i, files[0]);
                                setSamplerPad(i);
                                window.dispatchEvent(new CustomEvent('oa-sample-changed', { detail: { idx: i } }));
                            }
                        }}
                        style={{
                            // Strips butt up against each other — a single rule line is the only separator.
                            background: 'var(--strip)', border: 'none', borderRight: '1px solid #3a3f49', borderRadius: 0,
                            width: '76px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center',
                            padding: '0 3px 8px', overflow: 'hidden'
                        }}>

                        {/* The channel name IS the ON button — lit means the track is live. Solo sits under it. */}
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '3px', marginTop: '6px', marginBottom: '8px' }}>
                            <button
                                onClick={() => toggleMute(i)}
                                title={`${track.name || 'Track'} — click to ${isMuted ? 'unmute' : 'mute'}`}
                                style={{
                                    // Twice the height of an ordinary strip button — this one
                                    // is the channel's on/off, and it is hit constantly.
                                    width: '100%', minWidth: 0, padding: '12px 2px', textAlign: 'center', borderRadius: '4px',
                                    border: `1px solid ${!isMuted ? 'var(--on)' : '#444b57'}`,
                                    background: !isMuted ? 'var(--accent-s70)' : '#353b45',
                                    cursor: 'pointer', fontSize: '9px', fontWeight: '700',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                                    overflow: 'hidden'
                                }}
                            >
                                <span style={{ color: !isMuted ? color : 'var(--muted)' }}>{String(i + 1).padStart(2, '0')}</span>
                                <span style={{ color: !isMuted ? 'var(--accent-t60)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name || 'Track'}</span>
                            </button>
                            <button
                                onClick={() => toggleSolo(i)}
                                style={{
                                    width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                    border: `1px solid ${isSolo ? 'var(--solo)' : '#444b57'}`,
                                    background: isSolo ? '#6b5014' : '#353b45',
                                    color: isSolo ? '#fff3c4' : 'var(--muted)',
                                    cursor: 'pointer', fontSize: '9px', fontWeight: '600'
                                }}
                            >
                                S
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch', height: '180px', opacity: mutedBySolo ? 0.4 : 1, transition: 'opacity 0.2s', width: '100%', justifyContent: 'center', marginBottom: '6px' }}>
                            <div style={{
                                width: '6px', borderRadius: '2px', position: 'relative', overflow: 'hidden', border: '1px solid #0008',
                                background: 'linear-gradient(to top, var(--accent-s25) 0%, var(--accent-s15) 74%, var(--accent) 78%, var(--accent-t15) 88%, var(--accent-t40) 93%, var(--accent-t60) 100%)'
                            }}>
                                <i ref={el => meterRefs.current[i] = el} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', background: '#15171b' }}></i>
                            </div>
                            <SvgFader
                                value={vol} color={color} width={36} height={180}
                                label={`${track.name || `Track ${i + 1}`} level`}
                                onChange={(v) => setTrackVol((prev) => { const n = [...prev]; n[i] = v; return n; })}
                            />
                        </div>

                        {/* No sample loaded means this voice is synthesized — let them shape it. */}
                        {!hasSample(i) && (
                            <button
                                onClick={() => { setDrivePad(null); setCompPad(null); setSamplerPad(null); setEqPad(null); setSynthPad(synthPad === i ? null : i); }}
                                title={`Edit the ${track.name || 'Track'} synth voice`}
                                style={{
                                    width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                    border: `1px solid ${synthPad === i ? 'var(--accent)' : '#444b57'}`,
                                    background: synthPad === i ? 'var(--accent-s70)' : '#2a2f38',
                                    color: synthPad === i ? 'var(--accent-t60)' : '#9aa3ae',
                                    cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.5px',
                                    marginBottom: '4px'
                                }}
                            >
                                SYNTH
                            </button>
                        )}

                        {/* The sound itself: pick one, chop it, tune it. Every
                            channel has this, sample or not — a channel with no
                            sample is one Browse away from having one. */}
                        {(() => {
                            const sOpen = samplerPad === i;
                            const sHas = hasSample(i);
                            const e = sHas && window.OA_DRUM_SAMPLES[i];
                            const sChop = !!e && window.oaTrimmed(window.oaTrimOf(e), e.buffer.duration);
                            return (
                                <button
                                    onClick={() => { setSynthPad(null); setDrivePad(null); setCompPad(null); setEqPad(null); setSamplerPad(sOpen ? null : i); }}
                                    title={sHas
                                        ? `${track.name || 'Track'} — ${e.name || 'sample'}${sChop ? ' (chopped)' : ''}\nEdit, chop or replace it`
                                        : `${track.name || 'Track'} — no sample. Pick one.`}
                                    style={{
                                        width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                        border: `1px solid ${sOpen || sHas ? 'var(--accent)' : '#444b57'}`,
                                        background: sOpen ? 'var(--accent-s70)' : (sHas ? 'var(--accent-s80)' : '#2a2f38'),
                                        color: sOpen || sHas ? 'var(--accent-t60)' : '#9aa3ae',
                                        cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.3px',
                                        marginBottom: '4px', overflow: 'hidden', whiteSpace: 'nowrap'
                                    }}
                                >
                                    SAMPLER{sChop ? ' ✂' : ''}
                                </button>
                            );
                        })()}

                        {/* The pedal in front of this channel. Unlit means the
                            mix is at 0 and no distortion is in the graph at all. */}
                        {(() => {
                            const dUnit = window.oaDriveUnit(i);
                            const dOn = dUnit.mix > window.OA_DRIVE_EPSILON;
                            const dColor = window.oaDriveMode(dUnit.mode).color;
                            const dOpen = drivePad === i;
                            return (
                                <button
                                    onClick={() => { setSynthPad(null); setCompPad(null); setSamplerPad(null); setEqPad(null); setGatePad(null); setDrivePad(dOpen ? null : i); }}
                                    title={`${track.name || 'Track'} — distortion pedal${dOn ? ` (${window.oaDriveMode(dUnit.mode).label}, ${Math.round(dUnit.mix * 100)}% mix)` : ''}`}
                                    style={{
                                        width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                        border: `1px solid ${dOpen || dOn ? dColor : '#444b57'}`,
                                        background: dOpen ? '#4a2418' : (dOn ? '#33201a' : '#2a2f38'),
                                        color: dOpen || dOn ? dColor : '#9aa3ae',
                                        cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.5px',
                                        marginBottom: '4px', ...veil
                                    }}
                                >
                                    DRIVE{dOn ? ` ${Math.round(dUnit.mix * 100)}` : ''}
                                </button>
                            );
                        })()}

                        {/* First in the channel, so first on the strip. The
                            button carries nothing when the gate is out, because
                            a range of 0 dB is a wire and a number saying 0 would
                            imply it was doing something. */}
                        {(() => {
                            const gOn = window.oaGateActive(i);
                            const gOpen = gatePad === i;
                            const gColor = window.OA_GATE_COLOR;
                            return (
                                <button
                                    onClick={() => { setSynthPad(null); setDrivePad(null); setCompPad(null); setSamplerPad(null); setEqPad(null); setGatePad(gOpen ? null : i); }}
                                    title={`${track.name || 'Track'} — noise gate${gOn ? ` (open at ${window.oaGateUnit(i).thresh.toFixed(0)} dB)` : ' (out)'}`}
                                    style={{
                                        width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                        border: `1px solid ${gOpen || gOn ? gColor : '#444b57'}`,
                                        background: gOpen ? '#213524' : (gOn ? '#1b2a1d' : '#2a2f38'),
                                        color: gOpen || gOn ? gColor : '#9aa3ae',
                                        cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.5px',
                                        marginBottom: '4px', display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', gap: '3px', overflow: 'hidden', ...veil
                                    }}
                                >
                                    <span>GATE</span>
                                    {/* Written straight into the DOM by the meter
                                        loop above, exactly as COMPRESS is. */}
                                    <i ref={(el) => { gateRefs.current[i] = el; }}
                                       style={{ fontStyle: 'normal', fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}></i>
                                </button>
                            );
                        })()}

                        {/* Three bands per pad. The button carries nothing when
                            the EQ is flat, because a flat EQ is not doing
                            anything and a number saying 0 would imply it was. */}
                        {(() => {
                            const eOn = window.oaEqActive(i);
                            const eOpen = eqPad === i;
                            const eColor = '#7fd1ff';
                            return (
                                <button
                                    onClick={() => { setSynthPad(null); setDrivePad(null); setCompPad(null); setSamplerPad(null); setGatePad(null); setEqPad(eOpen ? null : i); }}
                                    title={`${track.name || 'Track'} — three-band equaliser${eOn ? ' (shaping)' : ' (flat)'}`}
                                    style={{
                                        width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                        border: `1px solid ${eOpen || eOn ? eColor : '#444b57'}`,
                                        background: eOpen ? '#1b3a4a' : (eOn ? '#172c37' : '#2a2f38'),
                                        color: eOpen || eOn ? eColor : '#9aa3ae',
                                        cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.5px',
                                        marginBottom: '4px', ...veil
                                    }}
                                >
                                    EQ
                                </button>
                            );
                        })()}

                        {/* The limiting amplifier on the end of this channel.
                            When it is in, the button carries the live gain
                            reduction — the number that says whether the setting
                            is doing anything at all. */}
                        {(() => {
                            const cUnit = window.oaCompUnit(i);
                            const cOn = window.oaCompActive(i);
                            const cRatio = window.oaCompRatio(cUnit.ratio);
                            const cOpen = compPad === i;
                            const cColor = window.OA_COMP_COLOR;
                            return (
                                <button
                                    onClick={() => { setSynthPad(null); setDrivePad(null); setSamplerPad(null); setEqPad(null); setGatePad(null); setCompPad(cOpen ? null : i); }}
                                    title={`${track.name || 'Track'} — limiting amplifier${cOn ? ` (${cRatio.label}${cRatio.key === 'all' ? '' : ':1'})` : ''}`}
                                    style={{
                                        width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                        border: `1px solid ${cOpen || cOn ? cColor : '#444b57'}`,
                                        background: cOpen ? 'var(--accent-s70)' : (cOn ? 'var(--accent-s80)' : '#2a2f38'),
                                        color: cOpen || cOn ? cColor : '#9aa3ae',
                                        cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.3px',
                                        marginBottom: '4px', display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', gap: '3px', overflow: 'hidden', ...veil
                                    }}
                                >
                                    <span>COMPRESS</span>
                                    {/* Written straight into the DOM by the meter
                                        loop above — a number that moves at 60fps
                                        must not re-render sixteen strips to do it. */}
                                    <i ref={(el) => { grRefs.current[i] = el; }}
                                       style={{ fontStyle: 'normal', fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}></i>
                                </button>
                            );
                        })()}

                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <SvgKnob
                                value={pan} min={-1} max={1} defaultVal={0} bipolar={true} color={color} size={32}
                                label={`${track.name || `Track ${i + 1}`} pan`} display={panLabel(pan)}
                                onChange={(v) => setTrackPan((pprev) => { const n = [...pprev]; n[i] = v; return n; })}
                            />
                            <div style={{ fontSize: '8px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{panLabel(pan)}</div>
                        </div>

                        {/* Sends — how much of this channel feeds each shared effect.
                            Two reverbs on the top row, then the four tape delays.

                            The LEFT column is tapped ahead of the channel fader
                            and the RIGHT column after it, which is what the two
                            headings and the rule between them say. Which side a
                            send is on is not decided here: oaSendIsPre() in
                            oaFxBus.js owns it, so the label and the node graph
                            cannot drift apart. */}
                        <div style={{
                            width: '100%', marginTop: '6px', paddingTop: '5px', borderTop: '1px solid #3a3f49',
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2px',
                            fontSize: '6.5px', letterSpacing: '.6px', color: 'var(--muted)',
                            justifyItems: 'center', ...veil
                        }}>
                            <span title="Tapped BEFORE the channel fader — the send holds its level however far the fader comes down, and still feeds the effect at zero.">PRE</span>
                            <span title="Tapped AFTER the channel fader — pull the fader down and the effect comes down with it.">POST</span>
                        </div>
                        <div style={{
                            position: 'relative',
                            width: '100%', paddingTop: '3px',
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 2px', justifyItems: 'center',
                            ...veil
                        }}>
                            {/* The rule that ties each column to its heading. */}
                            <i style={{
                                position: 'absolute', left: '50%', top: 0, bottom: '2px', width: '1px',
                                background: '#3a3f49', pointerEvents: 'none'
                            }} />
                            {FX.map((fx) => {
                                const amount = sendOf(fx, i);
                                return (
                                    <div key={fx.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                                        <SvgKnob
                                            value={amount} min={0} max={1} defaultVal={0} color={fx.color} size={26}
                                            label={`${track.name || `Track ${i + 1}`} → ${fx.name}`}
                                            display={Math.round(amount * 100)}
                                            onChange={(v) => setSend(fx, i, v)}
                                        />
                                        <div title={`${track.name || 'Track'} → ${fx.name}`} style={{
                                            fontSize: '7px', letterSpacing: '.2px', fontVariantNumeric: 'tabular-nums',
                                            color: amount > 0.001 ? fx.color : 'var(--muted)'
                                        }}>
                                            {fx.short} {Math.round(amount * 100)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                    </div>
                );
            })}

            {/* Click Strip */}
            <div style={{
                background: 'var(--strip)', border: 'none', borderRight: '1px solid #3a3f49', borderRadius: 0,
                width: '60px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '8px 3px 8px', gap: '8px',
                boxShadow: recording ? '0 0 10px rgba(211,47,47,0.5)' : 'none'
            }}>
                <div style={{ fontSize: '10px', color: recording ? '#ff8a80' : '#aaa', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: recording ? 'bold' : 'normal' }}>Click</div>

                <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch', height: '180px', justifyContent: 'center' }}>
                    <div style={{
                        width: '6px', borderRadius: '2px', position: 'relative', overflow: 'hidden', border: '1px solid #0008',
                        background: 'linear-gradient(to top, #8a8a8a 0%, #c9c9c9 74%, #e0e0e0 88%, #fff 100%)'
                    }}>
                        <i ref={clickMeterRef} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', background: '#15171b' }}></i>
                    </div>
                    <SvgFader value={clickVol} color={recording ? "#d32f2f" : "#aaa"} width={36} height={180}
                              label="Click level" onChange={(v) => setClickVol(v)} />
                </div>

                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '700', fontVariantNumeric: 'tabular-nums', marginTop: '23px' }}>{Math.round(clickVol * 100)}</div>
            </div>

            {/* Reverb Returns — the wet paths everything sends into */}
            {window.OA_REVERB_UNITS.map((meta, u) => {
                const fx = FX[u];
                const unit = window.oaReverbUnit(u);
                return (
                    <div key={fx.key} style={{
                        background: 'var(--strip)', border: 'none', borderRight: '1px solid #3a3f49', borderRadius: 0,
                        width: '78px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center',
                        padding: '8px 4px 8px', gap: '8px', ...veil
                    }}>
                        {fxHead(fx)}

                        {/* The two dropdowns that used to sit here — a tone and a
                            size, four choices each — are now the VARC. The strip
                            just reports which program is loaded and opens the
                            remote; everything else about the room is edited there. */}
                        {(() => {
                            const open = varcUnit === u;
                            return (
                                <button
                                    onClick={() => setVarcUnit(open ? null : u)}
                                    title={`${meta.name} — open the VARC 444 (${window.oaReverbBank(unit.bank).name}: ${window.oaReverbProgramName(u)})`}
                                    style={{
                                        width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                        border: `1px solid ${open ? meta.color : '#444b57'}`,
                                        background: open ? '#1e3a3c' : '#2a2f38',
                                        color: open ? meta.color : '#9aa3ae',
                                        cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.5px'
                                    }}
                                >
                                    VARC 444
                                </button>
                            );
                        })()}

                        {/* Program number and name, the way the machine's own
                            display carries it. A dot means it has been edited
                            away from the stored program. */}
                        <div style={{ width: '100%', textAlign: 'center', lineHeight: 1.25, minHeight: '26px' }}>
                            <div style={{
                                fontSize: '8px', color: meta.color, fontWeight: '700',
                                fontVariantNumeric: 'tabular-nums'
                            }}>
                                {unit.prog + 1}·{window.oaReverbProgramName(u)}{unit.edited ? ' *' : ''}
                            </div>
                            <div style={{ fontSize: '7px', color: 'var(--muted)', letterSpacing: '.3px' }}>
                                {window.oaReverbBank(unit.bank).name}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '3px', alignItems: 'stretch', height: '210px', justifyContent: 'center' }}>
                            {fxMeters(fx)}
                            <SvgFader
                                value={unit.ret} color={meta.color} width={36} height={210}
                                label={`${meta.name} return`}
                                onChange={(v) => window.oaSetReverb(u, 'ret', v)}
                            />
                        </div>

                        <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                            {Math.round(unit.ret * 100)}
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--muted)' }}>RETURN</div>
                    </div>
                );
            })}

            {/* Tape Delay Returns — a tape echo per strip. TAPE opens the heads. */}
            {window.OA_DELAY_UNITS.map((meta, u) => {
                const fx = FX[window.OA_REVERB_COUNT + u];
                const unit = window.oaDelayUnit(u);
                const open = tapeUnit === u;
                const chOpen = chorusUnit === u;
                const chMode = unit.chorus || 0;
                const thrown = unit.toRv
                    .map((v, r) => (v > 0.005 ? `${window.OA_REVERB_UNITS[r].name.replace('RV ', 'R')} ${Math.round(v * 100)}` : null))
                    .filter(Boolean);
                return (
                    <div key={fx.key} style={{
                        background: 'var(--strip)', border: 'none', borderRight: '1px solid #3a3f49', borderRadius: 0,
                        width: '74px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center',
                        padding: '8px 4px 8px', gap: '6px', ...veil
                    }}>
                        {fxHead(fx)}

                        <button
                            onClick={() => { setChorusUnit(null); setTapeUnit(open ? null : u); }}
                            title={`${meta.name} — heads, wow, flutter and tape drive`}
                            style={{
                                width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                border: `1px solid ${open ? meta.color : '#444b57'}`,
                                background: open ? '#332c55' : '#2a2f38',
                                color: open ? meta.color : '#9aa3ae',
                                cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.5px'
                            }}
                        >
                            TAPE
                        </button>

                        {/* Next box in the chain. Lit means a width mode is
                            in — the number says which. */}
                        <button
                            onClick={() => { setTapeUnit(null); setChorusUnit(chOpen ? null : u); }}
                            title={`${meta.name} — Width chorus after the tape${chMode ? `, mode ${chMode}` : ''}`}
                            style={{
                                width: '100%', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                border: `1px solid ${chOpen || chMode ? meta.color : '#444b57'}`,
                                background: chOpen ? '#332c55' : (chMode ? '#26223d' : '#2a2f38'),
                                color: chOpen || chMode ? meta.color : '#9aa3ae',
                                cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.5px'
                            }}
                        >
                            CHORUS{chMode ? ` ${chMode}` : ''}
                        </button>

                        <div style={{ fontSize: '8px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {Math.round(unit.timeL * 1000)}/{Math.round(unit.timeR * 1000)} ms
                        </div>

                        <div style={{ display: 'flex', gap: '3px', alignItems: 'stretch', height: '210px', justifyContent: 'center' }}>
                            {fxMeters(fx)}
                            <SvgFader
                                value={unit.ret} color={meta.color} width={36} height={210}
                                label={`${meta.name} return`}
                                onChange={(v) => window.oaPluginSet('delay', u, 'ret', v)}
                            />
                        </div>

                        <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                            {Math.round(unit.ret * 100)}
                        </div>
                        {/* Where this tape's repeats end up besides the output. */}
                        <div style={{ fontSize: '8px', color: thrown.length ? '#7fd4d6' : 'var(--muted)', textAlign: 'center', minHeight: '10px' }}>
                            {thrown.length ? `→ ${thrown.join(' ')}` : 'RETURN'}
                        </div>
                    </div>
                );
            })}

            {/* Master Strip */}
            <div style={{
                background: 'var(--strip)', border: 'none', borderRadius: 0,
                width: '64px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '8px 3px 8px', gap: '8px'
            }}>
                <div style={{ fontSize: '10px', color: '#aaa', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: recording ? '2px' : '8px' }}>Master</div>

                {/* A rack that has silently stopped working is a support
                    question. While record is armed the returns are dead and the
                    dry path is a wire, so the panel says so rather than leaving
                    someone to wonder where the reverb went. */}
                {recording && (
                    <div title="Every effect is out of the path while recording, for the lowest latency between the pad and the speaker."
                         style={{
                             fontSize: '7.5px', letterSpacing: '.8px', fontWeight: '700',
                             color: '#ff8a80', border: '1px solid #722', borderRadius: '3px',
                             padding: '2px 4px', marginBottom: '6px', textAlign: 'center', width: '100%'
                         }}>
                        FX BYPASS
                    </div>
                )}

                <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch', height: '270px' }}>
                    {/* L Meter */}
                    <div style={{
                        width: '6px', borderRadius: '2px', position: 'relative', overflow: 'hidden', border: '1px solid #0008',
                        background: 'linear-gradient(to top, var(--accent-s25) 0%, var(--accent-s15) 74%, var(--accent) 78%, var(--accent-t15) 88%, var(--accent-t40) 93%, var(--accent-t60) 100%)'
                    }}>
                        <i ref={el => masterRefs.current[0] = el} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', background: '#15171b', transition: 'height 0.05s linear' }}></i>
                    </div>
                    {/* Master Fader */}
                    <SvgFader value={masterVol} color="#aaa" width={36} height={270}
                              label="Master" onChange={(v) => setMasterVol(v)} />
                    {/* R Meter */}
                    <div style={{
                        width: '6px', borderRadius: '2px', position: 'relative', overflow: 'hidden', border: '1px solid #0008',
                        background: 'linear-gradient(to top, var(--accent-s25) 0%, var(--accent-s15) 74%, var(--accent) 78%, var(--accent-t15) 88%, var(--accent-t40) 93%, var(--accent-t60) 100%)'
                    }}>
                        <i ref={el => masterRefs.current[1] = el} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', background: '#15171b', transition: 'height 0.05s linear' }}></i>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '22px', fontSize: '9px', color: '#777' }}>
                    <span>L</span><span>R</span>
                </div>

                {/* The compressor across the whole mix. When it is in, the
                    button carries the live gain reduction — on a bus, that
                    number is the setting: two or three dB is glue, and a figure
                    that never comes back up is a threshold set too low. */}
                {(() => {
                    const bOn = window.oaBussActive();
                    const bColor = window.OA_BUSS_COLOR;
                    return (
                        <button
                            onClick={() => setBussOpen(!bussOpen)}
                            title={`Master buss compressor${bOn ? ' — in circuit' : ' — out of circuit'}`}
                            style={{
                                width: '56px', padding: '3px 0', textAlign: 'center', borderRadius: '4px',
                                border: `1px solid ${bussOpen || bOn ? bColor : '#444b57'}`,
                                background: bussOpen ? '#16323c' : (bOn ? '#122a33' : '#2a2f38'),
                                color: bussOpen || bOn ? bColor : '#9aa3ae',
                                cursor: 'pointer', fontSize: '9px', fontWeight: '700', letterSpacing: '.3px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '3px', overflow: 'hidden', ...veil
                            }}
                        >
                            <span>BUSS</span>
                            {/* Written straight into the DOM by the meter loop
                                above — a number that moves at 60fps must not
                                re-render the whole desk to do it. */}
                            <i ref={(el) => { bussGrRef.current = el; }}
                               style={{ fontStyle: 'normal', fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}></i>
                        </button>
                    );
                })()}

                <button
                    onClick={clearSolos}
                    style={{
                        width: '56px', padding: '5px 0', textAlign: 'center', borderRadius: '5px',
                        border: `1px solid ${isAnySolo ? '#fff3c4' : '#5a4a14'}`,
                        background: isAnySolo ? 'var(--solo)' : '#2a2a2a',
                        color: isAnySolo ? '#3a2c00' : '#6a6a6a',
                        cursor: 'pointer', fontSize: '10px', fontWeight: '700', letterSpacing: '.5px', opacity: isAnySolo ? 1 : 0.5
                    }}
                >
                    SOLO
                </button>
                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>OUT</div>
            </div>

            {synthPad != null && window.DrumSynthEditor && ReactDOM.createPortal(
                <window.DrumSynthEditor
                    idx={synthPad}
                    name={(tracks[synthPad] && tracks[synthPad].name) || `Track ${synthPad + 1}`}
                    onClose={() => setSynthPad(null)}
                />,
                document.body
            )}

            {gatePad != null && window.GateEditor && ReactDOM.createPortal(
                <window.GateEditor
                    idx={gatePad}
                    name={(tracks[gatePad] && tracks[gatePad].name) || `Track ${gatePad + 1}`}
                    onClose={() => setGatePad(null)}
                />,
                document.body
            )}

            {eqPad != null && window.EqEditor && ReactDOM.createPortal(
                <window.EqEditor
                    idx={eqPad}
                    name={(tracks[eqPad] && tracks[eqPad].name) || `Track ${eqPad + 1}`}
                    onClose={() => setEqPad(null)}
                />,
                document.body
            )}

            {samplerPad != null && window.SamplerEditor && ReactDOM.createPortal(
                <window.SamplerEditor
                    idx={samplerPad}
                    name={(tracks[samplerPad] && tracks[samplerPad].name) || `Track ${samplerPad + 1}`}
                    onClose={() => setSamplerPad(null)}
                />,
                document.body
            )}

            {drivePad != null && window.DriveEditor && ReactDOM.createPortal(
                <window.DriveEditor
                    idx={drivePad}
                    name={(tracks[drivePad] && tracks[drivePad].name) || `Track ${drivePad + 1}`}
                    onClose={() => setDrivePad(null)}
                />,
                document.body
            )}

            {varcUnit != null && window.VarcRemote && ReactDOM.createPortal(
                <window.VarcRemote u={varcUnit} onClose={() => setVarcUnit(null)} />,
                document.body
            )}

            {compPad != null && window.CompressorEditor && ReactDOM.createPortal(
                <window.CompressorEditor
                    idx={compPad}
                    name={(tracks[compPad] && tracks[compPad].name) || `Track ${compPad + 1}`}
                    onClose={() => setCompPad(null)}
                />,
                document.body
            )}

            {/* Why the desk has gone grey. Portalled rather than placed in the
                strip row, because the rack is out of circuit for the whole app
                — the pads and the sequencer are dry too — and because a banner
                inside a horizontally scrolling row of strips scrolls away from
                the thing it is explaining. */}
            {bypassed && ReactDOM.createPortal(
                <div style={{
                    position: 'fixed', top: '4px', left: '50%', transform: 'translateX(-50%)',
                    zIndex: 2000, pointerEvents: 'none',
                    padding: '4px 14px', borderRadius: '12px',
                    background: 'rgba(183,28,28,0.94)', border: '1px solid #ff8a80',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
                    fontSize: '10px', fontWeight: '700', letterSpacing: '1.2px', color: '#fff',
                    whiteSpace: 'nowrap'
                }}>
                    ● RECORD ARMED — EFFECTS RACK OUT OF CIRCUIT
                </div>,
                document.body
            )}

            {bussOpen && window.BussCompEditor && ReactDOM.createPortal(
                <window.BussCompEditor onClose={() => setBussOpen(false)} />,
                document.body
            )}

            {tapeUnit != null && window.TapeDelayEditor && ReactDOM.createPortal(
                <window.TapeDelayEditor u={tapeUnit} bpm={bpm} onClose={() => setTapeUnit(null)} />,
                document.body
            )}

            {chorusUnit != null && window.ChorusEditor && ReactDOM.createPortal(
                <window.ChorusEditor u={chorusUnit} onClose={() => setChorusUnit(null)} />,
                document.body
            )}
        </div>
    );
};

window.Mixer = Mixer;
