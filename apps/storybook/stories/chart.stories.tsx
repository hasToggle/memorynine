import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/design-system/components/ui/chart";
import type { Meta, StoryObj } from "@storybook/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  type LabelProps,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
} from "recharts";

/**
 * Length for abbreviated month names (e.g., "Jan", "Feb")
 */
const MONTH_ABBREVIATION_LENGTH = 3;

const abbreviateMonth = (value: string) =>
  value.slice(0, MONTH_ABBREVIATION_LENGTH);

const multiSeriesData = [
  { desktop: 186, mobile: 80, month: "January" },
  { desktop: 305, mobile: 200, month: "February" },
  { desktop: 237, mobile: 120, month: "March" },
  { desktop: 73, mobile: 190, month: "April" },
  { desktop: 209, mobile: 130, month: "May" },
  { desktop: 214, mobile: 140, month: "June" },
];

const multiSeriesConfig = {
  desktop: {
    color: "hsl(var(--chart-1))",
    label: "Desktop",
  },
  mobile: {
    color: "hsl(var(--chart-2))",
    label: "Mobile",
  },
} satisfies ChartConfig;

const singleSeriesData = [
  { browser: "chrome", fill: "var(--color-chrome)", visitors: 275 },
  { browser: "safari", fill: "var(--color-safari)", visitors: 200 },
  { browser: "other", fill: "var(--color-other)", visitors: 190 },
];

const TOTAL_VISITORS = singleSeriesData.reduce(
  (acc, curr) => acc + curr.visitors,
  0
);

/** Recharts re-invokes `content` on every chart render, so it lives out here. */
const renderVisitorTotal = ({ viewBox }: LabelProps) => {
  if (!(viewBox && "cx" in viewBox && "cy" in viewBox)) {
    return null;
  }

  return (
    <text
      dominantBaseline="middle"
      textAnchor="middle"
      x={viewBox.cx}
      y={viewBox.cy}
    >
      <tspan
        className="fill-foreground font-bold text-3xl"
        x={viewBox.cx}
        y={viewBox.cy}
      >
        {TOTAL_VISITORS.toLocaleString()}
      </tspan>
      <tspan
        className="fill-muted-foreground"
        x={viewBox.cx}
        y={(viewBox.cy || 0) + 24}
      >
        Visitors
      </tspan>
    </text>
  );
};

const singleSeriesConfig = {
  chrome: {
    color: "hsl(var(--chart-1))",
    label: "Chrome",
  },
  other: {
    color: "hsl(var(--chart-5))",
    label: "Other",
  },
  safari: {
    color: "hsl(var(--chart-2))",
    label: "Safari",
  },
  visitors: {
    label: "Visitors",
  },
} satisfies ChartConfig;

/**
 * Beautiful charts. Built using Recharts. Copy and paste into your apps.
 */
const meta = {
  args: {
    children: <div />,
  },
  argTypes: {},
  component: ChartContainer,
  tags: ["autodocs"],
  title: "ui/Chart",
} satisfies Meta<typeof ChartContainer>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Combine multiple Area components to create a stacked area chart.
 */
export const StackedAreaChart: Story = {
  args: {
    config: multiSeriesConfig,
  },
  render: (args) => (
    <ChartContainer {...args}>
      <AreaChart
        accessibilityLayer
        data={multiSeriesData}
        margin={{
          left: 12,
          right: 12,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="month"
          tickFormatter={abbreviateMonth}
          tickLine={false}
          tickMargin={8}
        />
        <ChartTooltip
          content={<ChartTooltipContent indicator="dot" />}
          cursor={false}
        />
        <Area
          dataKey="mobile"
          fill="var(--color-mobile)"
          fillOpacity={0.4}
          stackId="a"
          stroke="var(--color-mobile)"
          type="natural"
        />
        <Area
          dataKey="desktop"
          fill="var(--color-desktop)"
          fillOpacity={0.4}
          stackId="a"
          stroke="var(--color-desktop)"
          type="natural"
        />
      </AreaChart>
    </ChartContainer>
  ),
};

/**
 * Combine multiple Bar components to create a stacked bar chart.
 */
export const StackedBarChart: Story = {
  args: {
    config: multiSeriesConfig,
  },
  render: (args) => (
    <ChartContainer {...args}>
      <BarChart accessibilityLayer data={multiSeriesData}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="month"
          tickFormatter={abbreviateMonth}
          tickLine={false}
          tickMargin={10}
        />
        <ChartTooltip
          content={<ChartTooltipContent indicator="dashed" />}
          cursor={false}
        />
        <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
        <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
      </BarChart>
    </ChartContainer>
  ),
};

/**
 * Combine multiple Line components to create a single line chart.
 */
export const MultiLineChart: Story = {
  args: {
    config: multiSeriesConfig,
  },
  render: (args) => (
    <ChartContainer {...args}>
      <LineChart
        accessibilityLayer
        data={multiSeriesData}
        margin={{
          left: 12,
          right: 12,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="month"
          tickFormatter={abbreviateMonth}
          tickLine={false}
          tickMargin={8}
        />
        <ChartTooltip
          content={<ChartTooltipContent hideLabel />}
          cursor={false}
        />
        <Line
          dataKey="desktop"
          dot={false}
          stroke="var(--color-desktop)"
          strokeWidth={2}
          type="natural"
        />
        <Line
          dataKey="mobile"
          dot={false}
          stroke="var(--color-mobile)"
          strokeWidth={2}
          type="natural"
        />
      </LineChart>
    </ChartContainer>
  ),
};

/**
 * Combine Pie and Label components to create a doughnut chart.
 */
export const DoughnutChart: Story = {
  args: {
    config: singleSeriesConfig,
  },
  render: (args) => (
    <ChartContainer {...args}>
      <PieChart>
        <ChartTooltip
          content={<ChartTooltipContent hideLabel />}
          cursor={false}
        />
        <Pie
          data={singleSeriesData}
          dataKey="visitors"
          innerRadius={48}
          nameKey="browser"
          strokeWidth={5}
        >
          <Label content={renderVisitorTotal} />
        </Pie>
      </PieChart>
    </ChartContainer>
  ),
};
