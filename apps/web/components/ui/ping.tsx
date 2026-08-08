const pingColors = {
  blue: {
    dot: "bg-blue-500",
    ping: "bg-blue-400",
  },
  orange: {
    dot: "bg-orange-500",
    ping: "bg-orange-400",
  },
} as const;

export function Ping({
  color = "orange",
}: {
  color?: keyof typeof pingColors;
}) {
  const { ping, dot } = pingColors[color];
  return (
    <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-3 w-3">
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-80 ${ping}`}
      />
      <span className={`relative inline-flex h-3 w-3 rounded-full ${dot}`} />
    </span>
  );
}
