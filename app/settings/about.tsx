import { Text, Linking, Platform } from "react-native";
import { Bug, Heart, BookOpen } from "lucide-react-native";
import GithubLogo from "@/assets/services/github.svg";
import { useUiScale } from "@/hooks/use-ui-scale";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { AppVersionCard } from "@/components/common/app-version-card";
import {
  NATIVE_VERSION,
  RUNTIME_VERSION,
  UPDATE_CHANNEL,
  getCurrentUpdateId,
} from "@/lib/app-version";
import { useIntroStore } from "@/store/intro-store";

// Uses GitHub's `?body=` query param (URL-encoded) to pre-fill the new-issue form.
function buildIssueUrl(): string {
  const updateId = getCurrentUpdateId() ?? "embedded";
  const lines = [
    "## Describe the issue",
    "",
    "",
    "## Steps to reproduce",
    "",
    "",
    "## Expected behavior",
    "",
    "",
    "---",
    "**Environment** (auto-filled — please keep)",
    `- App version: ${NATIVE_VERSION}`,
    `- Runtime: ${RUNTIME_VERSION}`,
    `- Update: ${updateId}`,
    ...(UPDATE_CHANNEL ? [`- Channel: ${UPDATE_CHANNEL}`] : []),
    `- Platform: ${Platform.OS} ${String(Platform.Version)}`,
  ];
  const body = encodeURIComponent(lines.join("\n"));
  return `https://github.com/renzobeux/Dashboarr/issues/new?body=${body}`;
}

export default function AboutSettingsScreen() {
  const replayWorkspaceIntro = useIntroStore((s) => s.replayWorkspaceIntro);

  // GitHub logo is an SVG (lucide v1 dropped brand icons), so size it manually
  // to match the lucide icons in other rows (size=20 with rem scale).
  const scale = useUiScale();
  const githubLogoSize = Math.round(20 * scale);

  return (
    <ScreenWrapper>
      <BackHeader title="About" />

      <SettingsGroup
        title="About"
        footer={
          <>
            Dashboarr is open-source under GPL-3.0. Contributions and bug reports
            are welcome.
            {"\n\n"}
            Movie & TV metadata from{" "}
            <Text
              className="text-zinc-500"
              onPress={() => void Linking.openURL("https://www.themoviedb.org")}
            >
              TMDB
            </Text>{" "}
            and{" "}
            <Text
              className="text-zinc-500"
              onPress={() => void Linking.openURL("https://thetvdb.com")}
            >
              TheTVDB
            </Text>
            . This product uses the TMDB API but is not endorsed or certified by
            TMDB.
          </>
        }
      >
        <SettingsRow
          leading={<GithubLogo width={githubLogoSize} height={githubLogoSize} />}
          label="View on GitHub"
          subtitle="github.com/renzobeux/Dashboarr"
          onPress={() => void Linking.openURL("https://github.com/renzobeux/Dashboarr")}
        />
        <SettingsRow
          icon={Bug}
          label="Report an issue"
          subtitle="Open a new issue on GitHub"
          onPress={() => void Linking.openURL(buildIssueUrl())}
        />
        <SettingsRow
          icon={Heart}
          label="Support development"
          subtitle="Buy me a coffee on Ko-fi"
          onPress={() => void Linking.openURL("https://ko-fi.com/renzobeux")}
        />
        <SettingsRow
          icon={BookOpen}
          label="Show workspace tour"
          subtitle="Replay the multi-dashboard intro"
          onPress={replayWorkspaceIntro}
        />
      </SettingsGroup>

      <AppVersionCard />
    </ScreenWrapper>
  );
}
