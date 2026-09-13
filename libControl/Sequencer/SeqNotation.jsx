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

// The pattern as a drummer reads it: one percussion staff, drawn from the same
// grid the step buttons write.
//
// This OWNS the drawing only. It holds no state, schedules nothing and cannot
// change a pattern — the grid above is the instrument and this is the read-out.
// Anything editable here would be a second place a note can be written.
//
// Six placements are the published drum-set key and must not be moved to make
// room: kick F4, snare C5, closed hats G5, ride F5 (top line), crash A5 (first
// ledger above), toms E5 / D5 / A4. A drummer handed this staff has to read it
// without being told what it means. The kit's other ten voices have no standard
// placement, so they take the slots left over and are told apart by NOTEHEAD
// SHAPE as well as height — ✕ metal, △ wood and hand, ◇ unpitched electronic.
// The key under the staff names only the shapes actually sounding; a legend for
// voices nobody programmed is clutter.
//
// Durations are INFERRED from the gap to the next hit in the same voice, which
// is why a hat on every other step reads as eighths rather than as sixteenths
// with rests between them. The grid knows only "this step sounds"; notation has
// to say how long, and the gap is the only honest answer available. Rests are
// drawn only for a beat that voice does not touch at all — a partly filled beat
// is spelled by the spacing, since every sixteenth owns a column whether or not
// anything is in it.

// Staff position: 0 is the bottom line, +1 the space above it, so even numbers
// are lines and odd numbers are spaces. 8 is the top line.
const OA_STAFF = {
    'Kick':     { pos: 1,  head: 'normal',   dir: 'down', note: 'F4 · bass drum' },
    'Snare':    { pos: 5,  head: 'normal',   dir: 'up',   note: 'C5 · snare' },
    'Hi-Hat':   { pos: 9,  head: 'x',        dir: 'up',   note: 'G5 · closed hi-hat' },
    'Perc':     { pos: -1, head: 'diamond',  dir: 'up',   note: 'D4' },
    'Clap':     { pos: 11, head: 'diamond',  dir: 'up',   note: 'above the staff' },
    'Rim':      { pos: 4,  head: 'triangle', dir: 'up',   note: 'B4' },
    'Tom Lo':   { pos: 3,  head: 'normal',   dir: 'up',   note: 'A4 · floor tom' },
    'Tom Mid':  { pos: 6,  head: 'normal',   dir: 'up',   note: 'D5 · mid tom' },
    'Tom Hi':   { pos: 7,  head: 'normal',   dir: 'up',   note: 'E5 · high tom' },
    'Cymbal':   { pos: 10, head: 'x',        dir: 'up',   note: 'A5 · crash' },
    'Ride':     { pos: 8,  head: 'x',        dir: 'up',   note: 'F5 · ride' },
    'Cowbell':  { pos: 12, head: 'triangle', dir: 'up',   note: 'above the staff' },
    'Conga':    { pos: 0,  head: 'normal',   dir: 'up',   note: 'E4' },
    'Clave':    { pos: 2,  head: 'triangle', dir: 'up',   note: 'G4' },
    'Shaker':   { pos: 13, head: 'x',        dir: 'up',   note: 'above the staff' },
    'FX':       { pos: -2, head: 'diamond',  dir: 'up',   note: 'C4 · ledger below' },
    // The nine the 5 × 5 grid adds. They share heights with the voices they are
    // variants of and are told apart by shape — a second kick on a line of its
    // own would put the kit's foot in two places.
    'Kick 2':   { pos: 1,  head: 'triangle', dir: 'down', note: 'F4 · second kick' },
    'Snare 2':  { pos: 5,  head: 'diamond',  dir: 'up',   note: 'C5 · second snare' },
    'Open Hat': { pos: 9,  head: 'ox',       dir: 'up',   note: 'G5 · open hi-hat' },
    'Tom Fl':   { pos: 2,  head: 'normal',   dir: 'up',   note: 'G4 · floor tom' },
    'Crash':    { pos: 12, head: 'x',        dir: 'up',   note: 'above the staff' },
    'Splash':   { pos: 14, head: 'x',        dir: 'up',   note: 'above the staff' },
    'Block':    { pos: 3,  head: 'triangle', dir: 'up',   note: 'A4 · wood block' },
    'Triangle': { pos: 15, head: 'triangle', dir: 'up',   note: 'above the staff' },
    'Bongo':    { pos: 0,  head: 'triangle', dir: 'up',   note: 'E4' }
};

