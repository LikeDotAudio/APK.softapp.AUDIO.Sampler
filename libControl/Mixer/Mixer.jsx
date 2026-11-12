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
        // A deep link (oaDeepLink.js) asks for one faceplate by plugin id; every
        // other editor closes, as a click on a strip button does.
        const onFx = (e) => {
            const d = e.detail || {};
            const u = d.unit != null ? d.unit : 0;
            setSynthPad(null); setDrivePad(null); setCompPad(null); setSamplerPad(null);
            setEqPad(null); setGatePad(null); setVarcUnit(null); setTapeUnit(null);
            setChorusUnit(null); setBussOpen(false);
            switch (d.plugin) {
                case 'reverb': setVarcUnit(u); break;
                case 'delay': setTapeUnit(u); break;
                case 'chorus': setChorusUnit(u); break;
                case 'buss': setBussOpen(true); break;
                case 'drumsynth': setSynthPad(u); break;
                case 'comp': setCompPad(u); break;
                case 'eq': setEqPad(u); break;
                case 'gate': setGatePad(u); break;
                case 'drive': setDrivePad(u); break;
                default: break;
            }
        };
        window.addEventListener('oa-sample-changed', onSample);
        window.addEventListener('oa-open-synth', onOpen);
        window.addEventListener('oa-open-fx', onFx);
        return () => {
            window.removeEventListener('oa-sample-changed', onSample);
            window.removeEventListener('oa-open-synth', onOpen);
            window.removeEventListener('oa-open-fx', onFx);
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

    // Everything the strips drawn in MixerChannelStrip.jsx, MixerReturnStrips.jsx and
    // MixerMasterStrips.jsx read, handed over as one object. They are plain
    // functions called where their markup sits, so the tree is unchanged.
    const mx = {
        FX, PALETTE, bussGrRef, bussOpen, chorusUnit, clearSolos, clickMeterRef, clickVol, compPad,
        drivePad, eqPad, fxHead, fxMeters, gatePad, gateRefs, grRefs, hasSample, isAnySolo,
        masterRefs, masterVol, meterRefs, mutes, panLabel, recording, samplerPad, sendOf,
        setBussOpen, setChorusUnit, setClickVol, setCompPad, setDrivePad, setEqPad, setGatePad,
        setMasterVol, setSamplerPad, setSend, setSynthPad, setTapeUnit, setTrackPan, setTrackVol,
        setVarcUnit, solos, synthPad, tapeUnit, toggleMute, toggleSolo, trackPan, trackVol,
        varcUnit, veil,
    };

    return (
        <div className="chunky-scrollbar" style={{ display: 'flex', gap: 0, padding: 0, overflowX: 'auto', alignItems: 'stretch', justifyContent: 'safe center', backgroundColor: 'var(--bg)' }}>
            {tracks.map((track, i) => window.oaMixerChannelStrip(mx, track, i))}

            {/* Click Strip */}
            {window.oaMixerClickStrip(mx)}

            {/* Reverb Returns — the wet paths everything sends into */}
            {window.OA_REVERB_UNITS.map((meta, u) => window.oaMixerReverbReturn(mx, meta, u))}

            {/* Tape Delay Returns — a tape echo per strip. TAPE opens the heads. */}
            {window.OA_DELAY_UNITS.map((meta, u) => window.oaMixerDelayReturn(mx, meta, u))}

            {/* Master Strip */}
            {window.oaMixerMasterStrip(mx)}

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
