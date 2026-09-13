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

// Hz <-> MIDI note. A440, and midiNoteName's octave numbering (C3 = 60) so a
// pitch reads the same here as it does on a pad.
const hzToMidi = (hz) => 69 + 12 * Math.log2(Math.max(1e-6, hz) / 440);
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const NOTE_COLOR = '#4fc3f7';

// A knob turns continuously; a parameter does not. Land the value back on the
// grid its schema declares, and clear the float dust a 0.01 step leaves behind —
// 0.30000000000000004 is a real number this arrives at otherwise.
const quantize = (spec, v) => {
    const step = spec.step || 0.01;
    const dp = (String(step).split('.')[1] || '').length;
    const snapped = spec.min + Math.round((v - spec.min) / step) * step;
    return Math.max(spec.min, Math.min(spec.max, Number(snapped.toFixed(dp))));
};

const fmtValue = (spec, v) => (spec.step < 1 ? Number(v).toFixed(2) : String(Math.round(v)));

// One parameter: its name above, the knob, its value below. The layout every
// panel in the rack uses, so a synth voice is shaped with the same hand
// movements as a compressor or a tape machine.
const SynthKnob = ({ label, display, unit, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: 0 }}>
        <span style={{
            fontSize: '8px', color: '#aaa', letterSpacing: '0.6px', textAlign: 'center',
            lineHeight: 1.2, minHeight: '19px', display: 'flex', alignItems: 'flex-end'
        }}>
            {label}
        </span>
        {children}
        <span style={{ fontSize: '9.5px', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {display}
            {unit ? <span style={{ color: '#777', fontSize: '8px' }}> {unit}</span> : null}
        </span>
    </div>
);

// The chromatic partner to a Hz knob. Same underlying value, stepped in
// semitones — snappy where the Hz knob is granular. Its range is clamped to
// whole semitones inside the parameter's own min/max so it can never push the
// value out of bounds.
const NoteKnob = ({ spec, value, onChange, audition }) => {
    const lo = Math.ceil(hzToMidi(spec.min));
    const hi = Math.floor(hzToMidi(spec.max));
    if (hi <= lo) return null;                       // too narrow to be a scale
    const midi = hzToMidi(value);
    // Round for display so a Hz nudge does not show a fractional note, but keep
    // the knob on the true position — otherwise it jumps under the finger.
    const nearest = Math.round(midi);
    const inTune = Math.abs(midi - nearest) < 0.005;
    const name = window.midiNoteName ? window.midiNoteName(nearest) : String(nearest);
    return (
        <div onPointerUp={audition} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <window.SvgKnob
                value={Math.min(hi, Math.max(lo, midi))} min={lo} max={hi}
                defaultVal={spec.def != null ? Math.min(hi, Math.max(lo, Math.round(hzToMidi(spec.def)))) : lo}
                color={NOTE_COLOR} size={26}
                label={`${spec.label} note`} display={name}
                onChange={(m) => onChange(midiToHz(Math.round(m)))}
            />
            <span style={{ fontSize: '8px', color: inTune ? NOTE_COLOR : '#5a7d8c', fontVariantNumeric: 'tabular-nums' }}>
                {name}{!inTune ? <span style={{ color: '#666' }}> ~</span> : null}
            </span>
        </div>
    );
};

// The SYNTH panel for one mixer channel. Every control is generated from the
// engine's parameter schema, so adding a knob to an engine adds it here too.
window.DrumSynthEditor = ({ idx, name, onClose, oaPopped }) => {
    const panel = window.useOaPanel({
        id: `synth-${idx}`, title: `${String(idx + 1).padStart(2, '0')} ${name} — SYNTH`, copy: oaPopped,
        render: () => <window.DrumSynthEditor idx={idx} name={name} onClose={onClose} oaPopped />,
    });
    // The patch and the faceplate both come through the plugin interface: this
    // panel no longer knows that a drum voice is stored in OA_DRUM_SYNTH or that
    // its knobs are declared on OA_SYNTH_ENGINES. It asks for unit `idx` of the
    // 'drumsynth' plugin and renders what it is handed — which is what lets the
    // same panel work for an engine added later.
    const patch = window.useOaState('drumsynth', idx);
    // What knobs this pad's engine has, and which may be written. Re-projected
    // when the engine changes, which for the drum synth is often — its control
    // list is not fixed. PLAN-18.12.
    const surface = window.useOaConsoleSurface('drumsynth', idx);
    const specs = surface.list;

    // Every edit writes straight through to the live patch and localStorage, so
    // the only way back is a copy taken before any of it happened. Re-taken when
    // the panel switches voice, not on every render.
    const opened = React.useRef(null);
    React.useEffect(() => {
        opened.current = window.oaPluginState('drumsynth', idx);
    }, [idx]);

    const abort = () => {
        if (!opened.current) return;
        window.oaSetSynthPatch(idx, opened.current);
    };

    if (!patch || !specs.length) return null;
    const engine = window.OA_SYNTH_ENGINES[patch.engine];
    if (!engine) return null;

    const dirty = !!opened.current && JSON.stringify(opened.current) !== JSON.stringify(patch);

    const set = (key, value) => window.oaPluginSet('drumsynth', idx, key, value);
    const audition = () => window.oaTriggerDrum(idx, 0.9);

    const label = { fontSize: '10px', color: '#aaa', letterSpacing: '0.3px' };

    return panel.frame(
        <div {...panel.frameProps({
            position: 'fixed', bottom: '46px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--panel)', border: '1px solid #444', borderRadius: '8px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', zIndex: 1200,
            padding: '14px 16px', width: 'min(560px, 92vw)', maxHeight: '70vh', overflowY: 'auto'
        })}>
            <div {...panel.handle({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' })}>
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px' }}>
                    {String(idx + 1).padStart(2, '0')} {name} — SYNTH
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    <window.SeqButton label={panel.popLabel} onClick={panel.togglePop}
                        title={panel.popTitle}
                        style={{ padding: '4px 10px' }} />
                    <window.SeqButton label="▶ Audition" onClick={audition} color="#388e3c" textColor="#fff"
                        style={{ padding: '4px 10px', border: 'none' }} />
                    <window.SeqButton label="⟲ Abort" onClick={abort} disabled={!dirty}
                        color={dirty ? '#b71c1c' : undefined} textColor={dirty ? '#fff' : undefined}
                        title="Discard every change made since this panel was opened"
                        style={{ padding: '4px 10px', border: 'none' }} />
                    <window.SeqButton label="↺ Reset" onClick={() => window.oaResetSynthPatch(idx)}
                        title="Back to the factory patch for this voice"
                        style={{ padding: '4px 10px' }} />
                    <window.SeqButton label="✖ Close" onClick={onClose} style={{ padding: '4px 10px' }} />
                </div>
            </div>

            {/* VOICE comes before ENGINE on purpose. Picking a ready-made voice
                is what almost everyone wants — it sets the engine AND all of its
                parameters at once — while picking a bare engine leaves you at
                that engine's defaults with every knob still to set. Grouped by
                what the voice is FOR, because a flat list of seventy is a wall. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 6px' }}>
                <span style={label}>Voice</span>
                <select
                    value=""
                    onChange={(e) => { if (e.target.value) window.oaSetSynthVoice(idx, e.target.value); }}
                    style={{ background: '#222', color: 'var(--accent)', border: '1px solid #444', borderRadius: '3px', fontSize: '11px', padding: '3px 6px', maxWidth: '200px' }}
                >
                    <option value="">Load a voice…</option>
                    {[...new Set(window.oaSynthLibrary().map((v) => v.group))].map((group) => (
                        <optgroup key={group} label={group}>
                            {window.oaSynthLibrary().filter((v) => v.group === group).map((v) => (
                                <option key={v.key} value={v.key}>{v.name}</option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <span style={{ fontSize: '10px', color: '#777', fontStyle: 'italic' }}>
                    {window.oaSynthLibrary().length} in the library
                </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 10px' }}>
                <span style={label}>Engine</span>
                <select
                    value={patch.engine}
                    onChange={(e) => set('engine', e.target.value)}
                    style={{ background: '#222', color: 'var(--accent)', border: '1px solid #444', borderRadius: '3px', fontSize: '11px', padding: '3px 6px' }}
                >
                    {Object.entries(window.oaPluginPresets('drumsynth')).map(([k, p]) => (
                        <option key={k} value={k}>{p.label}</option>
                    ))}
                </select>
                <span style={{ fontSize: '10px', color: '#777', fontStyle: 'italic' }}>{engine.blurb}</span>
            </div>

            {/* A panel of knobs rather than a column of sliders. A row of
                faders is a form; a bank of knobs is an instrument, and it fits
                a phone — eight controls in two rows instead of eight rows that
                scroll. A Hz parameter carries its semitone knob inside its own
                cell, which is the pairing the two rows of sliders used to make
                by sitting next to each other. */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
                gap: '10px 4px', alignItems: 'start', justifyItems: 'center'
            }}>
                {specs.map((spec) => {
                    const key = spec.key;
                    const v = spec.value;
                    // A choice. The surface projects a name-valued one onto its
                    // positions and writes the NAME back, so this is the same
                    // <select> for both kinds and the panel never learns which
                    // it is looking at.
                    if (spec.type === 'enum') {
                        return (
                            <SynthKnob key={key} label={spec.label} display="">
                                <select
                                    value={Math.round(v)}
                                    onChange={(e) => spec.set(Number(e.target.value))}
                                    disabled={!spec.writable}
                                    style={{ width: '74px', background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: '3px', fontSize: '10px', padding: '3px 2px' }}
                                >
                                    {(spec.values || []).map((o, i) => (
                                        <option key={o} value={Math.round(spec.min) + i}>{o}</option>
                                    ))}
                                </select>
                            </SynthKnob>
                        );
                    }
                    return (
                        <SynthKnob key={key} label={spec.label} display={fmtValue(spec, v)} unit={spec.unit}>
                            {/* Auditioning on release is what the fader did on
                                mouse-up. The knob captures the pointer, so the
                                release lands on the knob and bubbles to here. */}
                            <div onPointerUp={audition}>
                                <window.SvgKnob
                                    value={v} min={spec.min} max={spec.max} defaultVal={spec.def}
                                    size={40} label={spec.label}
                                    display={`${fmtValue(spec, v)}${spec.unit ? ' ' + spec.unit : ''}`}
                                    onChange={spec.writable ? (nv) => spec.set(quantize(spec, nv)) : undefined}
                                />
                            </div>
                            {spec.unit === 'Hz' && (
                                <NoteKnob spec={spec} value={v}
                                    onChange={spec.writable ? (hz) => spec.set(hz) : undefined}
                                    audition={audition} />
                            )}
                        </SynthKnob>
                    );
                })}
            </div>
        </div>
    );
};
