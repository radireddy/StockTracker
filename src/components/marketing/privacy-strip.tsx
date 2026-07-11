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
    <section className="border-t" aria-label="Data privacy and security">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Your financial data stays yours
        </p>
        <div className="grid gap-6 sm:grid-cols-3">
          {ITEMS.map(({ Icon, title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                <Icon size={15} aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
