interface CodeSnippet {
  code: string;
  id: number;
}

const CODE_ANIMATION_STEPS = {
  RENDER_UPDATE: 7,
  STATE_UPDATE: 3,
} as const;

export const getCounterSnippets = (internalCount: number): CodeSnippet[] => {
  const base = `
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>You collected {count} hazelnuts 🌰.</p>
      <button onClick={() => setCount(count + 1)}>
        +1
      </button>
    </div>
  );
}`.trim();

  const stateUpdate = `
function Counter() {
  const [count, setCount] = useState(0); // count = ${internalCount}
  return (
    <div>
      <p>You collected {count} hazelnuts 🌰.</p>
      <button onClick={() => setCount(count + 1)}>
        +1
      </button>
    </div>
  );
}`.trim();

  const renderUpdate = `
function Counter() {
  const [count, setCount] = useState(0); // count = ${internalCount}
  return (
    <div>
      <p>You collected {count} hazelnuts 🌰.</p> {/* count = ${internalCount} */}
      <button onClick={() => setCount(count + 1)}>
        +1
      </button>
    </div>
  );
}`.trim();

  return [
    { code: base, id: 1 },
    ...new Array(CODE_ANIMATION_STEPS.STATE_UPDATE).fill({
      code: stateUpdate,
      id: 2,
    }),
    ...new Array(CODE_ANIMATION_STEPS.RENDER_UPDATE).fill({
      code: renderUpdate,
      id: 3,
    }),
  ];
};
