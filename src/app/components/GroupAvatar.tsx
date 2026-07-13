import { Avatar, Style } from "@dicebear/core";
import shapes from "@dicebear/styles/shapes.json" with { type: "json" };

const groupAvatarStyle = new Style(shapes);

interface Props {
  name: string;
  seed?: string;
  className?: string;
}

export function GroupAvatar({ name, seed, className = "" }: Props) {
  if (!seed) {
    return (
      <span
        className={`flex items-center justify-center bg-primary text-primary-foreground font-bold ${className}`}
        aria-label={`${name} group avatar`}
      >
        {name.charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  const src = new Avatar(groupAvatarStyle, {
    seed,
    backgroundColor: ["5b4cf5"],
  }).toDataUri();

  return (
    <img
      src={src}
      alt={`${name} group avatar`}
      className={`object-cover ${className}`}
    />
  );
}
