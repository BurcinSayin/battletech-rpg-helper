import { ImageResponse } from "next/og";

// App icon rendered from code — no binary assets in the repo. Colors are the
// HUD tokens from tailwind.config.ts (hud.bg / hud.amber / hud.line).
const BG = "#0a0a0b";
const AMBER = "#e0a82e";
const LINE = "#2a2a2e";

/**
 * A BattleTech-flavoured targeting reticle with a "BT" monogram.
 *
 * @param size   Square edge length in px.
 * @param inset  Fraction of the canvas kept clear at the edges. Android adaptive
 *               icons crop to a circle, so maskable variants pass ~0.1 to keep the
 *               mark inside the safe zone; normal icons pass 0.
 */
export function AppIcon({ size, inset = 0 }: { size: number; inset?: number }) {
  const pad = Math.round(size * inset);
  const inner = size - pad * 2;
  const ring = Math.max(2, Math.round(inner * 0.045));
  const tick = Math.round(inner * 0.16);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG,
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {/* Reticle ring */}
          <div
            style={{
              position: "absolute",
              width: inner * 0.82,
              height: inner * 0.82,
              borderRadius: "50%",
              border: `${ring}px solid ${AMBER}`,
              display: "flex",
            }}
          />
          {/* Inner ring, dimmer — reads as depth at 192px and vanishes at 32px */}
          <div
            style={{
              position: "absolute",
              width: inner * 0.62,
              height: inner * 0.62,
              borderRadius: "50%",
              border: `${Math.max(1, Math.round(ring / 2))}px solid ${LINE}`,
              display: "flex",
            }}
          />
          {/* Crosshair ticks at 12/3/6/9 o'clock */}
          {[
            { top: 0, left: inner / 2 - ring / 2, width: ring, height: tick },
            { bottom: 0, left: inner / 2 - ring / 2, width: ring, height: tick },
            { left: 0, top: inner / 2 - ring / 2, width: tick, height: ring },
            { right: 0, top: inner / 2 - ring / 2, width: tick, height: ring },
          ].map((pos, i) => (
            <div
              key={i}
              style={{ position: "absolute", background: AMBER, display: "flex", ...pos }}
            />
          ))}
          <div
            style={{
              display: "flex",
              fontSize: inner * 0.34,
              fontWeight: 700,
              letterSpacing: -inner * 0.015,
              color: AMBER,
              fontFamily: "sans-serif",
            }}
          >
            BT
          </div>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
