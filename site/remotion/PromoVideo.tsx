import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Rajdhani";

// Load Rajdhani via Remotion's font system (prevents FOUT / flashing)
const { fontFamily } = loadFont("normal", {
  weights: ["300", "400", "500", "600", "700"],
});

// --- Colors (matching app sign-in page: bg-slate-900) ---
const C = {
  bg: "#0f172a",
  amber: "#f59e0b",
  white: "#ffffff",
  gray: "#94a3b8",
  grayLight: "#cbd5e1",
  red: "#ef4444",
  skyGlow: "rgba(14, 165, 233, 0.10)",
  skyGlowStrong: "rgba(14, 165, 233, 0.15)",
};

const RAJDHANI = fontFamily;

const SS_W = 620;
const SS_H = Math.round(SS_W * (2340 / 1080));

// Sign-in page background: slate-900 + two sky-blue blurred glows
const SignInBg: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg, overflow: "hidden" }}>
    <div style={{
      position: "absolute", top: "-20%", right: "-15%", width: "60%", height: "60%",
      borderRadius: "50%", backgroundColor: C.skyGlow, filter: "blur(120px)",
    }} />
    <div style={{
      position: "absolute", bottom: "-15%", left: "-10%", width: "55%", height: "55%",
      borderRadius: "50%", backgroundColor: C.skyGlowStrong, filter: "blur(120px)",
    }} />
  </AbsoluteFill>
);

// Cross-fade wrapper
const SceneFade: React.FC<{
  children: React.ReactNode;
  durationInFrames: number;
  fadeIn?: number;
  fadeOut?: number;
}> = ({ children, durationInFrames, fadeIn = 12, fadeOut = 12 }) => {
  const frame = useCurrentFrame();
  const fadeInOp = fadeIn > 0
    ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" })
    : 1;
  const fadeOutOp = fadeOut > 0
    ? interpolate(frame, [durationInFrames - fadeOut, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeInOp, fadeOutOp) }}>
      {children}
    </AbsoluteFill>
  );
};

// Brand watermark for feature scenes
const BrandMark: React.FC = () => (
  <div style={{
    position: "absolute", top: 50, left: 60,
    display: "flex", alignItems: "center", gap: 12,
  }}>
    <div style={{ width: 3, height: 28, backgroundColor: C.amber, borderRadius: 2 }} />
    <span style={{ fontFamily: RAJDHANI, fontSize: 24, fontWeight: 600, color: C.gray, letterSpacing: 3, textTransform: "uppercase" }}>
      MatchOps
    </span>
  </div>
);

// Centered flex content layer
const CenterContent: React.FC<{ children: React.ReactNode; gap?: number }> = ({ children, gap = 0 }) => (
  <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap }}>
    {children}
  </AbsoluteFill>
);

// ==========================================
// SCENE 1: Logo Entrance
// ==========================================
const LogoEntrance: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const taglineOpacity = interpolate(frame, [40, 60], [0, 1], { extrapolateRight: "clamp" });
  const taglineY = interpolate(frame, [40, 60], [16, 0], { extrapolateRight: "clamp" });

  return (
    <SceneFade durationInFrames={90} fadeIn={0}>
      <SignInBg />
      <CenterContent>
        <div style={{ transform: `scale(${scale})`, opacity }}>
          <span style={{ fontFamily: RAJDHANI, fontSize: 140, fontWeight: 700, color: C.amber }}>
            MatchOps
          </span>
        </div>
        <div style={{ opacity: taglineOpacity, transform: `translateY(${taglineY}px)`, marginTop: 30 }}>
          <span style={{ fontFamily: RAJDHANI, fontSize: 38, fontWeight: 400, color: C.grayLight, letterSpacing: 3 }}>
            For soccer &amp; futsal coaches
          </span>
        </div>
      </CenterContent>
    </SceneFade>
  );
};

