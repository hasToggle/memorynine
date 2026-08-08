"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";

const Label = ({
  children,
  animateRerendering,
  color,
}: {
  children: ReactNode;
  animateRerendering?: boolean;
  color?: "default" | "pink" | "blue" | "violet" | "cyan" | "orange";
}) => (
  <div
    className={cn("rounded-full px-4 py-1 shadow-[0_0_1px_2px_black]", {
      "animate-[highlight_1s_ease-in-out_1]": animateRerendering,
      "bg-gray-800 text-gray-300": color === "default",
      "bg-hastoggle-blue text-white": color === "blue",
      "bg-hastoggle-cyan text-cyan-50": color === "cyan",
      "bg-hastoggle-orange text-orange-50": color === "orange",
      "bg-hastoggle-pink text-pink-50": color === "pink",
      "bg-hastoggle-violet text-violet-50": color === "violet",
    })}
  >
    {children}
  </div>
);

export const Boundary = ({
  children,
  labels = ["children"],
  size = "default",
  color = "default",
  animateRerendering = true,
}: {
  children: ReactNode;
  labels?: string[];
  size?: "small" | "medium" | "default";
  color?: "default" | "pink" | "blue" | "violet" | "cyan" | "orange";
  animateRerendering?: boolean;
}) => (
  <div
    className={cn("relative rounded-xl border border-dashed", {
      "animate-[rerender_1s_ease-in-out_1]": animateRerendering,
      "border-gray-700": color === "default",
      "border-hastoggle-blue": color === "blue",
      "border-hastoggle-cyan": color === "cyan",
      "border-hastoggle-orange": color === "orange",
      "border-hastoggle-pink": color === "pink",
      "border-hastoggle-violet": color === "violet",
      "p-5": size === "small",
      "p-8": size === "medium",
      "p-10": size === "default",
    })}
  >
    <div
      className={cn(
        "absolute -top-3 flex space-x-1 text-[9px] uppercase leading-4 tracking-widest sm:text-[10px]",
        {
          "left-5": size === "small",
          "left-7": size === "default",
        }
      )}
    >
      {labels.map((label) => (
        <Label
          animateRerendering={animateRerendering}
          color={color}
          key={label}
        >
          {label}
        </Label>
      ))}
    </div>

    {children}
  </div>
);
