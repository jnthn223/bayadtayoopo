import { Avatar, Style } from "@dicebear/core";
import shapes from "@dicebear/styles/shapes.json" with { type: "json" };
import { useEffect, useState } from "react";
import { loadGroupImage } from "../../lib/groupImageService";

const groupAvatarStyle = new Style(shapes);

interface Props {
  name: string;
  seed?: string;
  groupId?: string;
  photoVersion?: string;
  className?: string;
}

export function GroupAvatar({
  name,
  seed,
  groupId,
  photoVersion,
  className = "",
}: Props) {
  const [photoSrc, setPhotoSrc] = useState<string>();

  useEffect(() => {
    let active = true;
    setPhotoSrc(undefined);
    if (!groupId || !photoVersion) return () => {
      active = false;
    };

    void loadGroupImage(groupId, photoVersion).then((source) => {
      if (active) setPhotoSrc(source);
    });
    return () => {
      active = false;
    };
  }, [groupId, photoVersion]);

  if (!seed && !photoSrc) {
    return (
      <span
        className={`flex items-center justify-center bg-primary text-primary-foreground font-bold ${className}`}
        aria-label={`${name} group avatar`}
      >
        {name.charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  const fallbackSrc = new Avatar(groupAvatarStyle, {
    seed: seed ?? `${name}-group`,
    backgroundColor: ["5b4cf5"],
  }).toDataUri();

  return (
    <img
      src={photoSrc ?? fallbackSrc}
      alt={`${name} group avatar`}
      className={`object-cover ${className}`}
    />
  );
}
