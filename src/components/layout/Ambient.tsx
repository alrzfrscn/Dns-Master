export function Ambient() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base obsidian wash */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_12%_-10%,#0b1a26_0%,#07090e_46%,#06070b_100%)]" />

      {/* Neon atmosphere */}
      <div className="animate-drift absolute -left-40 -top-52 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(0,240,255,0.16),transparent_62%)] blur-3xl" />
      <div
        className="animate-drift absolute -bottom-64 right-[-12%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.15),transparent_65%)] blur-3xl"
        style={{ animationDelay: "-8s" }}
      />
      <div className="absolute left-[42%] top-[18%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(61,255,192,0.05),transparent_70%)] blur-2xl" />

      {/* Technical grid */}
      <div className="tick-grid absolute inset-0" />

      {/* Top edge light */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/35 to-transparent" />

      {/* Texture */}
      <div className="noise-layer absolute inset-0" />
      <div className="scanlines absolute inset-0" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_50%,transparent_45%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