// ==========================================
// SCENE 2: Problem Statement
// ==========================================
const ProblemStatement: React.FC = () => {
  const frame = useCurrentFrame();
  const items = ["Clipboard.", "Stopwatch.", "Notebook."];

  return (
    <SceneFade durationInFrames={120}>
      <SignInBg />
      <CenterContent gap={50}>
        {items.map((item, i) => {
          const appear = i * 28;
          const strike = appear + 50;
          const opacity = interpolate(frame, [appear, appear + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const y = interpolate(frame, [appear, appear + 15], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const strikeW = interpolate(frame, [strike, strike + 14], [0, 110], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const textOp = interpolate(frame, [strike + 14, strike + 28], [1, 0.3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div key={item} style={{ position: "relative", opacity, transform: `translateY(${y}px)` }}>
              <span style={{ fontSize: 64, fontWeight: 700, fontFamily: RAJDHANI, color: C.white, opacity: textOp, letterSpacing: 2 }}>
                {item}
              </span>
              <div style={{
                position: "absolute", top: "55%", left: "-5%",
                width: `${strikeW}%`, height: 4,
                backgroundColor: C.red, borderRadius: 2, transform: "rotate(-2deg)",
              }} />
            </div>
          );
        })}
      </CenterContent>
    </SceneFade>
  );
};

// ==========================================
// SCENE 3: Solution
// ==========================================
const Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textScale = spring({ frame, fps, config: { damping: 12, mass: 0.7 } });
  const textOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const logoOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });
  const logoScale = spring({ frame: Math.max(0, frame - 28), fps, config: { damping: 14, mass: 0.8 } });

  return (
    <SceneFade durationInFrames={90}>
      <SignInBg />
      <CenterContent>
        <div style={{ fontSize: 88, fontWeight: 700, fontFamily: RAJDHANI, color: C.white, transform: `scale(${textScale})`, opacity: textOpacity, marginBottom: 50 }}>
          One app.
        </div>
        <div style={{ opacity: logoOpacity, transform: `scale(${logoScale})` }}>
          <span style={{ fontFamily: RAJDHANI, fontSize: 100, fontWeight: 700, color: C.amber }}>
            MatchOps
          </span>
        </div>
      </CenterContent>
    </SceneFade>
  );
};

// ==========================================
// SCENE: Feature Showcase
// ==========================================
const FeatureShowcase: React.FC<{
  screenshot: string;
  label: string;
  subtitle?: string;
  duration: number;
}> = ({ screenshot, label, subtitle, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelOpacity = interpolate(frame, [8, 22], [0, 1], { extrapolateRight: "clamp" });
  const labelY = interpolate(frame, [8, 22], [-12, 0], { extrapolateRight: "clamp" });
  const lineScale = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: "clamp" });
  const subtitleOpacity = interpolate(frame, [22, 38], [0, 1], { extrapolateRight: "clamp" });

  const ssSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 14, mass: 0.9 } });
  const ssY = interpolate(ssSpring, [0, 1], [250, 0]);
  const ssOpacity = interpolate(ssSpring, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });

  return (
    <SceneFade durationInFrames={duration}>
      <SignInBg />
      <AbsoluteFill style={{ fontFamily: RAJDHANI }}>
        <BrandMark />

        {/* Title block */}
        <div style={{
          position: "absolute", top: 160, left: 0, right: 0,
          display: "flex", flexDirection: "column", alignItems: "center",
          opacity: labelOpacity, transform: `translateY(${labelY}px)`,
        }}>
          <span style={{ fontSize: 80, fontWeight: 700, color: C.amber, textTransform: "uppercase", letterSpacing: 10, lineHeight: 1 }}>
            {label}
          </span>
          <div style={{ width: 80, height: 2, backgroundColor: C.amber, marginTop: 20, marginBottom: 16, transform: `scaleX(${lineScale})`, opacity: 0.6 }} />
          {subtitle && (
            <span style={{ fontSize: 28, fontWeight: 400, color: C.gray, opacity: subtitleOpacity, letterSpacing: 2 }}>
              {subtitle}
            </span>
          )}
        </div>

        {/* Screenshot */}
        <div style={{
          position: "absolute", top: 390, left: 0, right: 0, bottom: 0,
          display: "flex", justifyContent: "center", alignItems: "flex-start",
          overflow: "hidden", opacity: ssOpacity, transform: `translateY(${ssY}px)`,
        }}>
          <img
            src={staticFile(screenshot)}
            style={{
              width: SS_W, height: SS_H, borderRadius: 18,
              boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
              objectFit: "cover", filter: "contrast(1.1) brightness(1.05)",
            }}
          />
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};

