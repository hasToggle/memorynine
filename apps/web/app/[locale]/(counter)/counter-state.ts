import type { Reducer } from "react";

export interface DesktopState {
  animateRerendering: boolean;
  aside: string;
  count: number;
  disabled: boolean;
  image: string;
  info: string;
  internalCount: number;
  label: string;
  title: string;
}

export interface DesktopAction {
  type: "updating" | "updated";
}

export const initialDesktopState: DesktopState = {
  animateRerendering: false,
  aside:
    "Winter is coming. Hazel needs to save some hazelnuts for the cold months.",
  count: 0,
  disabled: true,
  image: "/testimonials/squirrel_waving.png",
  info: "Hazel is a professional squirrel and junior React developer. She can collect hazelnuts for you.",
  internalCount: 0,
  label: "Become a React dev",
  title: "About hazelnuts \u{1F330}",
};

export const desktopCounterReducer: Reducer<DesktopState, DesktopAction> = (
  state,
  action
) => {
  switch (action.type) {
    case "updating":
      return {
        ...state,
        aside: "Click the button to have Hazel get another hazelnut.",
        disabled: false,
        image: "/testimonials/squirrel_waiting.png",
        info: "Hazel has got a fine nose. She can smell something\u2019s happening.",
        internalCount: state.internalCount + 1,
        label: "React",
        title: "Hazel is ready!",
      };
    case "updated":
      return {
        ...state,
        animateRerendering: true,
        aside: "You are now a React dev.",
        count: state.count + 1,
        disabled: true,
        image: "/testimonials/squirrel_happy.png",
        info: "That\u2019s the spirit! You and Hazel are a great team.",
        label: "React",
        title: "Well done!",
      };
    default:
      throw new Error("Unknown action type.");
  }
};

export interface MobileState {
  count: number;
  cta: string;
  decrementDisabled: boolean;
  image: string;
  incrementDisabled: boolean;
  label: string;
  paragraph: string;
  title: string;
}
export interface MobileAction {
  type: "decrement" | "increment";
}

export const initialMobileState: MobileState = {
  count: 0,
  cta: "Give her a hazelnut and watch what happens.",
  decrementDisabled: true,
  image: "/testimonials/squirrel_waving.png",
  incrementDisabled: false,
  label: "Become a React dev",
  paragraph:
    "See Hazel over there on the left? She is a professional squirrel and a junior React developer.",
  title: "Let\u2019s go hazelnuts \u{1F330}",
};

export const mobileCounterReducer: Reducer<MobileState, MobileAction> = (
  state,
  action
) => {
  switch (action.type) {
    case "decrement":
      return {
        ...state,
        count: state.count - 1,
        cta: "As an aspiring React dev yourself, you shouldn\u2019t take any more of her hazelnuts.",
        decrementDisabled: state.count - 1 <= 0,
        image:
          state.count - 1 <= 0
            ? "/testimonials/squirrel_arms_crossed.png"
            : "/testimonials/squirrel_reluctant.png",
        incrementDisabled: false,
        label: "Become a Badass",
        paragraph:
          state.count - 1 <= 0
            ? "Did you just take the last hazelnut? Hazel is not happy. Maybe you should cheer her up with another hazelnut."
            : "Hazel gave away one of her nuts. But winter is coming and she needs to save some for the cold months.",
        title:
          state.count - 1 <= 0
            ? "Hazel is out of nuts."
            : "Hazel looks at you.",
      };
    case "increment":
      return {
        ...state,
        count: state.count + 1,
        cta: "I wouldn\u2019t try taking her hazelnuts, though.",
        decrementDisabled: state.count + 1 <= 0,
        image: "/testimonials/squirrel_happy.png",
        incrementDisabled: false,
        label: "Become a React Dev",
        paragraph:
          "Keep it coming, and Hazel will be very happy by the end of the day.",
        title: "Hazel is happy!",
      };
    default:
      throw new Error("Unknown action type.");
  }
};
