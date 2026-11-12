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
 * Header: MixerMasterStrips.jsx
 * Purpose: The Mixer's click strip and its master strip (meters, fader and the buss compressor across the mix).
 * Description:  Drawn by Mixer.jsx, which owns every piece of state, every ref
 *   and the meter loop, and hands them over as one object (`mx`). A plain
 *   function, not a component: it is called where its markup used to sit, so
 *   the element tree the desk renders is unchanged.
 */

// Click Strip
const oaMixerClickStrip = (mx) => {
    const {
        clickMeterRef, clickVol, recording, setClickVol,
    } = mx;
    return (
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
    );
};

window.oaMixerClickStrip = oaMixerClickStrip;

// Master Strip
const oaMixerMasterStrip = (mx) => {
    const {
        FX, bussGrRef, bussOpen, clearSolos, isAnySolo, masterRefs, masterVol, recording,
        setBussOpen, setMasterVol, veil,
    } = mx;
    return (
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
    );
};

window.oaMixerMasterStrip = oaMixerMasterStrip;
