import { UsenetDownloadsView } from "@/components/downloads/usenet-downloads-view";
import { sabnzbdAdapter } from "@/lib/usenet-adapters/sabnzbd";

interface ViewProps {
  showHeader?: boolean;
  segmentedControl?: React.ReactNode;
}

export function SabnzbdDownloadsView(props: ViewProps) {
  return <UsenetDownloadsView {...props} adapter={sabnzbdAdapter} />;
}
