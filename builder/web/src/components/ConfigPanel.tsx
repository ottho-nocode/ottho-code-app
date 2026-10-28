import { useEffect, useState } from "react";
import { getConfig, saveConfig } from "../api";
import type { ConfigField, ConfigService, ConfigStatus } from "../types";
import { CopyButton } from "./CopyButton";

// Où trouver les valeurs de chaque service.
const WHERE: Record<string, { href: string; text: string }> = {
  supabase: { href: "https://supabase.com/dashboard/project/_/settings/api", text: "Supabase, Project Settings, API" },
  stripe: { href: "https://dashboard.stripe.com/test/apikeys", text: "Stripe, Développeurs, Clés API (mode test)" },
  brevo: { href: "https://app.brevo.com/settings/keys/api", text: "Brevo, SMTP et API, Clés API" },
  resend: { href: "https://resend.com/api-keys", text: "Resend, API Keys" },
};

// Contrôle de forme (conseil, jamais bloquant) : la valeur ressemble-t-elle à ce qui est attendu ?
function warningFor(name: string, value: string): string | null {
  if (!value) return null;
  if (name.endsWith("SUPABASE_URL")) return /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(value) ? null : "Attendu : https://<référence>.supabase.co";
  if (name.endsWith("SUPABASE_ANON_KEY")) return /^(eyJ|sb_publishable_)/.test(value) ? null : "Attendu : une clé « anon » (eyJ…) ou « publishable » (sb_publishable_…).";
  if (name === "SUPABASE_SERVICE_ROLE_KEY") return /^(eyJ|sb_secret_)/.test(value) ? null : "Attendu : une clé « service_role » (eyJ…) ou « secret » (sb_secret_…).";
  if (name.endsWith("STRIPE_PUBLISHABLE_KEY")) return value.startsWith("pk_live_") ? "Clé de production : en développement, utilise pk_test_…" : /^pk_test_/.test(value) ? null : "Attendu : pk_test_…";
  if (name === "STRIPE_SECRET_KEY") return /^(sk|rk)_live_/.test(value) ? "Clé de production : en développement, utilise sk_test_…" : /^(sk|rk)_test_/.test(value) ? null : "Attendu : sk_test_…";
  if (name === "STRIPE_WEBHOOK_SECRET") return /^whsec_/.test(value) ? null : "Attendu : whsec_…";
  if (name === "BREVO_API_KEY") return /^xkeysib-/.test(value) ? null : "Attendu : xkeysib-…";
  if (name === "RESEND_API_KEY") return /^re_/.test(value) ? null : "Attendu : re_…";
  return null;
}

type Saver = (values: Record<string, string | null>) => Promise<string | null>;

