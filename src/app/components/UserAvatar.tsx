import { Avatar, Style } from "@dicebear/core";
import lorelei from "@dicebear/styles/lorelei.json" with { type: "json" };
import { useEffect, useState } from "react";
import { loadProfileImage } from "../../lib/profileImageService";

const avatarStyle = new Style(lorelei);

interface Props {
  name: string;
  color: string;
  seed?: string;
  uid?: string;
  photoVersion?: string;
  className?: string;
  title?: string;
}

export function UserAvatar({
  name,
  color,
  seed,
  uid,
  photoVersion,
  className = "",
  title,
}: Props) {
  const fallbackSrc = new Avatar(avatarStyle, {
    seed: seed ?? `${name}-${color}`,
    backgroundColor: [color.replace("#", "")],
  }).toDataUri();
  const [photoSrc, setPhotoSrc] = useState<string>();

  useEffect(() => {
    let active = true;
    setPhotoSrc(undefined);
    if (!uid || !photoVersion) return () => {
      active = false;
    };

    void loadProfileImage(uid, photoVersion).then((source) => {
      if (active) setPhotoSrc(source);
    });
    return () => {
      active = false;
    };
  }, [uid, photoVersion]);

  return (
    <img
      src={photoSrc ?? fallbackSrc}
      alt={`${name}'s avatar`}
      className={`object-cover ${className}`}
      title={title}
    />
  );
}
