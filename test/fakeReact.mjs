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
 * Header: fakeReact.mjs
 * Purpose: Enough React to render a panel once and see whether it throws.
 * Description: The editors are the half of this codebase Babel checks least.
 *   It parses them, so a syntax error is caught; it says nothing about a
 *   variable that no longer exists, a hook called after an early return, or a
 *   prop that was renamed on one side of a call and not the other. Those all
 *   look fine right up until the panel is opened.
 *
 *   This is not React. It does not reconcile, diff, or update — it calls a
 *   component function once with a real hook implementation underneath and
 *   hands back the element tree. That is exactly enough to prove a panel can be
 *   opened, which is the failure this is here to catch.
 *
 *   HOOK ORDER IS ENFORCED, deliberately. The hooks are stored positionally,
 *   the way React stores them, so a component that calls a different number of
 *   hooks on its second render is caught here rather than in the browser.
 */

/** A React-shaped object good for exactly one render pass at a time. */
export function makeReact() {
    let hooks = [];
    let cursor = 0;
    let pending = [];        // effects queued this pass
    let rendering = false;

    const slot = (init) => {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init;
        return i;
    };

    const React = {
        Fragment: Symbol('Fragment'),

        createElement(type, props, ...children) {
            return { type, props: props || {}, children: children.flat(Infinity) };
        },

        useState(init) {
            const i = slot(init);
            return [hooks[i], (next) => {
                hooks[i] = typeof next === 'function' ? next(hooks[i]) : next;
            }];
        },

        useReducer(reducer, init) {
            const i = slot(init);
            return [hooks[i], (action) => { hooks[i] = reducer(hooks[i], action); }];
        },

        useRef(init) {
            const i = slot(() => ({ current: init }));
            return hooks[i];
        },

        useMemo(fn, deps) {
            const i = slot(() => ({ deps: null, value: undefined, first: true }));
            const cell = hooks[i];
            if (cell.first || !deps || !cell.deps || deps.some((d, k) => d !== cell.deps[k])) {
                cell.value = fn();
                cell.deps = deps;
                cell.first = false;
            }
            return cell.value;
        },

        useCallback(fn) { return fn; },

        useEffect(fn) {
            // Queued, not run: an effect that starts a rAF loop would otherwise
            // run before the tree exists. runEffects() fires them on demand.
            cursor++;
            pending.push(fn);
        },

        useLayoutEffect(fn) { React.useEffect(fn); },

        useContext() { return undefined; },
        useId() { return 'oa-test-id'; },
    };

    return {
        React,

        /**
         * Render one component. `hookState` may be carried over from a previous
         * render of the SAME component to check that the hook order is stable —
         * pass the object returned here back in.
         */
        render(Component, props, hookState) {
            if (rendering) throw new Error('render() called re-entrantly');
            rendering = true;
            hooks = hookState ? hookState.hooks : [];
            cursor = 0;
            pending = [];
            try {
                const tree = Component(props || {});
                return { tree, hooks, hookCount: cursor, effects: pending.slice() };
            } finally {
                rendering = false;
            }
        },

        /** Fire the effects a render queued, and hand back their cleanups. */
        runEffects(result) {
            return result.effects.map((f) => f()).filter((c) => typeof c === 'function');
        },
    };
}

/** Walk an element tree and count the nodes — proof something was produced. */
export function countNodes(node) {
    if (node == null || typeof node === 'boolean') return 0;
    if (typeof node !== 'object') return 1;
    if (Array.isArray(node)) return node.reduce((a, n) => a + countNodes(n), 0);
    return 1 + (node.children || []).reduce((a, n) => a + countNodes(n), 0);
}