// ==========================================
// SCENE: CTA
// ==========================================
const CallToAction: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const textOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });
  const textY = interpolate(frame, [20, 40], [16, 0], { extrapolateRight: "clamp" });
  const urlOpacity = interpolate(frame, [35, 55], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [85, 110], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <SignInBg />
      <CenterContent>
        <div style={{ transform: `scale(${logoScale})`, opacity: logoOpacity, marginBottom: 50 }}>
          <span style={{ fontFamily: RAJDHANI, fontSize: 120, fontWeight: 700, color: C.amber }}>
            MatchOps
          </span>
        </div>
        <div style={{ opacity: textOpacity, transform: `translateY(${textY}px)`, fontSize: 46, fontWeight: 600, fontFamily: RAJDHANI, color: C.white, textAlign: "center", letterSpacing: 2 }}>
          Coming Soon to Google Play
        </div>
        <div style={{ opacity: urlOpacity, fontSize: 32, fontFamily: RAJDHANI, fontWeight: 400, color: C.grayLight, letterSpacing: 4, marginTop: 20 }}>
          match-ops.com
        </div>
      </CenterContent>
      <AbsoluteFill style={{ backgroundColor: "black", opacity: fadeOut }} />
    </AbsoluteFill>
  );
};

// ==========================================
// MAIN COMPOSITION: ~40s = 1200 frames @ 30fps
// ==========================================
// Version 2: Roster replaces Rate
export const PromoVideoB: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>

      <Sequence from={0} durationInFrames={90}>
        <LogoEntrance />
      </Sequence>

      <Sequence from={90} durationInFrames={120}>
        <ProblemStatement />
      </Sequence>

      <Sequence from={210} durationInFrames={90}>
        <Solution />
      </Sequence>

      <Sequence from={300} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_soccerfield_new_en_fi.jpg" label="Plan" subtitle="Interactive lineup builder" duration={130} />
      </Sequence>

      <Sequence from={430} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_timer_en.jpg" label="Track" subtitle="Timer, subs, goals & assists" duration={130} />
      </Sequence>

      <Sequence from={560} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_goallogs_en.jpg" label="Goals" subtitle="Full match timeline" duration={130} />
      </Sequence>

      <Sequence from={690} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_playerstatistics_en.jpg" label="Assess" subtitle="Automatic player statistics" duration={130} />
      </Sequence>

      <Sequence from={820} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatcOps_main_masterrostermodal_en.jpg" label="Roster" subtitle="Manage your squad" duration={130} />
      </Sequence>

      <Sequence from={950} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_cloudSync_en.jpg" label="Sync" subtitle="Your data across devices" duration={130} />
      </Sequence>

      <Sequence from={1080} durationInFrames={120}>
        <CallToAction />
      </Sequence>
    </AbsoluteFill>
  );
};

// Version 1: Main promo
export const PromoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>

      <Sequence from={0} durationInFrames={90}>
        <LogoEntrance />
      </Sequence>

      <Sequence from={90} durationInFrames={120}>
        <ProblemStatement />
      </Sequence>

      <Sequence from={210} durationInFrames={90}>
        <Solution />
      </Sequence>

      <Sequence from={300} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_soccerfield_new_en_fi.jpg" label="Plan" subtitle="Interactive lineup builder" duration={130} />
      </Sequence>

      <Sequence from={430} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_timer_en.jpg" label="Track" subtitle="Timer, subs, goals & assists" duration={130} />
      </Sequence>

      <Sequence from={560} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_goallogs_en.jpg" label="Goals" subtitle="Full match timeline" duration={130} />
      </Sequence>

      <Sequence from={690} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_playerstatistics_en.jpg" label="Assess" subtitle="Automatic player statistics" duration={130} />
      </Sequence>

      <Sequence from={820} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatcOps_main_playerassesments_en.jpg" label="Rate" subtitle="Post-match player ratings" duration={130} />
      </Sequence>

      <Sequence from={950} durationInFrames={130}>
        <FeatureShowcase screenshot="screenshots/MatchOps_main_cloudSync_en.jpg" label="Sync" subtitle="Your data across devices" duration={130} />
      </Sequence>

      <Sequence from={1080} durationInFrames={120}>
        <CallToAction />
      </Sequence>
    </AbsoluteFill>
  );
};
