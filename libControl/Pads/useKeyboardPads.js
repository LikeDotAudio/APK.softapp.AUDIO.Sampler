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

window.useKeyboardPads = (triggerPadKey) => {
    // The numpad is laid out like the left 3 columns of the pad grid, so it
    // triggers the pads that sit in the same physical positions — including the
    // operator row, which sits above 7 8 9 just as pads 13-15 sit above 9-11:
    //
    //     pads            numpad
    //   13 14 15 16   ->   / * -
    //    9 10 11 12   ->   7 8 9 +
    //    5  6  7  8   ->   4 5 6
    //    1  2  3  4   ->  0 1 2 3
    //
    // Hitting numpad 7 fires the pad up and left, exactly where your eye is.
    // + is a tall key spanning two rows; it takes the upper one, pad 12.
    //
    // The bottom row is the exception: 0 joins 1 2 3 so the four keys under
    // your thumb cover the whole kit -- 0 kick, 1 snare, 2 hat, 3 perc.
    //
    // Held as grid POSITIONS rather than pad numbers: on a 5 x 5 the numpad
    // still covers the bottom-left corner of the grid, which is where the keys
    // physically are. Each entry is [row, col] counting from the bottom left.
    const NUMPAD_TO_CELL = {
        0: [0, 0], 1: [0, 1], 2: [0, 2], 3: [0, 3],
        4: [1, 0], 5: [1, 1], 6: [1, 2],
        7: [2, 0], 8: [2, 1], 9: [2, 2],
    };
    const NUMPAD_OP_TO_CELL = {
        NumpadDivide: [3, 0],
        NumpadMultiply: [3, 1],
        NumpadSubtract: [3, 2],
        NumpadAdd: [2, 3],
    };

    // The number ROW is a straight line, not a grid, so it keeps running along
    // the pads in order, starting from 0: 0 fires pad 1, 1 fires pad 2, on up
    // to 9 firing pad 10.
    const DIGIT_TO_PADNUM = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10 };

    React.useEffect(() => {
        const onKey = (e) => {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            const op = NUMPAD_OP_TO_CELL[e.code];
            const m = /^(Numpad|Digit)([0-9])$/.exec(e.code || '');
            if (!op && !m) return;
            const cell = op || (m[1] === 'Numpad' ? NUMPAD_TO_CELL[parseInt(m[2], 10)] : null);
            const padNum = cell
                ? window.oaPadAt(cell[0], cell[1])
                : DIGIT_TO_PADNUM[parseInt(m[2], 10)];
            if (!padNum || padNum > window.OA_PAD_COUNT) return;
            e.preventDefault();
            triggerPadKey(padNum - 1, padNum);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [triggerPadKey]);
};
