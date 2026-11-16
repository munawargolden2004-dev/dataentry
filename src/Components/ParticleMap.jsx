const MAP_URL = "https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg";

/**
 * Page backdrop for the admin screens: the soft-white page colour with a very
 * faint grey world map behind the content. Static on purpose — no motion, so
 * it never competes with the data on top of it.
 */
export default function ParticleMap() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-neutral-50" aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.06]">
        <div
          className="w-full h-full max-w-[1400px] max-h-[800px] bg-neutral-900"
          style={{
            WebkitMaskImage: `url('${MAP_URL}')`,
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskImage: `url('${MAP_URL}')`,
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
          }}
        />
      </div>
    </div>
  );
}
