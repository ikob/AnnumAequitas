import { translate } from './i18n.ts';
import type { Locale } from './i18n.ts';
export const DISCLAIMER_VERSION='2026-09-26.2';
export const CONSENT_MAX_AGE=180*24*60*60;
export const consentCookieName=(https:boolean)=>https?'__Host-shikob.net.annum-aequitas-consent':'shikob.net.annum-aequitas-consent-dev';
export function hasConsent(cookies:string,https:boolean) {
 return cookies.split(';').some(part=>part.trim()===`${consentCookieName(https)}=${DISCLAIMER_VERSION}`);
}
export function consentCookie(https:boolean) {
 return `${consentCookieName(https)}=${DISCLAIMER_VERSION}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${https?'; Secure':''}`;
}
export function consentDisplay(locale:Locale,checked:boolean,canReturn:boolean) {
 const tr=(key:Parameters<typeof translate>[1])=>translate(locale,key);
 return `<main class="consent-page"><section class="panel inset"><p class="eyebrow">AnnumAequitas · ${DISCLAIMER_VERSION}</p><label>${tr('language')} <select id="consent-language"><option value="en" ${locale==='en'?'selected':''}>English</option><option value="ja" ${locale==='ja'?'selected':''}>日本語</option></select></label><h1>${tr('consentTitle')}</h1><p>${tr('consentPurpose')}</p><ul><li>${tr('consentEstimate')}</li><li>${tr('consentResponsibility')}</li><li>${tr('consentPrivacy')}</li><li>${tr('consentSave')}</li></ul><p>${tr('consentCookieInfo')}</p><label class="consent-check"><input id="consent-check" type="checkbox" ${checked?'checked':''}> ${tr('consentCheck')}</label><div class="actions"><button id="consent-accept" class="button primary" ${checked?'':'disabled'}>${tr('consentAccept')}</button>${canReturn?`<button id="consent-back" class="button secondary">${tr('consentBack')}</button>`:''}</div></section></main>`;
}
