import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Galaxy } from "../galaxy/Galaxy";
import { isMobile } from "../utils/assetResolver";

/**
 * The 3D galaxy is a WebGL2 scene with 7,000+ points. On a phone it is heavy
 * to start and drains the battery, so it is only mounted once the learner
 * asks for it. Everywhere else it renders straight away.
 */
export function GalaxyGate({
  mode = "full",
  highlight,
  ignite,
  className = "",
  focus,
}: {
  mode?: "full" | "mini";
  highlight?: string[];
  ignite?: boolean;
  className?: string;
  focus?: string | null;
}) {
  const [asked, setAsked] = useState(false);
  if (!isMobile() || asked)
    return <Galaxy mode={mode} highlight={highlight} ignite={ignite} className={className} focus={focus} />;
  return (
    <button type="button" className={`galaxy-gate ${className}`} onClick={() => setAsked(true)} aria-label="加载星图">
      <Sparkles size={22} />
      <span>点按加载 3D 星图</span>
      <small>星图较耗电，未自动开启</small>
    </button>
  );
}