function Field({ field, draft, onDraft, onRemove }: { field: ConfigField; draft: string; onDraft: (v: string) => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const warning = warningFor(field.name, draft);
  return (
    <div className="cfg-field">
      <label>
        <span className="cfg-field__label">
          {field.label}
          {field.set ? <span className="cfg-field__set">✓ défini</span> : field.required ? <span className="cfg-field__missing">manquant</span> : null}
        </span>
        <input
          type={field.secret ? "password" : "text"}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          placeholder={field.set && field.secret ? "défini : laisse vide pour garder la valeur" : ""}
          autoComplete="off"
          spellCheck={false}
          aria-label={field.name}
        />
      </label>
      <span className="cfg-field__name">
        {field.name}
        {field.set &&
          (confirm ? (
            <>
              {" "}
              <button type="button" className="linklike danger" onClick={onRemove}>
                confirmer le retrait
              </button>{" "}
              <button type="button" className="linklike" onClick={() => setConfirm(false)}>
                annuler
              </button>
            </>
          ) : (
            <>
              {" "}
              <button type="button" className="linklike" onClick={() => setConfirm(true)}>
                retirer
              </button>
            </>
          ))}
      </span>
      {warning && <span className="cfg-field__warn">{warning}</span>}
    </div>
  );
}

type ServiceProps = {
  service: ConfigService;
  save: Saver;
  // Message gardé par le panneau : la section est recréée (champs vidés) après chaque enregistrement.
  message: string | null;
  setMessage: (m: string | null) => void;
};

function Service({ service, save, message, setMessage }: ServiceProps) {
  const initial = () => Object.fromEntries(service.fields.map((f) => [f.name, f.value ?? ""]));
  const [drafts, setDrafts] = useState<Record<string, string>>(initial);
  const changed = service.fields.filter((f) => drafts[f.name].trim() && drafts[f.name].trim() !== (f.value ?? ""));
  const where = WHERE[service.key];
  const url = service.fields.find((f) => f.name.endsWith("SUPABASE_URL"));
  const anon = service.fields.find((f) => f.name.endsWith("SUPABASE_ANON_KEY"));
  return (
    <section className="cfg-service" aria-label={`Configuration ${service.label}`}>
      <h3>{service.label}</h3>
      {service.fields.map((f) => (
        <Field
          key={f.name}
          field={f}
          draft={drafts[f.name]}
          onDraft={(v) => {
            setDrafts((d) => ({ ...d, [f.name]: v }));
            setMessage(null);
          }}
          onRemove={async () => setMessage(await save({ [f.name]: null }))}
        />
      ))}
      <div className="cfg-service__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!changed.length}
          onClick={async () => {
            setMessage(await save(Object.fromEntries(changed.map((f) => [f.name, drafts[f.name].trim()]))));
          }}
        >
          Enregistrer
        </button>
        {service.key === "supabase" && url && anon && (
          <CopyButton
            text={`Via le MCP Supabase, récupère l'URL et la clé publique (anon ou publishable) du projet Supabase de développement de ce projet, puis écris-les dans .env.local sous ${url.name} et ${anon.name}. S'il y a plusieurs projets, demande-moi lequel choisir. Ne commite jamais .env.local et n'affiche aucune clé secrète.`}
            label="Remplir avec Claude (copier le prompt)"
            title="Prompt à coller dans ton terminal Claude : il remplit l'URL et la clé publique via le MCP Supabase"
          />
        )}
      </div>
      {where && (
        <p className="cfg-service__where">
          Où les trouver :{" "}
          <a href={where.href} target="_blank" rel="noreferrer">
            {where.text} ↗
          </a>
        </p>
      )}
      {message && <p className={message.startsWith("Enregistré") || message.startsWith("Retiré") ? "cfg-ok" : "q__error"}>{message}</p>}
    </section>
  );
}

function Custom({ save }: { save: Saver }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const valid = /^[A-Z][A-Z0-9_]*$/.test(name);
  return (
    <section className="cfg-service" aria-label="Autre variable">
      <h3>Autre variable</h3>
      <div className="cfg-custom">
        <input value={name} onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} placeholder="NOM_DE_LA_VARIABLE" aria-label="Nom de la variable" spellCheck={false} />
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="valeur" aria-label="Valeur de la variable" autoComplete="off" />
        <button
          type="button"
          className="btn btn--primary"
          disabled={!valid || !value.trim()}
          onClick={async () => {
            const result = await save({ [name]: value.trim() });
            setMessage(result);
            if (result?.startsWith("Enregistré")) {
              setName("");
              setValue("");
            }
          }}
        >
          Ajouter
        </button>
      </div>
      {message && <p className={message.startsWith("Enregistré") ? "cfg-ok" : "q__error"}>{message}</p>}
    </section>
  );
}

type Props = { token: string; onClose: () => void };

// Variables de l'app (Supabase, Stripe, e-mails…) écrites dans .env.local, jamais commité.
export function ConfigPanel({ token, onClose }: Props) {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [messages, setMessages] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    void getConfig(token).then((r) => {
      if (!alive) return;
      if (r.ok) setConfig(r.config);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [token, version]);

  const save: Saver = async (values) => {
    const r = await saveConfig(token, values);
    if (!r.ok) return r.message;
    setVersion((v) => v + 1);
    const removed = Object.values(values).every((v) => v === null);
    return `${removed ? "Retiré de" : "Enregistré dans"} ${config?.file ?? ".env.local"}${r.gitignoreUpdated ? " (.env*.local ajouté au .gitignore)" : ""}. Si l'aperçu tourne, relance-le pour qu'il lise les nouvelles valeurs.`;
  };

  return (
    <aside className="card questions-col cfg" aria-label="Configuration des services">
      <header className="questions-col__head">
        <span className="eyebrow">Configuration</span>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Fermer
        </button>
      </header>
      <p className="muted questions-col__sub">
        Écrit dans <code>{config?.file ?? ".env.local"}</code>, ignoré par Git : tes clés ne sont jamais commitées ni réaffichées ici. Les noms des variables
        (sans valeurs) vont dans <code>.env.example</code>.
      </p>
      {error && <p className="q__error">{error}</p>}
      {!config && !error && <p className="muted">Chargement…</p>}
      {config && (
        <>
          {config.services.map((s) => (
            <Service
              key={`${s.key}-${version}`}
              service={s}
              save={save}
              message={messages[s.key] ?? null}
              setMessage={(m) => setMessages((all) => ({ ...all, [s.key]: m }))}
            />
          ))}
          <Custom save={save} />
          {config.other.length > 0 && (
            <p className="muted cfg-other">
              Autres variables définies : <code>{config.other.join(", ")}</code>
            </p>
          )}
        </>
      )}
    </aside>
  );
}