// Geometry. One sixteenth owns one column whether or not anything is in it, so
// the spacing across the staff is the spacing across the grid above and a run of
// hits has the same shape in both. The column is not the grid's 21px: the grid
// is centred in the panel and this is not, so the two can be read against each
// other but cannot be aligned pixel for pixel, and legibility wins.
const OA_SP = 12;                // staff line spacing
const OA_HALF = OA_SP / 2;       // one staff position
const OA_STEP_W = 26;            // one sixteenth
const OA_GUTTER = 52;            // clef and time signature
const OA_STEM = 3.2 * OA_SP;
const OA_HEAD_RX = 5.2;
const OA_ROOM = OA_STEM + 22;    // stem, beams and an accent past the last note

// The voice a track draws as. Past the named kit, pads repeat an octave up and
// are named "Kick 3", "Snare 3" and so on — those read as the voice they are a
// lap of rather than falling off the staff.
const oaVoiceOf = (name, idx) => {
    if (OA_STAFF[name]) return OA_STAFF[name];
    const base = String(name || '').replace(/\s+\d+$/, '');
    if (OA_STAFF[base]) return OA_STAFF[base];
    return { pos: ((idx % 9) * 2) - 2, head: 'diamond', dir: 'up', note: 'unplaced' };
};

// A notehead, centred on (x, y). The shape carries meaning — see the header.
const oaHead = (kind, x, y, key, color) => {
    const r = OA_HEAD_RX;
    if (kind === 'x' || kind === 'ox') {
        const s = r * 0.92;
        return (
            <g key={key}>
                <path d={`M${x - s},${y - s} L${x + s},${y + s} M${x - s},${y + s} L${x + s},${y - s}`}
                      stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
                {kind === 'ox' && <circle cx={x} cy={y - r * 2.3} r={r * 0.7} stroke={color} strokeWidth="1.2" fill="none" />}
            </g>
        );
    }
    if (kind === 'triangle') {
        return <path key={key} d={`M${x},${y - r * 1.15} L${x + r * 1.05},${y + r * 0.8} L${x - r * 1.05},${y + r * 0.8} Z`} fill={color} />;
    }
    if (kind === 'diamond') {
        return <path key={key} d={`M${x},${y - r * 1.05} L${x + r * 0.95},${y} L${x},${y + r * 1.05} L${x - r * 0.95},${y} Z`} fill={color} />;
    }
    return <ellipse key={key} cx={x} cy={y} rx={r} ry={r * 0.72} fill={color} transform={`rotate(-22 ${x} ${y})`} />;
};

// A quarter rest, drawn rather than typed: the Unicode rests live in a plane no
// system font here reliably carries, and a missing glyph on a staff reads as a
// bar of silence that is really a bar of tofu.
const oaQuarterRest = (x, y, key, color) => (
    <path key={key} fill={color} transform={`translate(${x} ${y}) scale(${OA_SP / 7})`}
          d="M-1.8,-9 L2.9,-3.4 L-1.1,1.0 L3.4,6.4 C1.3,4.9 -1.6,5.2 -2.6,6.9
             C-3.4,4.2 -1.2,1.5 1.1,0.9 L-3.0,-3.8 Z" />
);

// Two noteheads a STAFF POSITION apart cannot both sit on the stem — they would
// print on top of each other, and a crash, a hat and a ride are exactly that
// interval apart. The upper of the pair moves to the far side of the stem, which
// is what an engraver does with a second, and the pair reads as two notes.
const oaSpread = (notes, up) => {
    let prevPos = null;
    let prevOff = false;
    return [...notes].sort((a, b) => a.pos - b.pos).map((n) => {
        const off = prevPos !== null && n.pos - prevPos === 1 && !prevOff;
        prevPos = n.pos;
        prevOff = off;
        return Object.assign({}, n, { dx: off ? (up ? 2 * OA_HEAD_RX : -2 * OA_HEAD_RX) : 0 });
    });
};

