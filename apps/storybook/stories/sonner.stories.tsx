import { Toaster } from "@repo/design-system/components/ui/sonner";
import type { Meta, StoryObj } from "@storybook/react";
import { toast } from "sonner";
import { action } from "storybook/actions";

/**
 * An opinionated toast component for React.
 */
const meta: Meta<typeof Toaster> = {
  args: {
    position: "bottom-right",
  },
  argTypes: {},
  component: Toaster,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "ui/Sonner",
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the toaster.
 */
const showToast = () =>
  toast("Event has been created", {
    action: {
      label: "Undo",
      onClick: action("Undo clicked"),
    },
    description: new Date().toLocaleString(),
  });

export const Default: Story = {
  render: (args) => (
    <div className="flex min-h-96 items-center justify-center space-x-2">
      <button onClick={showToast} type="button">
        Show Toast
      </button>
      <Toaster {...args} />
    </div>
  ),
};
