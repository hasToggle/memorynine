"use client";

import { useCallback, useId, useState } from "react";

/**
 * The reader's own arithmetic, not ours. We have no business quoting a
 * statistic about how long *their* team spends hunting, so they type it in and
 * the page does the multiplication.
 */

const WEEKS_PER_MONTH = 4.33;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_WORKING_DAY = 8;

const Slider = ({
  id,
  label,
  max,
  min,
  onChange,
  step,
  suffix,
  value,
}: {
  id: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix: string;
  value: number;
}) => {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange(Number(event.currentTarget.value)),
    [onChange]
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label
          className="text-[0.9375rem] text-mn-ink-soft leading-[1.5]"
          htmlFor={id}
        >
          {label}
        </label>
        <output
          className="font-medium font-mono text-[0.9375rem] text-mn-ink tabular-nums"
          htmlFor={id}
        >
          {value}
          <span className="ml-1 text-[0.75rem] text-mn-graphite">{suffix}</span>
        </output>
      </div>
      <input
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-mn-rule accent-mn-stamp focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-4"
        id={id}
        max={max}
        min={min}
        onChange={handleChange}
        step={step}
        type="range"
        value={value}
      />
    </div>
  );
};

export function TimeLost() {
  const callsId = useId();
  const minutesId = useId();
  const [calls, setCalls] = useState(12);
  const [minutes, setMinutes] = useState(15);

  const hours = Math.round(
    (calls * minutes * WEEKS_PER_MONTH) / MINUTES_PER_HOUR
  );
  const days = (hours / HOURS_PER_WORKING_DAY).toFixed(1);

  return (
    <div className="rounded-lg border border-mn-rule bg-mn-raised p-6 sm:p-7">
      <p className="font-medium font-mono text-[0.625rem] text-mn-graphite uppercase tracking-[0.18em]">
        Put your own numbers in
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <Slider
          id={callsId}
          label="Client calls in a week"
          max={40}
          min={2}
          onChange={setCalls}
          step={1}
          suffix="calls"
          value={calls}
        />
        <Slider
          id={minutesId}
          label="Minutes spent digging before each one"
          max={45}
          min={5}
          onChange={setMinutes}
          step={5}
          suffix="min"
          value={minutes}
        />
      </div>

      <p
        aria-live="polite"
        className="mt-8 border-mn-rule border-t pt-6 text-[1.0625rem] text-mn-ink leading-[1.6]"
      >
        <span className="block font-bold font-cabinet text-[2.5rem] text-mn-stamp tabular-nums leading-none tracking-[-0.03em]">
          {hours} hours a month
        </span>
        <span className="mt-3 block text-mn-ink-soft">
          — {days} working days of somebody&apos;s time, spent looking for
          things your team already knew.
        </span>
      </p>
    </div>
  );
}