window.SeqNotation = ({ tracks, pattern, steps, mutes, solos, isPlaying, currentStep }) => {
    const velOf = (c) => (typeof c === 'number' ? c : (c ? 100 : 0));
    const soloed = (solos || []).some(Boolean);
    // What the staff shows is what the desk will play. A muted track drawn
    // anyway is a note the reader hears in their head and not in the room.
    const audible = (i) => (soloed ? !!(solos && solos[i]) : !(mutes && mutes[i]));

    const INK = '#e6e8ec';
    const RULE = '#5c626d';
    const REST = '#9aa1ab';
    const FAINT = '#2b2f36';

    const beats = Math.max(1, Math.ceil(steps / 4));
    const width = OA_GUTTER + steps * OA_STEP_W + 20;
    const xOf = (step) => OA_GUTTER + step * OA_STEP_W + OA_STEP_W / 2;

    // Every sounding voice, gathered per step and split into the two stem
    // directions a drum staff uses: feet down, hands up. Two voices on one staff
    // is what lets a kick and a hat on the same sixteenth be two notes rather
    // than one impossible chord.
    const voices = { up: [], down: [] };
    const used = [];
    (tracks || []).forEach((t, i) => {
        if (!audible(i)) return;
        const row = (pattern && pattern[i]) || [];
        const hits = [];
        for (let s = 0; s < steps; s++) {
            const vel = velOf(row[s]);
            if (vel > 0) hits.push({ step: s, vel });
        }
        if (!hits.length) return;
        const voice = oaVoiceOf(t.name, i);
        used.push({ name: t.name, voice });
        hits.forEach((h) => voices[voice.dir].push(
            { step: h.step, vel: h.vel, pos: voice.pos, head: voice.head, name: t.name }));
    });

    // The staff is drawn as tall as the music needs and no taller. A pattern of
    // kick and snare has nothing above the top line, and reserving the sky for
    // a crash that was never programmed pushes the one thing there is to read
    // into a corner of a mostly empty box.
    const allPos = voices.up.concat(voices.down).map((n) => n.pos);
    const maxPos = Math.max.apply(null, [8].concat(allPos));
    const minPos = Math.min.apply(null, [0].concat(allPos));
    const originY = maxPos * OA_HALF + OA_ROOM;
    const height = originY - minPos * OA_HALF + OA_ROOM;
    const yOf = (pos) => originY - pos * OA_HALF;

    // Per direction, per step: the chord struck at that sixteenth.
    const chordsOf = (dir) => {
        const byStep = new Map();
        voices[dir].forEach((n) => {
            if (!byStep.has(n.step)) byStep.set(n.step, []);
            byStep.get(n.step).push(n);
        });
        return [...byStep.entries()].sort((a, b) => a[0] - b[0])
            .map(([step, notes]) => ({ step, notes }));
    };

    const marks = [];

    ['up', 'down'].forEach((dir) => {
        const up = dir === 'up';
        const chords = chordsOf(dir);

        // How long each chord is held. The gap to the next attack is all the
        // grid knows, and it is what a drummer would have written.
        const flagsOf = (i) => {
            const here = chords[i].step;
            const next = i + 1 < chords.length ? chords[i + 1].step : steps;
            const gap = next - here;
            return gap >= 4 ? 0 : gap >= 2 ? 1 : 2;
        };

        for (let b = 0; b < beats; b++) {
            const from = b * 4;
            const to = Math.min(from + 4, steps);
            const inBeat = [];
            chords.forEach((c, i) => {
                if (c.step >= from && c.step < to) inBeat.push({ step: c.step, notes: c.notes, flags: flagsOf(i) });
            });

            if (!inBeat.length) {
                if (chords.length) {
                    marks.push(oaQuarterRest(OA_GUTTER + (from + 2) * OA_STEP_W, yOf(up ? 6 : 2),
                        `rest-${dir}-${b}`, REST));
                }
                continue;
            }

            // A stem reaches from the far end of the chord to a tip clear of the
            // staff; a beamed group shares the outermost tip, because a straight
            // line is the only shape a beam is allowed to have here.
            const tips = inBeat.map((c) => {
                const poss = c.notes.map((n) => n.pos);
                const outer = up ? Math.max.apply(null, poss) : Math.min.apply(null, poss);
                return up ? yOf(outer) - OA_STEM : yOf(outer) + OA_STEM;
            });
            const beamY = up ? Math.min.apply(null, tips) : Math.max.apply(null, tips);
            const beamed = inBeat.length >= 2 && inBeat.every((c) => c.flags >= 1);
            const stemAt = (step) => xOf(step) + (up ? OA_HEAD_RX - 0.5 : -OA_HEAD_RX + 0.5);
            const TH = 3.2;

            inBeat.forEach((c, k) => {
                const poss = c.notes.map((n) => n.pos);
                const near = up ? yOf(Math.min.apply(null, poss)) : yOf(Math.max.apply(null, poss));
                const tipY = beamed ? beamY : tips[k];

                marks.push(<line key={`stem-${dir}-${c.step}`} x1={stemAt(c.step)} y1={near}
                                 x2={stemAt(c.step)} y2={tipY} stroke={INK} strokeWidth="1.5" />);

                // Unbeamed and shorter than a quarter: it carries its own flags.
                if (!beamed && c.flags > 0) {
                    for (let f = 0; f < c.flags; f++) {
                        const y0 = tipY + (up ? f * 6.5 : -f * 6.5);
                        const d = up
                            ? `M${stemAt(c.step)},${y0} c 7,3 8,9 5,15 c 1.5,-7 -1.5,-9 -5,-11 z`
                            : `M${stemAt(c.step)},${y0} c 7,-3 8,-9 5,-15 c 1.5,7 -1.5,9 -5,11 z`;
                        marks.push(<path key={`flag-${dir}-${c.step}-${f}`} d={d} fill={INK} />);
                    }
                }

                // One accent per chord, not one per notehead: a kick, a crash
                // and a hat struck together are one stroke of the bar, and three
                // stacked accents over it are the same mark printed three times.
                if (Math.max.apply(null, c.notes.map((n) => n.vel)) >= 85) {
                    const ay = up ? tipY - 9 : tipY + 9;
                    marks.push(<path key={`acc-${dir}-${c.step}`}
                                     d={`M${xOf(c.step) - 5},${ay - 3.2} L${xOf(c.step) + 5},${ay} L${xOf(c.step) - 5},${ay + 3.2}`}
                                     stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />);
                }
            });

            if (beamed) {
                const xs = inBeat.map((c) => stemAt(c.step));
                const x1 = Math.min.apply(null, xs);
                const x2 = Math.max.apply(null, xs);
                marks.push(<rect key={`beam1-${dir}-${b}`} x={x1 - 0.75} y={up ? beamY : beamY - TH}
                                 width={x2 - x1 + 1.5} height={TH} fill={INK} />);

                // The second beam spans only sixteenths that are actually
                // adjacent; a lone sixteenth inside the group gets a stub, the
                // way a dotted-eighth-sixteenth figure is written.
                const sixteenths = inBeat.map((c, idx) => ({ c, idx })).filter((e) => e.c.flags === 2);
                const y2 = up ? beamY + 5.5 : beamY - 5.5 - TH;
                const STUB = 8;
                let s0 = 0;
                while (s0 < sixteenths.length) {
                    let s1 = s0;
                    while (s1 + 1 < sixteenths.length && sixteenths[s1 + 1].c.step === sixteenths[s1].c.step + 1) s1++;
                    const a = stemAt(sixteenths[s0].c.step);
                    const z = stemAt(sixteenths[s1].c.step);
                    // A run of two or more spans them; a lone sixteenth gets a
                    // stub, pointing back at the note it came in late off.
                    const left = s1 > s0 ? Math.min(a, z) : (sixteenths[s0].idx > 0 ? a - STUB : a);
                    const right = s1 > s0 ? Math.max(a, z) : (sixteenths[s0].idx > 0 ? a : a + STUB);
                    marks.push(<rect key={`beam2-${dir}-${b}-${s0}`} x={left - 0.75} y={y2}
                                     width={Math.max(STUB, right - left) + 1.5} height={TH} fill={INK} />);
                    s0 = s1 + 1;
                }
            }

            // Noteheads last, so no stem is drawn across one.
            inBeat.forEach((c) => {
                oaSpread(c.notes, up).forEach((n) => {
                    const x = xOf(c.step) + n.dx;
                    const y = yOf(n.pos);
                    // Ledger lines, one per line-position between the staff and
                    // the note. Without them a shaker three positions above the
                    // top line is a mark in space with no height.
                    for (let p = 10; p <= n.pos; p += 2) {
                        marks.push(<line key={`led-${n.name}-${c.step}-${p}`} x1={x - 8} y1={yOf(p)} x2={x + 8} y2={yOf(p)}
                                         stroke={RULE} strokeWidth="1" />);
                    }
                    for (let p = -2; p >= n.pos; p -= 2) {
                        marks.push(<line key={`ledb-${n.name}-${c.step}-${p}`} x1={x - 8} y1={yOf(p)} x2={x + 8} y2={yOf(p)}
                                         stroke={RULE} strokeWidth="1" />);
                    }
                    marks.push(oaHead(n.head, x, y, `head-${n.name}-${c.step}`, INK));

                    // Velocity as a drummer writes it: an accent over a hard hit
                    // (above, per chord), brackets round a ghost. The grid holds
                    // 0-100 and notation has two words for it; these are them.
                    if (n.vel <= 35) {
                        marks.push(
                            <g key={`ghost-${n.name}-${c.step}`} stroke={RULE} strokeWidth="1.1" fill="none">
                                <path d={`M${x - 7.5},${y - 5} q -2.5,5 0,10`} />
                                <path d={`M${x + 7.5},${y - 5} q 2.5,5 0,10`} />
                            </g>
                        );
                    }
                });
            });
        }
    });

    return (
        <div style={{ marginTop: '8px' }}>
            <div className="chunky-scrollbar" style={{ overflowX: 'auto', background: '#0d0f13', border: '1px solid #262b33', borderRadius: '6px', padding: '6px 0' }}>
                <svg width={width} height={height} role="img"
                     aria-label={`This pattern in drum notation — ${beats} beat${beats === 1 ? '' : 's'}, ${used.length} voice${used.length === 1 ? '' : 's'}`}
                     style={{ display: 'block' }}>
                    {/* The beat under the notes. Faint, because it is the ruler
                        and not the music. */}
                    {[...Array(beats)].map((_, b) => (
                        <line key={`bt-${b}`} x1={OA_GUTTER + b * 4 * OA_STEP_W} y1={6}
                              x2={OA_GUTTER + b * 4 * OA_STEP_W} y2={height - 6}
                              stroke={FAINT} strokeWidth="1" />
                    ))}

                    {isPlaying && currentStep < steps && (
                        <rect x={OA_GUTTER + currentStep * OA_STEP_W} y={2}
                              width={OA_STEP_W} height={height - 4}
                              fill="rgba(var(--accent-rgb), 0.16)" />
                    )}

                    {[0, 2, 4, 6, 8].map((p) => (
                        <line key={`ln-${p}`} x1={6} y1={yOf(p)} x2={width - 8} y2={yOf(p)}
                              stroke={RULE} strokeWidth="1" />
                    ))}

                    {/* The percussion clef: two bars, and the only clef that
                        means "these are not pitches". */}
                    <rect x={15} y={yOf(6)} width={5} height={yOf(2) - yOf(6)} fill={INK} />
                    <rect x={25} y={yOf(6)} width={5} height={yOf(2) - yOf(6)} fill={INK} />

                    <text x={42} y={yOf(6) + 1} fill={INK} fontSize="19" fontWeight="700"
                          fontFamily="Georgia, 'Times New Roman', serif" textAnchor="middle">4</text>
                    <text x={42} y={yOf(2) + 1} fill={INK} fontSize="19" fontWeight="700"
                          fontFamily="Georgia, 'Times New Roman', serif" textAnchor="middle">4</text>

                    {/* A barline every four beats, and a heavy one at the end —
                        where the pattern goes back round is the one thing a step
                        grid never says out loud. */}
                    {[...Array(Math.max(0, Math.ceil(beats / 4) - 1))].map((_, m) => {
                        const x = OA_GUTTER + (m + 1) * 16 * OA_STEP_W;
                        return <line key={`bar-${m}`} x1={x} y1={yOf(8)} x2={x} y2={yOf(0)} stroke={RULE} strokeWidth="1.4" />;
                    })}
                    <line x1={width - 14} y1={yOf(8)} x2={width - 14} y2={yOf(0)} stroke={RULE} strokeWidth="1.2" />
                    <rect x={width - 11} y={yOf(8)} width={4} height={yOf(0) - yOf(8)} fill={RULE} />

                    {marks}
                </svg>
            </div>

            {/* The key. Only the voices actually written — a legend for the whole
                kit would be longer than most patterns. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '6px 2px 0', fontSize: '10px', color: '#8b929c' }}>
                {used.length === 0 && <span>Nothing programmed — paint a step above and it appears here.</span>}
                {used.map(({ name, voice }) => (
                    <span key={name} title={voice.note} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="13" height="13" style={{ overflow: 'visible' }}>
                            {oaHead(voice.head === 'ox' ? 'x' : voice.head, 6.5, 6.5, 'k', '#cfd4dc')}
                        </svg>
                        {name}
                    </span>
                ))}
            </div>
        </div>
    );
};
