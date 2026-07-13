import { Avatar, Style } from "@dicebear/core";
import lorelei from "@dicebear/styles/lorelei.json" with { type: "json" };

const avatarStyle = new Style(lorelei);

interface Props {
  name: string;
  color: string;
  seed?: string;
  className?: string;
  title?: string;
}

export function UserAvatar({ name, color, seed, className = "", title }: Props) {
  if (!seed) {
    return (
      <span
        className={`flex items-center justify-center text-white font-semibold ${className}`}
        style={{ backgroundColor: color }}
        aria-label={`${name}'s avatar`}
        title={title}
      >
        {name.charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  const src = new Avatar(avatarStyle, {
    seed,
    backgroundColor: [color.replace("#", "")],
  }).toDataUri();

  return (
    <img
      src={src}
      alt={`${name}'s avatar`}
      className={`object-cover ${className}`}
      title={title}
    />
  );
}
