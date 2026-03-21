export function applyBranding(config = {}) {
  if (typeof document === 'undefined') return;

  const businessName = config.negocio_nombre || 'Modo Sabor';
  document.title = `${businessName} - Sistema`;

  const iconHref = config.negocio_favicon || config.negocio_logo || '';
  if (iconHref) {
    let icon = document.querySelector("link[rel='icon']");
    if (!icon) {
      icon = document.createElement('link');
      icon.setAttribute('rel', 'icon');
      document.head.appendChild(icon);
    }
    icon.setAttribute('href', iconHref);
  }

  if (config.color_primario) {
    document.documentElement.style.setProperty('--ms-brand-primary', config.color_primario);
  }
}
