"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useCallback, useState } from "react";
import { Expandable } from "../../components/expandable";
import { MetaAside } from "../../components/meta-aside";
import { Pipeline } from "./pipeline";

type Stage = "surface" | "revealed";

export function Contract() {
  const [stage, setStage] = useState<Stage>("surface");
  const reveal = useCallback(() => setStage("revealed"), []);
  const reset = useCallback(() => setStage("surface"), []);

  return (
    <div className="space-y-6">
      <Pipeline stage={stage} />

      <div className="flex flex-wrap items-center gap-3">
        {stage === "surface" ? (
          <Button onClick={reveal} type="button">
            See what got synced
          </Button>
        ) : (
          <Button onClick={reset} type="button" variant="ghost">
            Reset
          </Button>
        )}
      </div>

      <Expandable
        label={'Did you know? "The safest brake is the one that\'s always on."'}
      >
        <AirBrakeEssay />
      </Expandable>

      <MetaAside className="mt-8" variant="block">
        When the answer is always there, the question stops getting asked.
      </MetaAside>
    </div>
  );
}

function AirBrakeEssay() {
  return (
    <div className="space-y-4 text-foreground/75 leading-7">
      <p>
        Heavy trucks use air brakes. This is interesting for a reason that has
        nothing to do with trucks and everything to do with the demo you just
        saw.
      </p>
      <p>
        In a car, you press the brake pedal and fluid pushes the pads against
        the wheels. If the fluid leaks out, you have no brakes. This is what
        engineers call a &ldquo;failure mode,&rdquo; and what passengers call
        &ldquo;screaming.&rdquo;
      </p>
      <p>
        Truck engineers, being the sort of people who think about what happens
        when things go wrong&thinsp;*&thinsp;— looked at this and made a
        decision that seems obvious in hindsight and brilliant in foresight:
        they reversed it. In a truck, massive springs hold the brakes{" "}
        <em>on</em> by default. Air pressure is what <em>releases</em> them. If
        a line is cut, if the compressor dies, if anything fails at all, the
        springs do what springs do and the truck stops.
      </p>
      <p>
        The safe state isn&apos;t something the system has to achieve. It&apos;s
        where the system already is.
      </p>
      <p>
        Now look at the demo above. Each step had a graceful failure: return an
        empty list. Nobody asked what &ldquo;sync&rdquo; should do when there
        was nothing to import — and &ldquo;sync&rdquo; has a default. It&apos;s
        destructive.
      </p>
      <p>
        The truck engineer and the software developer faced the same question.
        One of them thought about it first.&thinsp;**
      </p>
      <MetaAside className="mt-4" noMarker>
        * A trait that, in software, is distressingly rare and
        disproportionately valuable.
      </MetaAside>
      <MetaAside noMarker>
        ** The other one shipped to production on a Friday.
      </MetaAside>
    </div>
  );
}
