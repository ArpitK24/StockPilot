import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { getOptionalUser } from "@/server/page-auth";

const LEDGER = [
  ["09:41", "MUG-STN-12", "+48", "Received", "PO-2217"],
  ["09:44", "#1042", "−3", "Reserved", "Oat Latte Mug"],
  ["09:52", "TEA-ASM-50", "−2", "Damaged", "Torn sachets"],
  ["10:03", "#1043", "−12", "Reserved", "Ceramic Pour-over"],
  ["10:05", "#1039", "+6", "Released", "Order cancelled"],
  ["10:17", "BAG-KRF-L", "+200", "Received", "PO-2219"],
  ["10:21", "#1044", "−1", "Reserved", "Gooseneck Kettle"],
  ["10:30", "FLT-V60-02", "−4", "Correction", "Cycle count"],
  ["10:46", "#1045", "−8", "Reserved", "Paper Filters ×100"],
  ["11:02", "GRN-ETH-1K", "+30", "Received", "PO-2220"],
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getOptionalUser()) redirect("/workspaces");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="grain relative hidden overflow-hidden bg-night text-paper lg:flex lg:flex-col">
        <div aria-hidden className="absolute -left-40 -top-40 h-[42rem] w-[42rem] animate-drift rounded-full bg-[radial-gradient(circle_at_center,rgba(255,90,31,0.55),transparent_62%)] blur-2xl" />
        <div aria-hidden className="absolute -bottom-56 right-[-12rem] h-[40rem] w-[40rem] animate-drift rounded-full bg-[radial-gradient(circle_at_center,rgba(46,91,255,0.35),transparent_60%)] blur-2xl [animation-delay:-9s]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_75%)]" />

        <div className="relative z-10 flex flex-1 flex-col p-10 xl:p-14">
          <Logo light />
          <div className="mt-auto max-w-xl">
            <p className="eyebrow !text-night-mute">Inventory &amp; orders for small businesses</p>
            <h1 className="mt-4 font-display text-[4.2rem] leading-[0.95] tracking-tight xl:text-[5.2rem]">
              Every unit,
              <br />
              <em className="text-signal">accounted</em> for.
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-night-mute">
              Orders reserve stock atomically, cancellations give it back exactly once, and every change lands in a ledger you can audit line by line.
            </p>
          </div>

          <div className="relative mt-10 h-56 overflow-hidden rounded-xl border border-night-line bg-night-raised/70 backdrop-blur [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]">
            <div className="animate-ticker">
              {[...LEDGER, ...LEDGER].map(([t, ref, qty, kind, note], i) => (
                <div key={i} className="grid grid-cols-[3.5rem_7.5rem_3.5rem_6rem_1fr] items-center gap-3 border-b border-night-line/70 px-5 py-2.5 font-mono text-xs">
                  <span className="text-night-mute">{t}</span>
                  <span>{ref}</span>
                  <span className={qty.startsWith("+") ? "text-[#5BD08F]" : "text-signal"}>{qty}</span>
                  <span className="text-night-mute">{kind}</span>
                  <span className="truncate text-night-mute/80">{note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-center text-xs text-ink-faint">Synthetic demo data only.</p>
      </main>
    </div>
  );
}
