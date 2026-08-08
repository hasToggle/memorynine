"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Bug, ListTodo, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";

// --- Constants ---
const GRID_OPACITY = 0.03;

// Discovery stage thresholds
const STAGE_INITIAL = 1;
const STAGE_EXPLORING = 2;
const STAGE_CONFIDENT = 3;
const STAGE_CHALLENGE = 4;
const STAGE_REVELATION = 5;
const STAGE_INSIGHT = 6;

const MIN_BUGS_FOR_STAGE_2 = 3;
const MIN_BUGS_FOR_STAGE_3 = 6;
const MIN_INTERACTIONS_FOR_EXPLORING = 3;
const MIN_BUGS_FOR_EXPLORING = 1;
const TOTAL_STAGES = 6;
const STAGE_NUMBERS = Array.from({ length: TOTAL_STAGES }, (_, i) => i + 1);

// Click thresholds for stage progression
const CLICKS_FOR_REVELATION = 1;
const CLICKS_FOR_INSIGHT = 2;

// --- User Stories (hidden until revealed) ---
const USER_STORIES = [
  {
    criteria: [
      { id: "AC1", text: "Input accepts text up to 200 characters" },
      { id: "AC2", text: "Empty input shows validation error" },
      { id: "AC3", text: "Leading/trailing whitespace is trimmed" },
      { id: "AC4", text: "Pressing Enter submits the form" },
    ],
    id: "US-001",
    title: "As a user, I can add a text item to my list",
  },
  {
    criteria: [
      { id: "AC1", text: "Items display in order added (newest last)" },
      { id: "AC2", text: "Special characters are safely displayed" },
      { id: "AC3", text: "Long items are truncated with ellipsis" },
    ],
    id: "US-002",
    title: "As a user, I can see my list of items",
  },
  {
    criteria: [
      { id: "AC1", text: "Each item has a delete button" },
      { id: "AC2", text: "Clicking delete removes item immediately" },
      { id: "AC3", text: "No confirmation required (per UX decision)" },
    ],
    id: "US-003",
    title: "As a user, I can delete items from my list",
  },
  {
    criteria: [
      { id: "AC1", text: "All interactive elements are keyboard accessible" },
      { id: "AC2", text: "Screen readers can navigate the list" },
      { id: "AC3", text: "Focus moves appropriately after actions" },
    ],
    id: "US-004",
    title: "As a user, I expect standard accessibility",
  },
  {
    criteria: [
      { id: "AC1", text: "Items are saved to localStorage" },
      { id: "AC2", text: "Refreshing page restores my list" },
    ],
    id: "US-005",
    title: "As a user, my data persists",
  },
];

// --- Sub-Components ---

interface BugEntry {
  id: string;
  text: string;
}

function BugRow({
  bug,
  onRemove,
}: {
  bug: BugEntry;
  onRemove: (id: string) => void;
}) {
  const remove = useCallback(() => onRemove(bug.id), [bug.id, onRemove]);

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="group flex items-start gap-2 rounded-lg border border-white/5 bg-white/5 p-2"
      exit={{ opacity: 0, x: -20 }}
      initial={{ opacity: 0, x: -20 }}
      layout
    >
      <Bug className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
      {/* Bug: whitespace-nowrap causes long descriptions to overflow */}
      <span className="flex-1 whitespace-nowrap text-white/70 text-xs">
        {bug.text}
      </span>
      <button
        className="opacity-0 transition-opacity group-hover:opacity-100"
        onClick={remove}
        type="button"
      >
        <Trash2 className="h-3 w-3 text-white/30 hover:text-red-400" />
      </button>
    </motion.div>
  );
}

