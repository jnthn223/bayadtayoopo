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
  const src = new Avatar(avatarStyle, {
    seed: seed ?? `${name}-${color}`,
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
