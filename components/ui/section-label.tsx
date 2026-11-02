import { Text } from "react-native";

/**
 * Small uppercase heading above a detail-page section ("File", "Overview",
 * "Seasons", "Subtitles"). Shared by every media detail page so the label
 * style stays identical across Radarr, Sonarr, Lidarr, Bindery and Plex.
 */
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text
      className={`text-zinc-500 text-[0.65rem] font-bold uppercase tracking-widest mb-2 ml-1${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </Text>
  );
}
