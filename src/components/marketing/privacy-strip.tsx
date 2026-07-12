import { Lock, Shield, Trash2 } from "lucide-react";

const ITEMS = [
  {
    Icon: Lock,
    title: "Your data, only yours",
    body: "Row-level security is enforced at the database: your portfolio is never visible to any other user or query — even if two accounts hold the same stock.",
  },
  {
    Icon: Shield,
    title: "Encrypted in transit and at rest",
    body: "All traffic runs over HTTPS. Your data is encrypted at rest on the hosting infrastructure.",
  },
  {
    Icon: Trash2,
    title: "Delete everything, permanently",
    body: "Settings → Delete Account removes your portfolio, holdings, research notes, uploaded files and your account instantly. No recovery, no grace period, no archive.",
  },
];

export function PrivacyStrip() {
  return (
    <section
      className="border-y border-privacy/20 bg-privacy/[0.04]"
      aria-label="Data privacy and security"
    >
      <div className="mx-auto max-w-6xl px-4 py-14">
        <p className="mb-8 text-center text-[0.68rem] font-bold uppercase tracking-[0.14em] text-privacy">
          Your financial data stays yours
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {ITEMS.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="flex flex-col gap-3 rounded-2xl border border-privacy/20 bg-card p-5 shadow-soft"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-privacy/10 text-privacy">
                <Icon size={18} aria-hidden />
              </span>
              <p className="text-sm font-bold text-foreground">{title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
