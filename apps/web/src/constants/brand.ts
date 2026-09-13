/** Marca Connectyx (misma identidad visual que Connectia Admin). */
export const PRODUCT_NAME = "Connectyx";
export const PRODUCT_NAME_ADMIN = "Connectyx Admin";

/** Producto financiero desplegado sobre Connectyx. */
export const SYSTEM_NAME = "SOOFT FINYX";
export const SYSTEM_TAGLINE = "Inteligencia financiera automatizada";
export const SYSTEM_SHORT = "FINYX";

const brandAsset = (rel: string): string =>
  `${import.meta.env.BASE_URL}${String(rel).replace(/^\//, "")}`;

/** Wordmark — fondos oscuros. */
export const PRODUCT_LOGO_SVG = brandAsset("branding/connectyx/connectyx-mark.svg");

/** Wordmark todo blanco — fondos de marca. */
export const PRODUCT_LOGO_ON_BRAND = brandAsset("branding/connectyx/connectyx-mark-on-brand.svg");

/** Wordmark — fondos claros. */
export const PRODUCT_LOGO_LIGHT = brandAsset("branding/connectyx/connectyx-mark-on-light.svg");

/** Isologo para avatar del asistente (misma convención que Connectia Admin). */
export const PRODUCT_ICON = brandAsset("branding/connectyx/connectyx-mark.svg");

/** Logo horizontal SOOFT FINYX (icono + nombre + tagline). */
export const SYSTEM_LOGO = brandAsset("branding/finyx/soft-finyx-logo.png");
