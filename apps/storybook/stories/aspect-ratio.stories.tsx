import { AspectRatio } from "@repo/design-system/components/ui/aspect-ratio";
import type { Meta, StoryObj } from "@storybook/react";
import Image from "next/image";

/**
 * Common aspect ratio constants
 */
const ASPECT_RATIO_16_9 = 16 / 9;
const ASPECT_RATIO_4_3 = 4 / 3;
const ASPECT_RATIO_CINEMASCOPE = 2.35 / 1;

/**
 * Displays content within a desired ratio.
 */
const meta: Meta<typeof AspectRatio> = {
  argTypes: {},
  component: AspectRatio,
  decorators: [
    (StoryComponent) => (
      <div className="w-1/2">
        <StoryComponent />
      </div>
    ),
  ],
  render: (args) => (
    <AspectRatio {...args} className="bg-slate-50 dark:bg-slate-800">
      <Image
        alt="Photo by Alvaro Pinot"
        className="rounded-md object-cover"
        fill
        src="https://images.unsplash.com/photo-1576075796033-848c2a5f3696?w=800&dpr=2&q=80"
      />
    </AspectRatio>
  ),
  tags: ["autodocs"],
  title: "ui/AspectRatio",
} satisfies Meta<typeof AspectRatio>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the aspect ratio.
 */
export const Default: Story = {
  args: {
    ratio: ASPECT_RATIO_16_9,
  },
};

/**
 * Use the `1:1` aspect ratio to display a square image.
 */
export const Square: Story = {
  args: {
    ratio: 1,
  },
};

/**
 * Use the `4:3` aspect ratio to display a landscape image.
 */
export const Landscape: Story = {
  args: {
    ratio: ASPECT_RATIO_4_3,
  },
};

/**
 * Use the `2.35:1` aspect ratio to display a cinemascope image.
 */
export const Cinemascope: Story = {
  args: {
    ratio: ASPECT_RATIO_CINEMASCOPE,
  },
};
