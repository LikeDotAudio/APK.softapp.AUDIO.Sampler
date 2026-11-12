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
 * Header: MixerReturnStrips.jsx
 * Purpose: The Mixer's effect-return strips: one per reverb, one per tape delay.
 * Description:  Drawn by Mixer.jsx, which owns every piece of state, every ref
 *   and the meter loop, and hands them over as one object (`mx`). A plain
 *   function, not a component: it is called where its markup used to sit, so
 *   the element tree the desk renders is unchanged.
 */

// Reverb Returns — the wet paths everything sends into
const oaMixerReverbReturn = (mx, meta, u) => {
    const {
        FX, fxHead, fxMeters, setVarcUnit, varcUnit, veil,
    } = mx;
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
};

window.oaMixerReverbReturn = oaMixerReverbReturn;

// Tape Delay Returns — a tape echo per strip. TAPE opens the heads.
const oaMixerDelayReturn = (mx, meta, u) => {
    const {
        FX, chorusUnit, fxHead, fxMeters, setChorusUnit, setTapeUnit, tapeUnit, veil,
    } = mx;
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
};

window.oaMixerDelayReturn = oaMixerDelayReturn;