function BugLogPanel({
  bugs,
  onAddBug,
  onRemoveBug,
}: {
  bugs: BugEntry[];
  onAddBug: (bug: string) => void;
  onRemoveBug: (id: string) => void;
}) {
  const [input, setInput] = useState("");

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setInput(event.target.value),
    []
  );

  const handleSubmit = useCallback(() => {
    if (input.trim()) {
      onAddBug(input);
      setInput("");
    }
  }, [input, onAddBug]);

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 font-bold text-white/40 text-xs uppercase tracking-widest">
        Your Bug Report
      </h2>

      <div className="mb-4 flex gap-2">
        {/* Bug: Intentional typo in placeholder - "you" instead of "your" */}
        <input
          className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
          onChange={handleChange}
          placeholder="Log your findings..."
          type="text"
          value={input}
        />
        <Button
          className="rounded-lg border-white/20 bg-white/5 text-white hover:bg-white/10"
          onClick={handleSubmit}
          size="sm"
          variant="outline"
        >
          <Plus size={16} />
        </Button>
      </div>

      {/* Bug: overflow-hidden instead of overflow-auto, and whitespace-nowrap causes overflow */}
      <div className="flex-1 space-y-2 overflow-hidden">
        <AnimatePresence mode="popLayout">
          {bugs.map((bug) => (
            <BugRow bug={bug} key={bug.id} onRemove={onRemoveBug} />
          ))}
        </AnimatePresence>

        {bugs.length === 0 && (
          <div className="flex h-32 items-center justify-center text-white/20 text-xs">
            No bugs logged yet
          </div>
        )}
      </div>

      <div className="mt-4 border-white/10 border-t pt-4">
        <div className="text-center font-mono text-2xl text-white">
          {bugs.length}
        </div>
        <div className="text-center text-[10px] text-white/40 uppercase tracking-wider">
          Bugs Found
        </div>
      </div>
    </div>
  );
}

interface TodoItem {
  id: string;
  text: string;
}

function TodoRow({
  item,
  onDelete,
}: {
  item: TodoItem;
  onDelete: (id: string) => void;
}) {
  const remove = useCallback(() => onDelete(item.id), [item.id, onDelete]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3"
      exit={{ opacity: 0, scale: 0.8 }}
      initial={{ opacity: 0, y: -10 }}
      layout
    >
      {/* Bug: No truncation, special chars render raw, broken tabindex */}
      <span
        className="flex-1 text-sm text-white/80"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Intentional bug for demo
        dangerouslySetInnerHTML={{ __html: item.text }}
      />
      <button
        className="opacity-0 transition-opacity group-hover:opacity-100"
        onClick={remove}
        tabIndex={-1} // Bug: broken tab order
        type="button"
      >
        <Trash2 className="h-4 w-4 text-white/30 hover:text-red-400" />
      </button>
    </motion.div>
  );
}

function BuggyTodoDemo({ onInteraction }: { onInteraction: () => void }) {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [input, setInput] = useState("");

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setInput(event.target.value),
    []
  );

  // Bug: No validation, no trimming, doesn't clear input
  const handleSubmit = useCallback(() => {
    const newItem: TodoItem = { id: crypto.randomUUID(), text: input };
    setItems([...items, newItem]); // Bug: doesn't validate empty, doesn't trim, doesn't clear
    onInteraction();
  }, [input, items, onInteraction]);

  // Bug: No confirmation, no undo, broken tab order after delete
  const handleDelete = useCallback(
    (id: string) => {
      setItems(items.filter((item) => item.id !== id));
      onInteraction();
    },
    [items, onInteraction]
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="relative">
        <div className="absolute -inset-4 rounded-3xl bg-linear-to-br from-white/5 to-transparent" />
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-6">
          <h3 className="mb-4 font-medium text-white/80">My Todo List</h3>

          {/* Input area */}
          <div className="mb-4 flex gap-2">
            {/* Bug: No Enter key support, no maxLength */}
            <input
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
              onChange={handleChange}
              placeholder="Add an item..."
              type="text"
              value={input}
            />
            <Button
              className="rounded-lg border-white/20 bg-white/5 text-white hover:bg-white/10"
              onClick={handleSubmit}
              variant="outline"
            >
              Add
            </Button>
          </div>

          {/* List area - Bug: No empty state, long items overflow */}
          <div className="min-h-[200px] space-y-2">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <TodoRow item={item} key={item.id} onDelete={handleDelete} />
              ))}
            </AnimatePresence>

            {/* Bug: No empty state message */}
          </div>

          {/* Bug: No item count shown */}
        </div>
      </div>
    </div>
  );
}

