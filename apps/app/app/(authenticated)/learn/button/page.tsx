import type { Metadata } from "next";
import { Counter } from "./components/counter";

export const metadata: Metadata = {
  description: "Click to increase the count and learn the web stack.",
  title: "The Button | Learn by Doing",
};

export default function ButtonScenarioPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8 border-zinc-300 border-t dark:border-zinc-700" />
        <h2 className="mb-6 text-center font-semibold text-2xl text-zinc-900 dark:text-zinc-100">
          Counter Demo
        </h2>
        <p className="mb-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
          The classic React counter that shows how state updates trigger
          re-renders
        </p>
        <Counter />
      </div>
    </div>
  );
}
