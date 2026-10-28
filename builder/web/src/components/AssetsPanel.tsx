import type { Asset } from "../types";

const KIND_LABEL: Record<Asset["kind"], string> = { image: "image", font: "police", document: "PDF" };
const sizeOf = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`);

// Éléments de marque et maquettes existantes pour le designer (logo, images, polices, charte ou
// maquettes en PDF), en lecture : glissés dans le terminal Claude, qui les range dans design/assets/.
export function AssetsPanel({ assets }: { assets: Asset[] }) {
  const images = assets.filter((a) => a.kind === "image");
  const others = assets.filter((a) => a.kind !== "image");
  return (
    <div className="assets">
      <p className="assets__hint">
        Glisse tes fichiers (logo, polices, charte en PDF, maquettes) dans ton terminal Claude : il les range dans <code>design/assets/</code>.
      </p>
      {images.length > 0 && (
        <div className="asset-grid">
          {images.map((a) => {
            const src = `/api/design-file?path=${encodeURIComponent(a.path)}`;
            return (
              <a key={a.path} className="asset" href={src} target="_blank" rel="noreferrer" title={a.name}>
                <img src={src} alt={a.name} loading="lazy" />
                <span>{a.name}</span>
              </a>
            );
          })}
        </div>
      )}
      {others.length > 0 && (
        <ul className="asset-list">
          {others.map((a) => (
            <li key={a.path}>
              <span className="tag">{KIND_LABEL[a.kind]}</span> {a.name} <span className="muted">{sizeOf(a.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