function UserStoryCard({
  story,
  expanded,
  onToggle,
}: {
  story: (typeof USER_STORIES)[0];
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const toggle = useCallback(() => onToggle(story.id), [onToggle, story.id]);

  return (
    <button
      className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-white/20"
      onClick={toggle}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-[10px] text-blue-400">
          {story.id}
        </span>
        <span className="text-white/60 text-xs">{story.title}</span>
      </div>
      <AnimatePresence>
        {expanded ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
          >
            <ul className="mt-2 space-y-1 border-white/10 border-t pt-2">
              {story.criteria.map((ac) => (
                <li
                  className="flex items-start gap-2 text-white/50 text-xs"
                  key={ac.id}
                >
                  <span className="font-mono text-white/30">{ac.id}:</span>
                  {ac.text}
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </button>
  );
}

function DiscoveryPanel({
  stage,
  onChallengeClick,
  challengeClicks,
}: {
  stage: number;
  onChallengeClick: () => void;
  challengeClicks: number;
}) {
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const toggleStory = useCallback(
    (id: string) => setExpandedStory((current) => (current === id ? null : id)),
    []
  );

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto">
      {/* Stage 1: Initial prompt */}
      {stage >= STAGE_INITIAL && stage < STAGE_REVELATION && (
        <motion.div
          animate={{ opacity: 1 }}
          className="rounded-xl border border-white/10 bg-white/5 p-4"
          initial={{ opacity: 0 }}
        >
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-cyan-400" />
            <span className="text-sm text-white/80">Your Mission</span>
          </div>
          <p className="mt-2 text-white/60 text-xs leading-relaxed">
            This is a simple todo list. Your job:{" "}
            <span className="text-white/80">find the bugs.</span>
          </p>
          <p className="mt-1 text-[10px] text-white/40">
            Add some items. Delete some. Try to break it.
          </p>
        </motion.div>
      )}

      {/* Stage 2: Encouraging */}
      {stage >= STAGE_EXPLORING && stage < STAGE_CONFIDENT && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/10 bg-white/5 p-4"
          initial={{ opacity: 0, y: 10 }}
        >
          <p className="text-sm text-white/80">
            Good start! Keep going—there are more.
          </p>
          <p className="mt-2 text-[10px] text-white/40">
            Hint: Try edge cases like empty input, very long text, special
            characters...
          </p>
        </motion.div>
      )}

      {/* Stage 3: Reflective question */}
      {stage >= STAGE_CONFIDENT && stage < STAGE_REVELATION && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
          initial={{ opacity: 0, y: 10 }}
        >
          <p className="text-sm text-white/80">
            You&apos;ve found several issues. But here&apos;s a question...
          </p>
          <p className="mt-2 font-medium text-amber-400 text-sm italic">
            &ldquo;How do you know these are bugs and not features?&rdquo;
          </p>
        </motion.div>
      )}

      {/* Stage 4: Challenge button */}
      {stage >= STAGE_CHALLENGE && stage < STAGE_REVELATION && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
          initial={{ opacity: 0, y: 10 }}
        >
          <Button
            className="w-full rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={onChallengeClick}
            variant="outline"
          >
            {challengeClicks === 0
              ? "I've found all the bugs"
              : "Yes, I'm sure"}
          </Button>
          {challengeClicks === 1 && (
            <motion.p
              animate={{ opacity: 1 }}
              className="text-center text-[10px] text-white/40"
              initial={{ opacity: 0 }}
            >
              Are you sure? How do you know what ALL the bugs are?
            </motion.p>
          )}
        </motion.div>
      )}

      {/* Stage 5: User Stories Revelation */}
      {stage >= STAGE_REVELATION && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
        >
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <h3 className="font-bold text-blue-400 text-sm">
              Surprise! Here are the actual user stories.
            </h3>
            <p className="mt-1 text-[10px] text-white/50">
              This is what you should have been testing against.
            </p>
          </div>

          <div className="space-y-2">
            {USER_STORIES.map((story) => (
              <UserStoryCard
                expanded={expandedStory === story.id}
                key={story.id}
                onToggle={toggleStory}
                story={story}
              />
            ))}
          </div>

          {/* Button to continue to insight */}
          {stage === STAGE_REVELATION && (
            <Button
              className="w-full rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10"
              onClick={onChallengeClick}
              variant="outline"
            >
              Finish Bug Hunt
            </Button>
          )}
        </motion.div>
      )}

      {/* Stage 6: The Insight */}
      {stage >= STAGE_INSIGHT && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/20 bg-linear-to-br from-white/10 to-white/5 p-4"
          initial={{ opacity: 0, y: 20 }}
        >
          <div className="mb-2 text-[10px] text-white/40 uppercase tracking-wider">
            The Insight
          </div>
          <p className="font-medium text-sm text-white/90 italic leading-relaxed">
            &ldquo;QA isn&apos;t about finding bugs—it&apos;s about verifying
            requirements. Without user stories, you&apos;re testing against your
            assumptions.&rdquo;
          </p>
          <div className="mt-4 space-y-2 text-sm text-white/50">
            <p>Before testing, always ask:</p>
            <ul className="ml-3 list-disc space-y-1">
              <li>&ldquo;What should happen when...?&rdquo;</li>
              <li>&ldquo;Is this behavior expected?&rdquo;</li>
              <li>&ldquo;Who decides what&apos;s correct?&rdquo;</li>
            </ul>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// --- Main Component ---

export default function QAStoriesLab() {
  const [bugsLogged, setBugsLogged] = useState<BugEntry[]>([]);
  const [challengeClicks, setChallengeClicks] = useState(0);
  const [interactions, setInteractions] = useState(0);

  // Calculate discovery stage
  const stage = useMemo(() => {
    if (challengeClicks >= CLICKS_FOR_INSIGHT) {
      return STAGE_INSIGHT;
    }
    if (challengeClicks >= CLICKS_FOR_REVELATION) {
      return STAGE_REVELATION;
    }
    if (bugsLogged.length >= MIN_BUGS_FOR_STAGE_3) {
      return STAGE_CHALLENGE;
    }
    if (bugsLogged.length >= MIN_BUGS_FOR_STAGE_2) {
      return STAGE_CONFIDENT;
    }
    if (
      interactions >= MIN_INTERACTIONS_FOR_EXPLORING ||
      bugsLogged.length >= MIN_BUGS_FOR_EXPLORING
    ) {
      return STAGE_EXPLORING;
    }
    return STAGE_INITIAL;
  }, [bugsLogged.length, challengeClicks, interactions]);

  const handleAddBug = (bugText: string) => {
    const newBug: BugEntry = { id: crypto.randomUUID(), text: bugText };
    setBugsLogged((prev) => [...prev, newBug]);
  };

  const handleRemoveBug = (id: string) => {
    setBugsLogged((prev) => prev.filter((bug) => bug.id !== id));
  };

  const handleChallengeClick = () => {
    setChallengeClicks((c) => c + 1);
  };

  const handleInteraction = () => {
    setInteractions((i) => i + 1);
  };

  return (
    <main className="relative flex min-h-screen flex-col bg-[#050505] font-sans text-white selection:bg-white/20">
      {/* Grid Background */}
      <div
        className="pointer-events-none absolute inset-0 text-white"
        style={{
          backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: GRID_OPACITY,
        }}
      />

      {/* Header */}
      <header className="flex h-16 items-center justify-between border-white/5 border-b px-8 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-white/10">
            <Bug className="h-4 w-4 text-red-400" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">
            The Bug Hunt{" "}
            <span className="ml-2 font-normal text-white/40">
              what are you actually testing?
            </span>
          </h1>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          {STAGE_NUMBERS.map((s) => (
            <div
              className={`h-1.5 w-6 rounded-full transition-colors ${
                stage >= s ? "bg-cyan-400" : "bg-white/10"
              }`}
              key={s}
            />
          ))}
        </div>
      </header>

      {/* Main Content */}
      <div className="grid flex-1 grid-cols-12 overflow-hidden">
        {/* Bug Log Panel */}
        <aside className="col-span-3 flex flex-col overflow-y-auto border-white/5 border-r bg-white/2 p-6">
          <BugLogPanel
            bugs={bugsLogged}
            onAddBug={handleAddBug}
            onRemoveBug={handleRemoveBug}
          />
        </aside>

        {/* Demo Area */}
        <section className="relative col-span-6 flex flex-col items-center justify-start p-12 pt-16">
          <BuggyTodoDemo onInteraction={handleInteraction} />
        </section>

        {/* Discovery Panel */}
        <aside className="col-span-3 flex flex-col border-white/5 border-l bg-white/2 p-6">
          <DiscoveryPanel
            challengeClicks={challengeClicks}
            onChallengeClick={handleChallengeClick}
            stage={stage}
          />
        </aside>
      </div>
    </main>
  );
}
