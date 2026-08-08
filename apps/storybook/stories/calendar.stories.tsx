import { Calendar } from "@repo/design-system/components/ui/calendar";
import type { Meta, StoryObj } from "@storybook/react";
import { addDays } from "date-fns";
import { action } from "storybook/actions";

/**
 * Day offset constants for calendar examples
 */
const DAYS_OFFSET_SHORT = 2;
const DAYS_OFFSET_WEEK = 7;
const DAYS_OFFSET_LONG = 8;
const DAYS_OFFSET_1 = 1;
const DAYS_OFFSET_3 = 3;
const DAYS_OFFSET_5 = 5;

/**
 * A date field component that allows users to enter and edit date.
 */
const meta = {
  args: {
    className: "rounded-md border w-fit",
    mode: "single",
    onSelect: action("onDayClick"),
    selected: new Date(),
  },
  argTypes: {},
  component: Calendar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "ui/Calendar",
} satisfies Meta<typeof Calendar>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the calendar.
 */
export const Default: Story = {};

/**
 * Use the `multiple` mode to select multiple dates.
 */
export const Multiple: Story = {
  args: {
    min: 1,
    mode: "multiple",
    selected: [
      new Date(),
      addDays(new Date(), DAYS_OFFSET_SHORT),
      addDays(new Date(), DAYS_OFFSET_LONG),
    ],
  },
};

/**
 * Use the `range` mode to select a range of dates.
 */
export const Range: Story = {
  args: {
    mode: "range",
    selected: {
      from: new Date(),
      to: addDays(new Date(), DAYS_OFFSET_WEEK),
    },
  },
};

/**
 * Use the `disabled` prop to disable specific dates.
 */
export const Disabled: Story = {
  args: {
    disabled: [
      addDays(new Date(), DAYS_OFFSET_1),
      addDays(new Date(), DAYS_OFFSET_SHORT),
      addDays(new Date(), DAYS_OFFSET_3),
      addDays(new Date(), DAYS_OFFSET_5),
    ],
  },
};

/**
 * Use the `numberOfMonths` prop to display multiple months.
 */
export const MultipleMonths: Story = {
  args: {
    numberOfMonths: 2,
    showOutsideDays: false,
  },
};
