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
 * Header: MixerChannelStrip.jsx
 * Purpose: One channel strip of the Mixer: on/solo, meter and fader, the sound, the pedal, gate, EQ, compressor, pan and the sends.
 * Description:  Drawn by Mixer.jsx, which owns every piece of state, every ref
 *   and the meter loop, and hands them over as one object (`mx`). A plain
 *   function, not a component: it is called where its markup used to sit, so
 *   the element tree the desk renders is unchanged.
 */

const oaMixerChannelStrip = (mx, track, i) => {
    const {
        FX, PALETTE, compPad, drivePad, eqPad, gatePad, gateRefs, grRefs, hasSample, isAnySolo,
        meterRefs, mutes, panLabel, samplerPad, sendOf, setCompPad, setDrivePad, setEqPad,
        setGatePad, setSamplerPad, setSend, setSynthPad, setTrackPan, setTrackVol, solos, synthPad,
        toggleMute, toggleSolo, trackPan, trackVol, veil,
    } = mx;
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
};

window.oaMixerChannelStrip = oaMixerChannelStrip;
